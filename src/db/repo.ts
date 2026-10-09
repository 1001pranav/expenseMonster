import { syncedNowISO } from '@/domain/clock';
import { uuidv7 } from '@/domain/ids';
import { SYNC_TABLES, type BaseRow, type Peer, type TableMap, type TableName } from '@/domain/types';
import { getDb } from './client';
import { columnsOf } from './schema';
import { DEFAULT_SETTINGS, EMPTY_TABLES, getState, type Identity, type Settings } from './store';
import { logFailure } from '@/services/diagnostics';

type Row<K extends TableName> = TableMap[K];
export type NewRow<K extends TableName> = Omit<Row<K>, keyof BaseRow> & Partial<BaseRow>;

// Bookkeeping times use the server-corrected clock, so every phone orders edits the same way.
const now = syncedNowISO;

function pick(table: TableName, row: Record<string, unknown>) {
  const cols = columnsOf(table);
  const values = cols.map((c) => {
    const v = row[c];
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v as string | number | null;
  });
  return { cols, values };
}

async function writeRow<K extends TableName>(table: K, row: Row<K>): Promise<void> {
  const { cols, values } = pick(table, row as unknown as Record<string, unknown>);
  const placeholders = cols.map(() => '?').join(', ');
  await getDb().runAsync(
    `INSERT OR REPLACE INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
    values,
  );
}

export async function insert<K extends TableName>(table: K, data: NewRow<K>): Promise<Row<K>> {
  const { identity } = getState();
  const ts = now();
  const row = {
    scope: 'household',
    ...data,
    id: data.id ?? uuidv7(),
    createdAt: data.createdAt ?? ts,
    updatedAt: ts,
    deletedAt: null,
    deviceId: identity.deviceId,
  } as Row<K>;
  await writeRow(table, row);
  getState().putRow(table, row);
  return row;
}

export async function insertMany<K extends TableName>(table: K, items: NewRow<K>[]): Promise<Row<K>[]> {
  const { identity } = getState();
  const ts = now();
  const rows = items.map(
    (data) =>
      ({ scope: 'household', ...data, id: data.id ?? uuidv7(), createdAt: data.createdAt ?? ts, updatedAt: data.updatedAt ?? ts, deletedAt: null, deviceId: data.deviceId ?? identity.deviceId }) as Row<K>,
  );
  await getDb().withTransactionAsync(async () => {
    for (const r of rows) await writeRow(table, r);
  });
  getState().putRows(table, rows);
  return rows;
}

export function findById<K extends TableName>(table: K, id: string | null | undefined): Row<K> | undefined {
  if (!id) return undefined;
  return (getState().tables[table] as Row<K>[]).find((r) => r.id === id);
}

export async function update<K extends TableName>(table: K, id: string, patch: Partial<Row<K>>): Promise<Row<K>> {
  const current = findById(table, id) ?? (await getDb().getFirstAsync<Row<K>>(`SELECT * FROM "${table}" WHERE id = ?`, [id]));
  if (!current) throw new Error(`${table} ${id} not found`);
  const row = { ...current, ...patch, id, updatedAt: now(), deviceId: getState().identity.deviceId } as Row<K>;
  await writeRow(table, row);
  getState().putRow(table, row);
  return row;
}

/** Soft delete: the tombstone syncs to other phones. */
export async function remove<K extends TableName>(table: K, id: string): Promise<void> {
  await update(table, id, { deletedAt: now() } as Partial<Row<K>>);
}

export async function restore<K extends TableName>(table: K, id: string): Promise<Row<K>> {
  const row = await getDb().getFirstAsync<Row<K>>(`SELECT * FROM "${table}" WHERE id = ?`, [id]);
  if (!row) throw new Error('Nothing to restore');
  return update(table, id, { ...row, deletedAt: null } as Partial<Row<K>>);
}

/** Rows exactly as received from another phone (keeps their updatedAt / deviceId). */
export async function applyRemote<K extends TableName>(table: K, rows: Row<K>[]): Promise<void> {
  if (!rows.length) return;
  await getDb().withTransactionAsync(async () => {
    for (const r of rows) await writeRow(table, r);
  });
  getState().putRows(table, rows);
}

/** All rows including tombstones, for sync/backup. */
export async function allRows<K extends TableName>(table: K): Promise<Row<K>[]> {
  return getDb().getAllAsync<Row<K>>(`SELECT * FROM "${table}"`);
}

export async function loadTables() {
  const tables = { ...EMPTY_TABLES };
  for (const name of SYNC_TABLES) {
    const rows = await getDb().getAllAsync(`SELECT * FROM "${name}" WHERE deletedAt IS NULL ORDER BY id DESC`);
    (tables as Record<string, unknown[]>)[name] = rows;
  }
  return tables;
}

// ── per-record cloud sync state (services/cloud.ts) ────────────────────────

export interface SyncMark {
  seq: number;
  updatedAt: string;
}

/**
 * Rows changed on this phone since they were last synced to `space` (or never synced), with the
 * seq of the server version they were edited from (0 = new). Paged by id. `scope`: household rows
 * only (family sync) or every row (personal backup).
 */
export async function dirtyRows<K extends TableName>(space: string, table: K, afterId: string, limit: number, scope: 'household' | 'all' = 'household'): Promise<{ row: Row<K>; base: number }[]> {
  const rows = await getDb().getAllAsync<Row<K> & { __seq: number | null }>(
    `SELECT t.*, c.seq AS __seq FROM "${table}" t LEFT JOIN cloud_records c ON c.space = ? AND c.tbl = ? AND c.id = t.id
     WHERE (? = 'all' OR t.scope = 'household') AND t.id > ? AND (c.id IS NULL OR c.updatedAt <> t.updatedAt) ORDER BY t.id LIMIT ?`,
    [space, table, scope, afterId, limit],
  );
  return rows.map(({ __seq, ...row }) => ({ row: row as unknown as Row<K>, base: __seq ?? 0 }));
}

/** Sync marks for many records of one table in one query (each query is a native statement; keep them few). */
export async function getSyncMarks(space: string, table: TableName, ids: string[]): Promise<Map<string, SyncMark>> {
  if (!ids.length) return new Map();
  const rows = await getDb().getAllAsync<SyncMark & { id: string }>(
    `SELECT id, seq, updatedAt FROM cloud_records WHERE space = ? AND tbl = ? AND id IN (${ids.map(() => '?').join(', ')})`,
    [space, table, ...ids],
  );
  return new Map(rows.map((r) => [r.id, { seq: r.seq, updatedAt: r.updatedAt }]));
}

export async function setSyncMarks(space: string, marks: { table: TableName; id: string; seq: number; updatedAt: string }[]): Promise<void> {
  if (!marks.length) return;
  await getDb().withTransactionAsync(async () => {
    // One prepared statement for the whole batch rather than one per row.
    const stmt = await getDb().prepareAsync('INSERT OR REPLACE INTO cloud_records (space, tbl, id, seq, updatedAt) VALUES (?, ?, ?, ?, ?)');
    try {
      for (const m of marks) await stmt.executeAsync([space, m.table, m.id, m.seq, m.updatedAt]);
    } finally {
      await stmt.finalizeAsync();
    }
  });
}

/** Forget everything synced with a space (it was deleted, or the backup turned off). */
export async function clearSyncMarks(space: string): Promise<void> {
  await getDb().runAsync('DELETE FROM cloud_records WHERE space = ?', [space]);
}

/** Rows by id including tombstones (the in-memory store only holds live rows), in one query. */
export async function rowsByIds<K extends TableName>(table: K, ids: string[]): Promise<Map<string, Row<K>>> {
  if (!ids.length) return new Map();
  const rows = await getDb().getAllAsync<Row<K>>(`SELECT * FROM "${table}" WHERE id IN (${ids.map(() => '?').join(', ')})`, ids);
  return new Map(rows.map((r) => [r.id, r]));
}

// ── meta (device-local key/value, never synced) ────────────────────────────

export async function getMeta(key: string): Promise<string | null> {
  const row = await getDb().getFirstAsync<{ value: string | null }>('SELECT value FROM meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string | null): Promise<void> {
  await getDb().runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
}

export async function loadIdentity(): Promise<Identity> {
  const get = async (k: string) => (await getMeta(k)) ?? '';
  return {
    deviceId: await get('deviceId'),
    deviceName: await get('deviceName'),
    householdId: await get('householdId'),
    householdName: await get('householdName'),
    selfMemberId: await get('selfMemberId'),
    onboarded: (await get('onboarded')) === '1',
  };
}

export async function saveIdentity(patch: Partial<Identity>): Promise<void> {
  for (const [k, v] of Object.entries(patch)) {
    await setMeta(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }
  getState().setIdentity(patch);
}

export async function loadSettings(): Promise<Settings> {
  const raw = await getMeta('settings');
  try {
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch (e) {
    logFailure('settings unreadable, using defaults', e);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const next = { ...getState().settings, ...patch };
  await setMeta('settings', JSON.stringify(next));
  getState().setSettings(patch);
}

// ── peers ──────────────────────────────────────────────────────────────────

export const listPeers = () => getDb().getAllAsync<Peer>('SELECT * FROM peers ORDER BY pairedAt');

export async function upsertPeer(peer: Partial<Peer> & { deviceId: string; name: string }): Promise<void> {
  const existing = await getDb().getFirstAsync<Peer>('SELECT * FROM peers WHERE deviceId = ?', [peer.deviceId]);
  const row: Peer = { lastSentAt: null, lastReceivedAt: null, pairedAt: now(), ...existing, ...peer };
  await getDb().runAsync('INSERT OR REPLACE INTO peers (deviceId, name, lastSentAt, lastReceivedAt, pairedAt) VALUES (?, ?, ?, ?, ?)', [
    row.deviceId,
    row.name,
    row.lastSentAt,
    row.lastReceivedAt,
    row.pairedAt,
  ]);
}
