import { syncedNowISO } from '../clock';
import { SYNC_TABLES, type BaseRow, type TableName } from '../types';
import { fromBase64, toBase64 } from './crypto';

export interface Bundle {
  v: 1;
  kind: 'delta' | 'backup';
  householdId: string;
  fromDeviceId: string;
  fromName: string;
  createdAt: string;
  since: string | null;
  tables: Partial<Record<TableName, BaseRow[]>>;
}

/**
 * Household rows changed after `since`. Personal rows never leave the phone in a delta;
 * a backup (`kind: 'backup'`) includes everything.
 */
export function buildBundle(
  rows: Partial<Record<TableName, BaseRow[]>>,
  opts: { householdId: string; deviceId: string; deviceName: string; since: string | null; kind?: Bundle['kind']; now?: string },
): Bundle {
  const kind = opts.kind ?? 'delta';
  const tables: Bundle['tables'] = {};
  for (const name of SYNC_TABLES) {
    const list = (rows[name] ?? []).filter(
      (r) => (kind === 'backup' || r.scope === 'household') && (opts.since === null || r.updatedAt > opts.since),
    );
    if (list.length) tables[name] = list;
  }
  return {
    v: 1,
    kind,
    householdId: opts.householdId,
    fromDeviceId: opts.deviceId,
    fromName: opts.deviceName,
    // Becomes the receiver's "last synced with this phone" mark, compared with updatedAt: same clock.
    createdAt: opts.now ?? syncedNowISO(),
    since: opts.since,
    tables,
  };
}

export const bundleSize = (b: Bundle) => Object.values(b.tables).reduce((a, rows) => a + (rows?.length ?? 0), 0);

export function validateBundle(value: unknown): Bundle {
  const b = value as Bundle;
  if (!b || b.v !== 1 || typeof b.householdId !== 'string' || typeof b.tables !== 'object') throw new Error('Unsupported file version');
  for (const key of Object.keys(b.tables)) {
    if (!SYNC_TABLES.includes(key as TableName)) throw new Error(`Unknown table ${key}`);
    const rows = b.tables[key as TableName]!;
    if (!Array.isArray(rows) || rows.some((r) => typeof r?.id !== 'string' || typeof r?.updatedAt !== 'string')) {
      throw new Error(`Malformed rows in ${key}`);
    }
  }
  return b;
}

/** QR payload for pairing a new phone into the household. */
export interface PairPayload {
  t: 'emx-pair';
  v: 1;
  householdId: string;
  householdName: string;
  deviceId: string;
  deviceName: string;
  key: string;
  /** The inviting phone uses cloud sync: the joining phone turns it on too. Absent in older codes. */
  cloud?: boolean;
}

export function encodePair(p: Omit<PairPayload, 't' | 'v' | 'key'>, key: Uint8Array): string {
  // Omit the flag when off so the code stays the same as before; older apps ignore it anyway.
  const { cloud, ...rest } = p;
  const payload: PairPayload = { t: 'emx-pair', v: 1, ...rest, ...(cloud ? { cloud: true } : {}), key: toBase64(key) };
  return JSON.stringify(payload);
}

export function decodePair(text: string): { payload: PairPayload; key: Uint8Array } {
  let p: PairPayload;
  try {
    p = JSON.parse(text);
  } catch {
    throw new Error('This QR code is not an ExpenseMonster pairing code');
  }
  if (p?.t !== 'emx-pair' || p.v !== 1 || !p.householdId || !p.key) throw new Error('This QR code is not an ExpenseMonster pairing code');
  const key = fromBase64(p.key);
  if (key.length !== 32) throw new Error('Pairing code is damaged');
  return { payload: p, key };
}
