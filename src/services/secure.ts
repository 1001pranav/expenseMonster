import * as SecureStore from 'expo-secure-store';
import { randomBytes } from '@/domain/ids';
import { fromBase64, hashPin, safeEqual, toBase64 } from '@/domain/sync/crypto';

/** Keystore-backed (Android) / Keychain (iOS) storage. Never synced, never in backups. */
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const KEYS = {
  db: 'emx.dbKey',
  household: 'emx.householdKey',
  pinHash: 'emx.pinHash',
  pinSalt: 'emx.pinSalt',
  failed: 'emx.failedPins',
  vaultKey: 'emx.vaultKey',
  vaultToken: 'emx.vaultToken',
} as const;

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** 256-bit SQLCipher key, generated on first launch. */
export async function getDatabaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEYS.db, OPTS);
  if (existing) return existing;
  const key = hex(randomBytes(32));
  await SecureStore.setItemAsync(KEYS.db, key, OPTS);
  return key;
}

export async function getHouseholdKey(): Promise<Uint8Array | null> {
  const v = await SecureStore.getItemAsync(KEYS.household, OPTS);
  return v ? fromBase64(v) : null;
}

export async function setHouseholdKey(key: Uint8Array): Promise<void> {
  await SecureStore.setItemAsync(KEYS.household, toBase64(key), OPTS);
}

/**
 * Personal cloud backup secrets: the key derived from the user's password (the password itself is
 * never stored) and the random write token. Both are re-created from the password on a new phone.
 */
export async function getVaultSecrets(): Promise<{ key: Uint8Array; token: string } | null> {
  const [key, token] = await Promise.all([SecureStore.getItemAsync(KEYS.vaultKey, OPTS), SecureStore.getItemAsync(KEYS.vaultToken, OPTS)]);
  return key && token ? { key: fromBase64(key), token } : null;
}

export async function setVaultSecrets(key: Uint8Array, token: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.vaultKey, toBase64(key), OPTS);
  await SecureStore.setItemAsync(KEYS.vaultToken, token, OPTS);
}

export async function clearVaultSecrets(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.vaultKey, OPTS);
  await SecureStore.deleteItemAsync(KEYS.vaultToken, OPTS);
}

export async function hasPin(): Promise<boolean> {
  return Boolean(await SecureStore.getItemAsync(KEYS.pinHash, OPTS));
}

export async function setPin(pin: string): Promise<void> {
  const salt = randomBytes(16);
  await SecureStore.setItemAsync(KEYS.pinSalt, toBase64(salt), OPTS);
  await SecureStore.setItemAsync(KEYS.pinHash, await hashPin(pin, salt), OPTS);
  await SecureStore.deleteItemAsync(KEYS.failed, OPTS);
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.pinHash, OPTS);
  await SecureStore.deleteItemAsync(KEYS.pinSalt, OPTS);
}

/** Returns the number of consecutive failures after this attempt (0 on success). */
export async function verifyPin(pin: string): Promise<{ ok: boolean; failures: number }> {
  const [hash, salt] = await Promise.all([SecureStore.getItemAsync(KEYS.pinHash, OPTS), SecureStore.getItemAsync(KEYS.pinSalt, OPTS)]);
  if (!hash || !salt) return { ok: true, failures: 0 };
  const ok = safeEqual(await hashPin(pin, fromBase64(salt)), hash);
  if (ok) {
    await SecureStore.deleteItemAsync(KEYS.failed, OPTS);
    return { ok, failures: 0 };
  }
  const failures = Number((await SecureStore.getItemAsync(KEYS.failed, OPTS)) ?? 0) + 1;
  await SecureStore.setItemAsync(KEYS.failed, String(failures), OPTS);
  return { ok, failures };
}

export async function wipeSecrets(): Promise<void> {
  await Promise.all(Object.values(KEYS).map((k) => SecureStore.deleteItemAsync(k, OPTS)));
}
