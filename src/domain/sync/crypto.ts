import { gcm } from '@noble/ciphers/aes.js';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gunzipSync, gzipSync } from 'fflate';
import { randomBytes } from '../ids';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : B64[c & 63];
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => (i + k < clean.length ? B64.indexOf(clean[i + k]) : -1));
    out[o++] = (n[0] << 2) | (n[1] >> 4);
    if (n[2] >= 0) out[o++] = ((n[1] & 15) << 4) | (n[2] >> 2);
    if (n[3] >= 0) out[o++] = ((n[2] & 3) << 6) | n[3];
  }
  return out.slice(0, o);
}

export const newKey = (): Uint8Array => randomBytes(32);

/**
 * Envelope: "EMX1." + base64(nonce[12] | AES-256-GCM(gzip(json))).
 * `aad` (household id) is authenticated but not encrypted, so a bundle from another
 * household — or any tampered byte — fails to decrypt instead of being merged.
 */
export function seal(payload: unknown, key: Uint8Array, aad: string): string {
  const nonce = randomBytes(12);
  const plain = gzipSync(utf8ToBytes(JSON.stringify(payload)));
  const cipher = gcm(key, nonce, utf8ToBytes(aad)).encrypt(plain);
  const joined = new Uint8Array(nonce.length + cipher.length);
  joined.set(nonce);
  joined.set(cipher, nonce.length);
  return `EMX1.${toBase64(joined)}`;
}

export class DecryptError extends Error {}

export function open<T>(envelope: string, key: Uint8Array, aad: string): T {
  const body = envelope.trim();
  if (!body.startsWith('EMX1.')) throw new DecryptError('Not an ExpenseMonster file');
  const bytes = fromBase64(body.slice(5));
  if (bytes.length < 29) throw new DecryptError('File is truncated');
  let plain: Uint8Array;
  try {
    plain = gcm(key, bytes.slice(0, 12), utf8ToBytes(aad)).decrypt(bytes.slice(12));
  } catch {
    throw new DecryptError('Wrong household or the file was modified');
  }
  return JSON.parse(bytesToUtf8(gunzipSync(plain))) as T;
}

/** Passphrase-based key for backups (PBKDF2-SHA256). */
export async function keyFromPassphrase(passphrase: string, salt: Uint8Array, iterations = 120_000): Promise<Uint8Array> {
  return pbkdf2Async(sha256, utf8ToBytes(passphrase.normalize('NFKC')), salt, { c: iterations, dkLen: 32 });
}

/** Salted PIN hash for the app lock. */
export async function hashPin(pin: string, salt: Uint8Array): Promise<string> {
  const key = await pbkdf2Async(sha256, utf8ToBytes(pin), salt, { c: 60_000, dkLen: 32 });
  return toBase64(key);
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Short human-checkable fingerprint of a shared key ("4F2A-91C0"), shown on both phones during pairing. */
export function fingerprint(key: Uint8Array): string {
  const h = sha256(key);
  const hex = Array.from(h.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}
