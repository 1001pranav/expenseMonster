import { buildBundle, validateBundle } from '@/domain/sync/bundle';
import { DecryptError, keyFromPassphrase, safeEqual, toBase64 } from '@/domain/sync/crypto';
import {
  VAULT_ITERATIONS,
  VAULT_MIN_PASSWORD,
  contentDigest,
  formatRecoveryCode,
  newSalt,
  newVaultId,
  newWriteToken,
  openVault,
  parseRecoveryCode,
  saltBytes,
  sealVault,
  type VaultContents,
} from '@/domain/sync/vault';
import { getMeta, loadTables, saveSettings, setMeta } from '@/db/repo';
import { getState } from '@/db/store';
import { cloudConfigured, rpc } from './cloud';
import { clearVaultSecrets, getVaultSecrets, setVaultSecrets } from './secure';
import { collectRows, mergeBundle, type ImportResult } from './sync';

/**
 * Personal cloud backup: everything on this phone (private entries included) as one snapshot,
 * sealed with a key derived from the user's password. Neither the password nor the key is ever
 * sent; the derived key is kept in the Keystore so background syncs don't need the password.
 * Independent of household cloud sync (cloud.ts), which only shares household rows.
 */

const META = {
  id: 'vault.id',
  salt: 'vault.salt',
  iterations: 'vault.iterations',
  /** Server version this phone last merged or wrote. */
  version: 'vault.version',
  /** Digest of the rows at that version; equal digest = nothing to upload. */
  digest: 'vault.digest',
  status: 'vault.status',
} as const;

export interface VaultStatus {
  at: string;
  ok: boolean;
  message: string;
  /** The password was changed on another phone; this one needs the new one. */
  needsPassword?: boolean;
}

export interface VaultResult {
  received: number;
  sent: boolean;
}

class NeedsPasswordError extends Error {}

export const vaultAvailable = cloudConfigured;

interface VaultRow {
  salt: string;
  iterations: number;
  payload: string;
  version: number;
}

async function snapshot() {
  const { identity } = getState();
  return buildBundle(await collectRows(), { householdId: identity.householdId, deviceId: identity.deviceId, deviceName: identity.deviceName, since: null, kind: 'backup' });
}

async function fetchVault(id: string): Promise<VaultRow | null> {
  const rows = await rpc<VaultRow[]>('emx_vault_get', { p_vault: id });
  return rows[0] ? { ...rows[0], version: Number(rows[0].version) } : null;
}

async function remember(p: { id: string; salt: string; iterations: number; version: number; digest: string }) {
  await setMeta(META.id, p.id);
  await setMeta(META.salt, p.salt);
  await setMeta(META.iterations, String(p.iterations));
  await setMeta(META.version, String(p.version));
  await setMeta(META.digest, p.digest);
}

async function setStatus(s: Omit<VaultStatus, 'at'>) {
  await setMeta(META.status, JSON.stringify({ at: new Date().toISOString(), ...s } satisfies VaultStatus)).catch(() => {});
}

export async function loadVaultStatus(): Promise<VaultStatus | null> {
  try {
    return JSON.parse((await getMeta(META.status)) ?? 'null');
  } catch {
    return null;
  }
}

/** The recovery code for this phone's backup, or null when it is off. Safe to show: useless without the password. */
export async function recoveryCode(): Promise<string | null> {
  const id = await getMeta(META.id);
  return id ? formatRecoveryCode(id) : null;
}

function checkPassword(password: string) {
  if (password.length < VAULT_MIN_PASSWORD) throw new Error(`Use at least ${VAULT_MIN_PASSWORD} characters`);
}

