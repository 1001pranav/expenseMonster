import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/ciphers/utils.js';
import { randomBytes } from '../ids';
import { SYNC_TABLES } from '../types';
import type { Bundle } from './bundle';
import { fromBase64, open, seal, toBase64 } from './crypto';

/**
 * Personal cloud backup ("vault"): one snapshot of everything on the phone, private entries
 * included, sealed with a key derived from a password only the user knows. The server stores the
 * ciphertext, the salt and a hash of a random write token; never the password or the key.
 *
 * The vault is found by a random recovery code, not by the password, so two users with the same
 * password never collide and nobody can probe the server with password guesses.
 */

/** PBKDF2-SHA256 rounds for new vaults. Stored per vault, so it can be raised later. */
export const VAULT_ITERATIONS = 300_000;
export const VAULT_MIN_PASSWORD = 10;

// Crockford base32: no I, L, O or U, so the code survives being read aloud or written down.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_BYTES = 15;

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = ((value << 8) | b) & 0xfff;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(text: string): Uint8Array | null {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text) {
    const v = B32.indexOf(ch);
    if (v < 0) return null;
    value = ((value << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** New random vault: 120-bit id, shown to the user as "XXXX-XXXX-XXXX-XXXX-XXXX-XXXX". */
export function newVaultId(): string {
  return hex(randomBytes(CODE_BYTES));
}

export function formatRecoveryCode(vaultId: string): string {
  const bytes = Uint8Array.from(vaultId.match(/../g) ?? [], (h) => parseInt(h, 16));
  return toBase32(bytes).match(/.{1,4}/g)!.join('-');
}

/** Accepts what people actually type: any case, spaces or dashes, O for 0, I/L for 1. */
export function parseRecoveryCode(code: string): string | null {
  const clean = code.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (clean.length !== 24) return null;
  const bytes = fromBase32(clean);
  return bytes && bytes.length === CODE_BYTES ? hex(bytes) : null;
}

/** What is inside the sealed payload. The write token travels with the data so a restored phone can keep updating the vault. */
export interface VaultContents {
  v: 1;
  token: string;
  bundle: Bundle;
}

/** Binds the ciphertext to its vault, so a payload copied into another vault fails to open. */
const aad = (vaultId: string) => `emx-vault-v1:${vaultId}`;

export const sealVault = (contents: VaultContents, key: Uint8Array, vaultId: string) => seal(contents, key, aad(vaultId));
export const openVault = (payload: string, key: Uint8Array, vaultId: string) => open<VaultContents>(payload, key, aad(vaultId));

export const newWriteToken = () => toBase64(randomBytes(32));
export const newSalt = () => toBase64(randomBytes(16));
export const saltBytes = (salt: string) => fromBase64(salt);

/**
 * Order-independent digest of the rows in a bundle, used to skip uploads when nothing changed.
 * Bookkeeping fields of the bundle itself (createdAt, device) are left out on purpose.
 */
export function contentDigest(tables: Bundle['tables']): string {
  const h = sha256.create();
  for (const name of SYNC_TABLES) {
    const rows = [...(tables[name] ?? [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const r of rows) {
      const keys = Object.keys(r).sort();
      h.update(utf8ToBytes(`${name}\u0000${JSON.stringify(keys.map((k) => [k, (r as unknown as Record<string, unknown>)[k] ?? null]))}\n`));
    }
  }
  return hex(h.digest());
}
