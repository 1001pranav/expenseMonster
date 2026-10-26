import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/ciphers/utils.js';
import { randomBytes } from '../ids';
import { fromBase64, open, seal, toBase64 } from './crypto';

/**
 * Handing a new household key to each remaining phone when the head removes one
 * (services/rotation.ts). Every phone has an X25519 key pair; the private half never leaves its
 * secure storage, the public half is published in its device record. The new key is sealed to each
 * remaining phone's public key (ephemeral X25519 → HKDF-SHA256 → AES-256-GCM), so the removed
 * phone, which can still read everything sent under the old key, can't open any of the grants.
 */

export interface DeviceKeys {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

export function newDeviceKeys(): DeviceKeys {
  const secretKey = randomBytes(32);
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) };
}

export const publicKeyOf = (secretKey: Uint8Array) => x25519.getPublicKey(secretKey);

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** Names a household key without revealing it: phones compare it to see whether theirs is current. */
export const keyIdOf = (key: Uint8Array) => hex(hkdf(sha256, key, undefined, utf8ToBytes('emx-key-id-v1'), 16));

// Bound to the household, the recipient and the key: a grant copied to another phone or key won't open.
const grantAad = (householdId: string, recipient: string, keyId: string) => `emx-grant-v1:${householdId}:${recipient}:${keyId}`;

function boxKey(shared: Uint8Array, ephemeral: Uint8Array, recipient: Uint8Array): Uint8Array {
  const salt = new Uint8Array(64);
  salt.set(ephemeral);
  salt.set(recipient, 32);
  return hkdf(sha256, shared, salt, utf8ToBytes('emx-key-grant-v1'), 32);
}

/** Seal `key` so that only the phone holding the secret half of `recipientPublic` can open it. */
export function sealGrant(key: Uint8Array, recipientPublic: Uint8Array, to: { householdId: string; recipient: string }): string {
  const ephemeral = randomBytes(32);
  const ephemeralPublic = x25519.getPublicKey(ephemeral);
  const box = boxKey(x25519.getSharedSecret(ephemeral, recipientPublic), ephemeralPublic, recipientPublic);
  return `${toBase64(ephemeralPublic)}.${seal({ k: toBase64(key) }, box, grantAad(to.householdId, to.recipient, keyIdOf(key)))}`;
}

/** Open a grant addressed to this phone; the key must be the one `keyId` names. Throws otherwise. */
export function openGrant(sealed: string, mine: DeviceKeys, at: { householdId: string; recipient: string; keyId: string }): Uint8Array {
  const dot = sealed.indexOf('.');
  if (dot < 0) throw new Error('Damaged key grant');
  const ephemeralPublic = fromBase64(sealed.slice(0, dot));
  const box = boxKey(x25519.getSharedSecret(mine.secretKey, ephemeralPublic), ephemeralPublic, mine.publicKey);
  const key = fromBase64(open<{ k: string }>(sealed.slice(dot + 1), box, grantAad(at.householdId, at.recipient, at.keyId)).k);
  if (key.length !== 32 || keyIdOf(key) !== at.keyId) throw new Error('Key grant does not match the household key');
  return key;
}