/** Turn the backup on: creates a new vault and uploads the first snapshot. Returns the recovery code. */
export async function enableVault(password: string): Promise<string> {
  if (!cloudConfigured) throw new Error('This build has no cloud server configured');
  checkPassword(password);
  const id = newVaultId();
  const salt = newSalt();
  const key = await keyFromPassphrase(password, saltBytes(salt), VAULT_ITERATIONS);
  const token = newWriteToken();
  const bundle = await snapshot();
  const version = await rpc<number>('emx_vault_put', {
    p_vault: id,
    p_token: token,
    p_salt: salt,
    p_iterations: VAULT_ITERATIONS,
    p_payload: sealVault({ v: 1, token, bundle }, key, id),
    p_expected: 0,
  });
  await setVaultSecrets(key, token);
  await remember({ id, salt, iterations: VAULT_ITERATIONS, version: Number(version), digest: contentDigest(bundle.tables) });
  await saveSettings({ vaultSync: true });
  await setStatus({ ok: true, message: 'Backup created' });
  return formatRecoveryCode(id);
}

/**
 * Open an existing backup with its recovery code and password (new phone, or after the password
 * was changed on another phone) and merge it into this phone. Newer edits win; nothing is deleted
 * unless it was deleted in the backup.
 */
export async function restoreVault(code: string, password: string): Promise<Pick<ImportResult, 'inserted' | 'updated'>> {
  if (!cloudConfigured) throw new Error('This build has no cloud server configured');
  const id = parseRecoveryCode(code);
  if (!id) throw new Error('That recovery code is not valid. It has 24 letters and numbers.');
  const current = await getMeta(META.id);
  if (getState().settings.vaultSync && current && current !== id) throw new Error('Turn off the current cloud backup first');
  const row = await fetchVault(id);
  if (!row) throw new Error('No cloud backup found for this recovery code');
  const key = await keyFromPassphrase(password, saltBytes(row.salt), row.iterations);
  let contents: VaultContents;
  try {
    contents = openVault(row.payload, key, id);
  } catch (e) {
    if (e instanceof DecryptError) throw new Error('Wrong password');
    throw e;
  }
  const bundle = validateBundle(contents.bundle);
  const result = await mergeBundle(bundle, 'newest');
  await setVaultSecrets(key, contents.token);
  await remember({ id, salt: row.salt, iterations: row.iterations, version: row.version, digest: contentDigest(bundle.tables) });
  await saveSettings({ vaultSync: true });
  getState().setAll(await loadTables(), getState().identity, getState().settings);
  await setStatus({ ok: true, message: `Restored: ${result.inserted} new, ${result.updated} updated` });
  vaultSyncSoon(0);
  return { inserted: result.inserted, updated: result.updated };
}

async function local() {
  const [secrets, id, salt, iterations, version, digest] = await Promise.all([
    getVaultSecrets(),
    getMeta(META.id),
    getMeta(META.salt),
    getMeta(META.iterations),
    getMeta(META.version),
    getMeta(META.digest),
  ]);
  if (!secrets || !id || !salt || !iterations) throw new NeedsPasswordError('Enter your backup password to continue');
  return { ...secrets, id, salt, iterations: Number(iterations), version: Number(version ?? 0), digest };
}

async function syncOnce(): Promise<VaultResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const v = await local();
    let received = 0;
    const head = Number(await rpc<number>('emx_vault_head', { p_vault: v.id }));
    if (head === 0) throw new Error('This backup was deleted from the cloud. Turn the backup off and on again.');
    if (head !== v.version) {
      const row = await fetchVault(v.id);
      if (!row) continue;
      let contents: VaultContents;
      try {
        contents = openVault(row.payload, v.key, v.id);
      } catch (e) {
        if (e instanceof DecryptError && row.salt !== v.salt) throw new NeedsPasswordError('The backup password was changed on another phone. Enter the new one.');
        throw e;
      }
      const bundle = validateBundle(contents.bundle);
      const r = await mergeBundle(bundle, 'newest');
      received = r.inserted + r.updated;
      await remember({ id: v.id, salt: v.salt, iterations: v.iterations, version: row.version, digest: contentDigest(bundle.tables) });
      v.version = row.version;
      v.digest = contentDigest(bundle.tables);
    }
    const bundle = await snapshot();
    const digest = contentDigest(bundle.tables);
    if (digest === v.digest) return { received, sent: false };
    const next = Number(
      await rpc<number>('emx_vault_put', {
        p_vault: v.id,
        p_token: v.token,
        p_salt: v.salt,
        p_iterations: v.iterations,
        p_payload: sealVault({ v: 1, token: v.token, bundle }, v.key, v.id),
        p_expected: v.version,
      }),
    );
    // 0 = another phone wrote first: pull its snapshot, merge, and try again.
    if (next === 0) continue;
    await remember({ id: v.id, salt: v.salt, iterations: v.iterations, version: next, digest });
    return { received, sent: true };
  }
  throw new Error('Another phone is updating this backup. Try again in a minute.');
}

