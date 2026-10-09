import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import { syncedNowISO, syncedNowMs } from '@/domain/clock';
import { randomBytes } from '@/domain/ids';
import { buildBundle, bundleSize, validateBundle, type Bundle } from '@/domain/sync/bundle';
import { fromBase64, keyFromPassphrase, open, seal, toBase64 } from '@/domain/sync/crypto';
import { planMerge, type ConflictPolicy } from '@/domain/sync/merge';
import { SYNC_TABLES, type BaseRow, type Peer, type TableName } from '@/domain/types';
import { allRows, applyRemote, getMeta, listPeers, loadTables, saveIdentity, setMeta, update, upsertPeer } from '@/db/repo';
import { getState } from '@/db/store';
import { logFailure } from './diagnostics';
import { writeCacheFile } from './files';
import { getHouseholdKey, setHouseholdKey } from './secure';

export async function collectRows(): Promise<Partial<Record<TableName, BaseRow[]>>> {
  const out: Partial<Record<TableName, BaseRow[]>> = {};
  for (const t of SYNC_TABLES) out[t] = (await allRows(t)) as BaseRow[];
  return out;
}

async function shareFile(file: File, title: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/octet-stream', dialogTitle: title, UTI: 'public.data' });
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

/**
 * Encrypt household changes since the last send to `peer` (or everything shared, when
 * no peer is given) and open the share sheet (WhatsApp / Nearby Share / Bluetooth / email).
 */
export async function sendChanges(peer: Peer | null): Promise<{ rows: number }> {
  const key = await getHouseholdKey();
  if (!key) throw new Error('Household key missing');
  const { identity } = getState();
  const since = peer?.lastSentAt ?? null;
  const startedAt = syncedNowISO();
  const bundle = buildBundle(await collectRows(), {
    householdId: identity.householdId,
    deviceId: identity.deviceId,
    deviceName: identity.deviceName,
    since,
  });
  const file = writeCacheFile(`ExpenseMonster-${identity.deviceName.replace(/\W+/g, '')}-${stamp()}.emx`, seal(bundle, key, identity.householdId));
  await shareFile(file, peer ? `Send to ${peer.name}` : 'Send household data');
  if (peer) await upsertPeer({ ...peer, lastSentAt: startedAt });
  return { rows: bundleSize(bundle) };
}

export interface ImportResult {
  from: string;
  inserted: number;
  updated: number;
  skipped: number;
  /** Settled automatically by the chosen policy. */
  autoResolved: number;
  /** Waiting for the user to pick (policy "ask"). */
  pendingConflicts: number;
  /** Minutes the sender's clock appeared to be ahead of ours (timestamps are UTC). */
  clockAheadMinutes: number;
}

export interface PendingConflict {
  table: TableName;
  from: string;
  local: BaseRow;
  incoming: BaseRow;
}

const CONFLICTS_KEY = 'pendingConflicts';

export async function loadConflicts(): Promise<PendingConflict[]> {
  try {
    return JSON.parse((await getMeta(CONFLICTS_KEY)) ?? '[]');
  } catch (e) {
    logFailure('sync: pending conflicts unreadable, ignoring them', e);
    return [];
  }
}

const saveConflicts = (list: PendingConflict[]) => setMeta(CONFLICTS_KEY, JSON.stringify(list));

let mergeQueue: Promise<unknown> = Promise.resolve();

/**
 * Merges read the local rows and then write; household cloud sync, the personal backup and file
 * imports can all run at once, so they take turns.
 */
export function mergeBundle(bundle: Bundle, policy: ConflictPolicy): Promise<Omit<ImportResult, 'from' | 'clockAheadMinutes'>> {
  const run = mergeQueue.then(() => mergeBundleNow(bundle, policy));
  mergeQueue = run.catch(() => {});
  return run;
}

async function mergeBundleNow(bundle: Bundle, policy: ConflictPolicy): Promise<Omit<ImportResult, 'from' | 'clockAheadMinutes'>> {
  const peers = await listPeers();
  const lastSync = peers.find((p) => p.deviceId === bundle.fromDeviceId)?.lastReceivedAt ?? null;
  const totals = { inserted: 0, updated: 0, skipped: 0, autoResolved: 0, pendingConflicts: 0 };
  // Conflicts are kept (not applied) until the user picks; newer files replace older pending ones.
  const pending = new Map((await loadConflicts()).map((c) => [`${c.table}:${c.local.id}`, c]));
  for (const table of SYNC_TABLES) {
    const incoming = bundle.tables[table];
    if (!incoming?.length) continue;
    const local = new Map((await allRows(table)).map((r) => [r.id, r as BaseRow]));
    const plan = planMerge(local, incoming, lastSync, policy);
    await applyRemote(table, [...plan.inserts, ...plan.updates] as never[]);
    totals.inserted += plan.inserts.length;
    totals.updated += plan.updates.length;
    totals.skipped += plan.skipped;
    totals.autoResolved += plan.autoResolved;
    for (const c of plan.conflicts) pending.set(`${table}:${c.local.id}`, { table, from: bundle.fromName, local: c.local, incoming: c.incoming });
  }
  totals.pendingConflicts = pending.size;
  await saveConflicts([...pending.values()]);
  return totals;
}

/** Keep my version (re-stamped now, so it wins on the other phone after the next send) or take theirs. */
export async function resolveConflicts(keys: string[], choice: 'mine' | 'theirs'): Promise<number> {
  const list = await loadConflicts();
  const chosen = new Set(keys);
  const rest: PendingConflict[] = [];
  for (const c of list) {
    if (!chosen.has(`${c.table}:${c.local.id}`)) {
      rest.push(c);
      continue;
    }
    if (choice === 'theirs') await applyRemote(c.table, [c.incoming] as never[]);
    else await update(c.table, c.local.id, {} as never);
  }
  await saveConflicts(rest);
  return rest.length;
}

/** Import a .emx file received from another phone in this household. */
export async function importChanges(uri: string): Promise<ImportResult> {
  return importSealed(await new File(uri).text());
}

/** Decrypt and merge one sealed delta, whether it came from a file or the cloud mailbox. */
export async function importSealed(text: string): Promise<ImportResult> {
  const key = await getHouseholdKey();
  if (!key) throw new Error('Household key missing');
  const { identity } = getState();
  const bundle = validateBundle(open<Bundle>(text, key, identity.householdId));
  if (bundle.kind !== 'delta') throw new Error('This is a backup file. Use Restore backup instead.');
  if (bundle.fromDeviceId === identity.deviceId) throw new Error('This file was sent from this phone');
  const result = await mergeBundle(bundle, getState().settings.syncConflictPolicy);
  await upsertPeer({ deviceId: bundle.fromDeviceId, name: bundle.fromName, lastReceivedAt: bundle.createdAt });
  // All timestamps are UTC, so only a wrong phone clock can make "newest" pick the wrong edit.
  const clockAheadMinutes = Math.max(0, Math.round((Date.parse(bundle.createdAt) - syncedNowMs()) / 60_000));
  return { from: bundle.fromName, ...result, clockAheadMinutes };
}

/** Join another phone's household (after scanning its pairing QR). */
export async function joinHousehold(p: { householdId: string; householdName: string; deviceId: string; deviceName: string }, key: Uint8Array) {
  await setHouseholdKey(key);
  await saveIdentity({ householdId: p.householdId, householdName: p.householdName });
  await upsertPeer({ deviceId: p.deviceId, name: p.deviceName });
}

// ── encrypted backups ────────────────────────────────────────────────────

interface BackupEnvelope {
  t: 'emx-backup';
  v: 1;
  salt: string;
  data: string;
}

const BACKUP_AAD = 'emx-backup-v1';

export async function createBackup(passphrase: string): Promise<void> {
  if (passphrase.length < 8) throw new Error('Use at least 8 characters');
  const { identity } = getState();
  const salt = randomBytes(16);
  const key = await keyFromPassphrase(passphrase, salt);
  const bundle = buildBundle(await collectRows(), {
    householdId: identity.householdId,
    deviceId: identity.deviceId,
    deviceName: identity.deviceName,
    since: null,
    kind: 'backup',
  });
  const envelope: BackupEnvelope = { t: 'emx-backup', v: 1, salt: toBase64(salt), data: seal(bundle, key, BACKUP_AAD) };
  const file = writeCacheFile(`ExpenseMonster-backup-${stamp()}.emxbak`, JSON.stringify(envelope));
  await shareFile(file, 'Save encrypted backup');
}

export async function restoreBackup(uri: string, passphrase: string): Promise<ImportResult> {
  const text = await new File(uri).text();
  let env: BackupEnvelope;
  try {
    env = JSON.parse(text);
  } catch {
    throw new Error('Not an ExpenseMonster backup');
  }
  if (env.t !== 'emx-backup') throw new Error('Not an ExpenseMonster backup');
  const key = await keyFromPassphrase(passphrase, fromBase64(env.salt));
  const bundle = validateBundle(open<Bundle>(env.data, key, BACKUP_AAD));
  const result = await mergeBundle(bundle, 'newest');
  getState().setAll(await loadTables(), getState().identity, getState().settings);
  return { from: bundle.fromName, ...result, clockAheadMinutes: 0 };
}

/** CSV export of confirmed transactions for spreadsheets / CA. */
export async function exportCsv(fromYmd: string, toYmd: string): Promise<number> {
  const { tables } = getState();
  const cat = new Map(tables.categories.map((c) => [c.id, c.name]));
  const acc = new Map(tables.accounts.map((a) => [a.id, a.name]));
  const card = new Map(tables.cards.map((c) => [c.id, c.name]));
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    // Prevent CSV formula injection when opened in Excel / Sheets.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const rows = tables.transactions
    .filter((t) => t.status === 'confirmed' && t.occurredAt.slice(0, 10) >= fromYmd && t.occurredAt.slice(0, 10) <= toYmd)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const lines = [
    ['Date', 'Type', 'Amount (INR)', 'Category', 'Payee', 'Method', 'Account', 'Card', 'Note', 'UPI ref'].join(','),
    ...rows.map((t) =>
      [t.occurredAt.slice(0, 10), t.type, (t.amount / 100).toFixed(2), cat.get(t.categoryId ?? '') ?? '', t.payee, t.method, acc.get(t.accountId ?? '') ?? '', card.get(t.cardId ?? '') ?? '', t.note, t.sourceRef]
        .map(esc)
        .join(','),
    ),
  ];
  const file = writeCacheFile(`ExpenseMonster-${fromYmd}-to-${toYmd}.csv`, lines.join('\n'));
  await shareFile(file, 'Export transactions');
  return rows.length;
}
