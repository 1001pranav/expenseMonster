import { syncedNowISO } from '@/domain/clock';
import { uuidv7 } from '@/domain/ids';
import { expandExtra, foldUnknown, hasAdoptableExtra, replacesHeld, type HeldRecord } from '@/domain/sync/forward';
import { isNewer } from '@/domain/sync/merge';
import { SYNC_TABLES, type BaseRow, type Peer, type TableMap, type TableName } from '@/domain/types';
import { getDb } from './client';
import { columnsOf, MIGRATIONS } from './schema';
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

const upsertSql = (table: TableName) => {
  const cols = columnsOf(table);
  return `INSERT OR REPLACE INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
};

async function writeRow<K extends TableName>(table: K, row: Row<K>): Promise<void> {
  await getDb().runAsync(upsertSql(table), pick(table, row as unknown as Record<string, unknown>).values);
}

/** Many rows of one table in one transaction and one prepared statement. */
async function writeRows<K extends TableName>(table: K, rows: Row<K>[]): Promise<void> {
  await getDb().transaction((tx) => tx.runManyAsync(upsertSql(table), rows.map((r) => pick(table, r as unknown as Record<string, unknown>).values)));
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
  await writeRows(table, rows);
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

/**
 * Rows exactly as received from another phone (keeps their updatedAt / deviceId). Fields from a
 * newer app version are kept in `extra`.
 */
export async function applyRemote<K extends TableName>(table: K, rows: Row<K>[]): Promise<void> {
  if (!rows.length) return;
  const cols = columnsOf(table);
  const stored = rows.map((r) => foldUnknown(r as unknown as Record<string, unknown>, cols) as unknown as Row<K>);
  await keepReplaced(table, stored);
  await writeRows(table, stored);
  getState().putRows(table, stored);
}

// ── versions replaced by other phones' edits (services/holds.ts) ─────────────

/** Keep the local version of each row another phone's edit is about to replace. */
async function keepReplaced(table: TableName, incoming: { id: string; updatedAt: string }[]): Promise<void> {
  const ids = incoming.map((r) => r.id);
  const local = await getDb().getAllAsync<Record<string, unknown> & { id: string; updatedAt: string }>(`SELECT * FROM "${table}" WHERE id IN (${ids.map(() => '?').join(', ')})`, ids);
  const next = new Map(incoming.map((r) => [r.id, r.updatedAt]));
  const replaced = local.filter((r) => next.get(r.id) !== r.updatedAt);
  if (!replaced.length) return;
  const at = now();
  await getDb().transaction((tx) =>
    tx.runManyAsync(
      'INSERT OR REPLACE INTO row_history (tbl, id, updatedAt, row, savedAt) VALUES (?, ?, ?, ?, ?)',
      replaced.map((r) => [table, r.id, r.updatedAt, JSON.stringify(expandExtra(r)), at]),
    ),
  );
}

/** Earlier versions of a row, newest first. */
export async function historyOf(table: TableName, id: string): Promise<BaseRow[]> {
  const rows = await getDb().getAllAsync<{ row: string }>('SELECT row FROM row_history WHERE tbl = ? AND id = ? ORDER BY updatedAt DESC', [table, id]);
  return rows.map((r) => JSON.parse(r.row));
}

/** Forget replaced versions older than `days`. */
export async function pruneHistory(days: number): Promise<void> {
  await getDb().runAsync('DELETE FROM row_history WHERE savedAt < ?', [new Date(Date.now() - days * 86_400_000).toISOString()]);
}

/**
 * Show this version of a row on this phone only: written as is (its updatedAt kept), and recorded
 * as what every cloud space last synced, so it is not uploaded as an edit.
 */
export async function setLocalVersion(table: TableName, row: BaseRow): Promise<void> {
  await writeRows(table, [foldUnknown(row as unknown as Record<string, unknown>, columnsOf(table)) as never]);
  await getDb().runAsync('UPDATE cloud_records SET updatedAt = ? WHERE tbl = ? AND id = ?', [row.updatedAt, table, row.id]);
}

/** Remove a row from this phone only (no tombstone): it was another phone's, set aside for review. */
export async function dropLocal(table: TableName, id: string): Promise<void> {
  await getDb().runAsync(`DELETE FROM "${table}" WHERE id = ?`, [id]);
}

/** Rows last saved by `deviceId` (all phones when null), in a time range when given, or one row by id. */
export async function rowsSavedBy(table: TableName, by: { deviceId?: string | null; since?: string | null; until?: string | null; id?: string | null }): Promise<BaseRow[]> {
  const filters: [string, string | null | undefined][] = [
    ['id = ?', by.id],
    ['deviceId = ?', by.deviceId],
    ['updatedAt >= ?', by.since],
    ['updatedAt < ?', by.until],
  ];
  const used = filters.filter(([, v]) => v) as [string, string][];
  if (!used.length) return [];
  const where = used.map(([sql]) => sql);
  const params = used.map(([, v]) => v);
  return expanded(await getDb().getAllAsync<BaseRow>(`SELECT * FROM "${table}" WHERE ${where.join(' AND ')}`, params));
}

// ── rows set aside for review (services/holds.ts) ─────────────────────────────

export interface AsideRecord {
  tbl: string;
  row: BaseRow;
  reason: 'invalid' | 'held';
  receivedAt: string;
}

/** Set rows aside instead of applying them; one version per row (`ordered`: as for holdRecords). */
export async function setAside(records: Omit<AsideRecord, 'receivedAt'>[], ordered: boolean): Promise<void> {
  if (!records.length) return;
  const current = new Map((await asideRecords()).map((a) => [`${a.tbl}:${a.row.id}`, a.row]));
  const keep = records.filter((r) => replacesHeld(current.get(`${r.tbl}:${r.row.id}`), r.row, ordered));
  if (!keep.length) return;
  const at = now();
  await getDb().transaction((tx) =>
    tx.runManyAsync('INSERT OR REPLACE INTO aside_records (tbl, id, row, reason, receivedAt) VALUES (?, ?, ?, ?, ?)', keep.map((r) => [r.tbl, r.row.id, JSON.stringify(r.row), r.reason, at])),
  );
}

export async function asideRecords(): Promise<AsideRecord[]> {
  const rows = await getDb().getAllAsync<{ tbl: string; row: string; reason: AsideRecord['reason']; receivedAt: string }>('SELECT tbl, row, reason, receivedAt FROM aside_records ORDER BY receivedAt DESC');
  return rows.map((r) => ({ tbl: r.tbl, row: JSON.parse(r.row), reason: r.reason, receivedAt: r.receivedAt }));
}

export async function releaseAside(table: string, id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM aside_records WHERE tbl = ? AND id = ?', [table, id]);
}

// Rows read for sending or comparing with another phone's carry their `extra` fields unfolded.
const expanded = <T>(rows: T[]): T[] => rows.map((r) => expandExtra(r as Record<string, unknown>) as T);

/** All rows including tombstones, for sync/backup. */
export async function allRows<K extends TableName>(table: K): Promise<Row<K>[]> {
  return expanded(await getDb().getAllAsync<Row<K>>(`SELECT * FROM "${table}"`));
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
  return rows.map(({ __seq, ...row }) => ({ row: expandExtra(row) as unknown as Row<K>, base: __seq ?? 0 }));
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
  await getDb().transaction((tx) =>
    tx.runManyAsync(
      'INSERT OR REPLACE INTO cloud_records (space, tbl, id, seq, updatedAt) VALUES (?, ?, ?, ?, ?)',
      marks.map((m) => [space, m.table, m.id, m.seq, m.updatedAt]),
    ),
  );
}

/** Forget everything synced with a space (it was deleted, or the backup turned off). */
export async function clearSyncMarks(space: string): Promise<void> {
  await getDb().runAsync('DELETE FROM cloud_records WHERE space = ?', [space]);
}

/** Rows by id including tombstones (the in-memory store only holds live rows), in one query. */
export async function rowsByIds<K extends TableName>(table: K, ids: string[]): Promise<Map<string, Row<K>>> {
  if (!ids.length) return new Map();
  const rows = await getDb().getAllAsync<Row<K>>(`SELECT * FROM "${table}" WHERE id IN (${ids.map(() => '?').join(', ')})`, ids);
  return new Map(expanded(rows).map((r) => [r.id, r]));
}

// ── records of tables this version doesn't have (domain/sync/forward.ts) ──────

/** Keep records of unknown tables until an update adds them. `ordered`: from the cloud, in server order. */
export async function holdRecords(records: HeldRecord[], ordered: boolean): Promise<void> {
  if (!records.length) return;
  const held = new Map<string, BaseRow>();
  for (const tbl of new Set(records.map((r) => r.tbl))) {
    const ids = records.filter((r) => r.tbl === tbl).map((r) => r.row.id);
    const rows = await getDb().getAllAsync<{ id: string; row: string }>(`SELECT id, row FROM held_records WHERE tbl = ? AND id IN (${ids.map(() => '?').join(', ')})`, [tbl, ...ids]);
    for (const r of rows) held.set(`${tbl}:${r.id}`, JSON.parse(r.row));
  }
  const keep: HeldRecord[] = [];
  for (const r of records) {
    const k = `${r.tbl}:${r.row.id}`;
    if (!replacesHeld(held.get(k), r.row, ordered)) continue;
    held.set(k, r.row);
    keep.push(r);
  }
  if (!keep.length) return;
  await getDb().transaction((tx) => tx.runManyAsync('INSERT OR REPLACE INTO held_records (tbl, id, row) VALUES (?, ?, ?)', keep.map((r) => [r.tbl, r.row.id, JSON.stringify(r.row)])));
}

/** How many records are waiting for a newer app version. */
export async function heldCount(): Promise<number> {
  return (await getDb().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM held_records'))?.n ?? 0;
}

const ADOPTED_KEY = 'forward.adoptedSchema';

/**
 * After an update (more migrations than last time): apply held records of tables that now exist, and
 * move extra fields into columns that now exist. Bookkeeping, not edits: updatedAt is kept, so
 * nothing looks changed to sync. Runs before the tables are loaded into memory.
 */
export async function adoptForwardData(): Promise<void> {
  const schema = String(MIGRATIONS.length);
  if ((await getMeta(ADOPTED_KEY)) === schema) return;
  const known = new Set<string>(SYNC_TABLES);
  const held = await getDb().getAllAsync<{ tbl: string; id: string; row: string }>('SELECT tbl, id, row FROM held_records');
  for (const tbl of new Set(held.map((h) => h.tbl).filter((t) => known.has(t))) as Set<TableName>) {
    const incoming = held.filter((h) => h.tbl === tbl).map((h) => JSON.parse(h.row) as BaseRow);
    const local = await rowsByIds(tbl, incoming.map((r) => r.id));
    const apply = incoming.filter((r) => !local.has(r.id) || isNewer(r, local.get(r.id)!));
    const cols = columnsOf(tbl);
    if (apply.length) await writeRows(tbl, apply.map((r) => foldUnknown(r as unknown as Record<string, unknown>, cols) as unknown as Row<typeof tbl>));
    await getDb().runAsync(`DELETE FROM held_records WHERE tbl = ?`, [tbl]);
  }
  for (const table of SYNC_TABLES) {
    const cols = columnsOf(table);
    const rows = (await getDb().getAllAsync<Record<string, unknown>>(`SELECT * FROM "${table}" WHERE extra IS NOT NULL`)).filter((r) => hasAdoptableExtra(r, cols));
    if (rows.length) await writeRows(table, rows.map((r) => foldUnknown(expandExtra(r), cols) as unknown as Row<typeof table>));
  }
  await setMeta(ADOPTED_KEY, schema);
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

/** Forget every paired phone (this phone left the household). */
export const forgetPeers = () => getDb().runAsync('DELETE FROM peers');

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