let inFlight: Promise<VaultResult> | null = null;

/** Merge the backup if another phone changed it, then upload this phone's snapshot if anything changed. */
export function vaultSyncNow(): Promise<VaultResult> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      if (!cloudConfigured) throw new Error('This build has no cloud server configured');
      if (!getState().settings.vaultSync) throw new Error('Cloud backup is turned off');
      const r = await syncOnce();
      await setStatus({ ok: true, message: r.sent ? `Backed up${r.received ? `, ${r.received} received` : ''}` : r.received ? `${r.received} received, up to date` : 'Up to date' });
      return r;
    } catch (e) {
      await setStatus({ ok: false, message: (e as Error).message, needsPassword: e instanceof NeedsPasswordError || undefined });
      throw e;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Debounced background backup; errors land in the status shown on the backup screen. */
export function vaultSyncSoon(delayMs = 10_000) {
  if (!cloudConfigured || !getState().settings.vaultSync) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    vaultSyncNow().catch(() => {});
  }, delayMs);
}

/** New password for the same backup. Other phones using it will ask for the new password once. */
export async function changeVaultPassword(currentPassword: string, newPassword: string): Promise<void> {
  checkPassword(newPassword);
  await vaultSyncNow();
  const v = await local();
  const check = await keyFromPassphrase(currentPassword, saltBytes(v.salt), v.iterations);
  if (!safeEqual(toBase64(check), toBase64(v.key))) throw new Error('Current password is wrong');
  const salt = newSalt();
  const key = await keyFromPassphrase(newPassword, saltBytes(salt), VAULT_ITERATIONS);
  const bundle = await snapshot();
  const next = Number(
    await rpc<number>('emx_vault_put', {
      p_vault: v.id,
      p_token: v.token,
      p_salt: salt,
      p_iterations: VAULT_ITERATIONS,
      p_payload: sealVault({ v: 1, token: v.token, bundle }, key, v.id),
      p_expected: v.version,
    }),
  );
  if (next === 0) throw new Error('Another phone just updated the backup. Try again.');
  await setVaultSecrets(key, v.token);
  await remember({ id: v.id, salt, iterations: VAULT_ITERATIONS, version: next, digest: contentDigest(bundle.tables) });
  await setStatus({ ok: true, message: 'Password changed' });
}

/** Stop backing up from this phone. With `deleteFromCloud`, the backup is removed for every phone. */
export async function disableVault(deleteFromCloud: boolean): Promise<void> {
  // Let a running sync finish so it can't write vault state back after we clear it.
  if (inFlight) await inFlight.catch(() => {});
  if (deleteFromCloud) {
    const [secrets, id] = await Promise.all([getVaultSecrets(), getMeta(META.id)]);
    if (secrets && id) await rpc<boolean>('emx_vault_delete', { p_vault: id, p_token: secrets.token });
  }
  if (timer) clearTimeout(timer);
  timer = null;
  await clearVaultSecrets();
  for (const k of Object.values(META)) await setMeta(k, null);
  await saveSettings({ vaultSync: false });
}
