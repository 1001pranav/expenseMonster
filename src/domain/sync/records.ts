import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/ciphers/utils.js';
import type { BaseRow, TableName } from '../types';
import { open, seal } from './crypto';
import { isNewer, sameContent, type ConflictPolicy } from './merge';

/**
 * Cloud sync, one server row per record (supabase/migrations/…_emx_records.sql), in a "space":
 * the household's shared one, or one person's backup. Everything the server sees is derived one-way
 * from the space's key (the household key, or the backup's data key), which only its phones hold:
 * the space id (where its records live), the write token (proof of membership) and each record's
 * key (an HMAC of table + id, so the server can't tell record types apart or read the creation
 * time inside UUIDv7 ids).
 */

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const derive = (key: Uint8Array, context: string, label: string) => hkdf(sha256, key, utf8ToBytes(context), utf8ToBytes(label), 32);

export interface Space {
  id: string;
  token: string;
  macKey: Uint8Array;
  key: Uint8Array;
}

function deriveSpace(key: Uint8Array, context: string): Space {
  return {
    id: hex(derive(key, context, 'emx-space-id-v1')),
    token: hex(derive(key, context, 'emx-space-token-v1')),
    macKey: derive(key, context, 'emx-record-key-v1'),
    key,
  };
}

/** The family's shared records, under the household key. */
export const householdSpace = (key: Uint8Array, householdId: string): Space => deriveSpace(key, householdId);

/** One person's backup records (private entries included), under the backup's random data key. */
export const backupSpace = (dataKey: Uint8Array, vaultId: string): Space => deriveSpace(dataKey, `vault:${vaultId}`);

export const recordKey = (space: Space, table: TableName, id: string) => hex(hmac(sha256, space.macKey, utf8ToBytes(`${table}\u0000${id}`)));

interface Sealed {
  t: TableName;
  r: BaseRow;
}

// Bound to the space and record key: a payload moved to another record or household won't open.
const aad = (space: Space, rkey: string) => `emx-rec-v1:${space.id}:${rkey}`;

export const sealRecord = (space: Space, table: TableName, row: BaseRow) => seal({ t: table, r: row } satisfies Sealed, space.key, aad(space, recordKey(space, table, row.id)));

export function openRecord(space: Space, rkey: string, payload: string): Sealed {
  const rec = open<Sealed>(payload, space.key, aad(space, rkey));
  // The key is an HMAC of (table, id): a valid payload must name the same record.
  if (!rec?.r?.id || recordKey(space, rec.t, rec.r.id) !== rkey) throw new Error('Record does not match its key');
  return rec;
}

/**
 * What to do with a record pulled from the server. `dirty` means this phone changed the row since
 * it last synced it, i.e. both sides edited: a real conflict, settled by the user's policy.
 * Otherwise the server's version is simply newer (it has a higher seq), whatever the clocks say.
 */
export type RecordAction =
  | { kind: 'insert' }
  | { kind: 'update'; autoResolved: boolean }
  /** Same content: nothing to write, just remember the seq. */
  | { kind: 'same' }
  /** Local edit wins the conflict: keep it; it is pushed on top of the server's version. */
  | { kind: 'keep' }
  /** Policy "ask": set aside for the user. */
  | { kind: 'conflict' };

export function planRecord(local: BaseRow | undefined, incoming: BaseRow, dirty: boolean, policy: ConflictPolicy): RecordAction {
  if (!local) return { kind: 'insert' };
  if (sameContent(local, incoming)) return { kind: 'same' };
  if (!dirty) return { kind: 'update', autoResolved: false };
  if (policy === 'ask') return { kind: 'conflict' };
  if (policy === 'incoming' || isNewer(incoming, local)) return { kind: 'update', autoResolved: true };
  return { kind: 'keep' };
}
