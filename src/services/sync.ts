import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import { randomBytes } from '@/domain/ids';
import { buildBundle, bundleSize, validateBundle, type Bundle } from '@/domain/sync/bundle';
import { fromBase64, keyFromPassphrase, open, seal, toBase64 } from '@/domain/sync/crypto';
import { planMerge } from '@/domain/sync/merge';
import { SYNC_TABLES, type BaseRow, type Peer, type TableName } from '@/domain/types';
import { allRows, applyRemote, listPeers, loadTables, saveIdentity, upsertPeer } from '@/db/repo';
import { getState } from '@/db/store';
import { writeCacheFile } from './files';
import { getHouseholdKey, setHouseholdKey } from './secure';

async function collectRows(): Promise<Partial<Record<TableName, BaseRow[]>>> {
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
  const startedAt = new Date().toISOString();
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
  conflicts: number;
}

async function mergeBundle(bundle: Bundle): Promise<Omit<ImportResult, 'from'>> {
  const peers = await listPeers();
  const lastSync = peers.find((p) => p.deviceId === bundle.fromDeviceId)?.lastReceivedAt ?? null;
  const totals = { inserted: 0, updated: 0, skipped: 0, conflicts: 0 };
  for (const table of SYNC_TABLES) {
    const incoming = bundle.tables[table];
    if (!incoming?.length) continue;
    const local = new Map((await allRows(table)).map((r) => [r.id, r as BaseRow]));
    const plan = planMerge(local, incoming, lastSync);
    await applyRemote(table, [...plan.inserts, ...plan.updates] as never[]);
    totals.inserted += plan.inserts.length;
    totals.updated += plan.updates.length;
    totals.skipped += plan.skipped;
    totals.conflicts += plan.conflicts;
  }
  return totals;
}

/** Import a .emx file received from another phone in this household. */
export async function importChanges(uri: string): Promise<ImportResult> {
  const key = await getHouseholdKey();
  if (!key) throw new Error('Household key missing');
  const { identity } = getState();
  const text = await new File(uri).text();
  const bundle = validateBundle(open<Bundle>(text, key, identity.householdId));
  if (bundle.kind !== 'delta') throw new Error('This is a backup file. Use Restore backup instead.');
  if (bundle.fromDeviceId === identity.deviceId) throw new Error('This file was sent from this phone');
  const result = await mergeBundle(bundle);
  await upsertPeer({ deviceId: bundle.fromDeviceId, name: bundle.fromName, lastReceivedAt: bundle.createdAt });
  return { from: bundle.fromName, ...result };
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
  const result = await mergeBundle(bundle);
  getState().setAll(await loadTables(), getState().identity, getState().settings);
  return { from: bundle.fromName, ...result };
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
