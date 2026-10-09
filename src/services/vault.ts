import { validateBundle } from '@/domain/sync/bundle';
import { DecryptError, fromBase64, keyFromPassphrase, newKey, safeEqual, toBase64 } from '@/domain/sync/crypto';
import { backupSpace } from '@/domain/sync/records';
import {
  VAULT_ITERATIONS,
  VAULT_MIN_PASSWORD,
  formatRecoveryCode,
  householdFingerprint,
  newSalt,
  newVaultId,
  newWriteToken,
  openVault,
  parseRecoveryCode,
  saltBytes,
  sealVault,
  type VaultContents,
  type VaultHeader,
  type VaultHousehold,
} from '@/domain/sync/vault';
import { getMeta, listPeers, loadTables, saveIdentity, saveSettings, setMeta } from '@/db/repo';
import { getState } from '@/db/store';
import { BACKUP, cloudConfigured, forgetSpace, rpc, spaceHasNews, syncSpace } from './cloud';
import { logFailure, logInfo, logWarn } from './diagnostics';
import { clearVaultSecrets, getHouseholdKey, getVaultSecrets, setHouseholdKey, setVaultSecrets } from './secure';
import { whenSyncReleased } from './syncHold';
import { mergeBundle } from './sync';

/**
 * Personal cloud backup of everything on this phone, private entries included, encrypted with a
 * password only the user knows. Neither the password nor any key is ever sent.
 *
 * - Header (emx_vaults, found by the recovery code): sealed with the password key; holds a random
 *   data key, the header's write token and the household info. A few hundred bytes.
 * - Records (emx_records, in the backup's own space): one row per entry, sealed with the data key,
 *   synced like family records (cloud.ts): only changed entries go up, only new ones come down.
 *
 * Changing the password re-seals the header only. The password key and data key are kept in the
 * Keystore so background syncs never need the password.
 */

const META = {
  id: 'vault.id',
  salt: 'vault.salt',
  iterations: 'vault.iterations',
  /** Header version this phone last read or wrote. */
  version: 'vault.version',
  /**
   * householdFingerprint() of this phone's household when it last wrote or adopted the header's
   * household info. The header is rewritten only when this phone's own household changes, so two
   * phones in different households never take turns overwriting it.
   */
  household: 'vault.household',
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

async function fetchVault(id: string): Promise<VaultRow | null> {
  const rows = await rpc<VaultRow[]>('emx_vault_get', { p_vault: id });
  return rows[0] ? { ...rows[0], version: Number(rows[0].version) } : null;
}

async function remember(p: { id: string; salt: string; iterations: number; version: number }) {
  await setMeta(META.id, p.id);
  await setMeta(META.salt, p.salt);
  await setMeta(META.iterations, String(p.iterations));
  await setMeta(META.version, String(p.version));
}

/** This phone's household as of now counts as reconciled with the header. */
const markHouseholdSeen = async () => setMeta(META.household, householdFingerprint(await householdNow()));

async function setStatus(s: Omit<VaultStatus, 'at'>) {
  await setMeta(META.status, JSON.stringify({ at: new Date().toISOString(), ...s } satisfies VaultStatus)).catch((e) => logFailure('cloud backup: could not save status', e, 'warn'));
}

export async function loadVaultStatus(): Promise<VaultStatus | null> {
  try {
    return JSON.parse((await getMeta(META.status)) ?? 'null');
  } catch (e) {
    logFailure('cloud backup: could not read status', e, 'warn');
    return null;
  }
}

/** The recovery code for this phone's backup, or null when it is off. Safe to show: useless without the password. */
export async function recoveryCode(): Promise<string | null> {
  const id = await getMeta(META.id);
  return id ? formatRecoveryCode(id) : null;
}

async function householdNow(): Promise<VaultHousehold | undefined> {
  const { identity, settings } = getState();
  const key = await getHouseholdKey();
  return key ? { id: identity.householdId, name: identity.householdName, key: toBase64(key), selfMemberId: identity.selfMemberId, cloudSync: settings.cloudSync } : undefined;
}

/**
 * Write the header (create with expected 0) with this phone's household, or `household` when given.
 * Returns the new version, or 0 if another phone wrote first. On success remembers what was written.
 */
async function writeHeader(h: { id: string; token: string; key: Uint8Array; salt: string; iterations: number; dataKey: Uint8Array; expected: number; household?: VaultHousehold }): Promise<number> {
  const household = h.household ?? (await householdNow());
  const header: VaultHeader = { v: 2, token: h.token, dataKey: toBase64(h.dataKey), household };
  const next = Number(
    await rpc<number>('emx_vault_put', {
      p_vault: h.id,
      p_token: h.token,
      p_salt: h.salt,
      p_iterations: h.iterations,
      p_payload: sealVault(header, h.key, h.id),
      p_expected: h.expected,
    }),
  );
  if (next) await remember({ id: h.id, salt: h.salt, iterations: h.iterations, version: next });
  return next;
}

/**
 * A backup made before records was one snapshot: merge it, give the backup a data key and a
 * records header; the next records sync uploads every entry.
 */
async function upgradeSnapshot(id: string, key: Uint8Array, legacy: VaultContents, row: VaultRow): Promise<{ dataKey: Uint8Array; merged: number }> {
  const merged = await mergeBundle(validateBundle(legacy.bundle), 'newest');
  getState().setAll(await loadTables(), getState().identity, getState().settings);
  const dataKey = newKey();
  // Keep the household the snapshot was made in (a new phone hasn't adopted it yet).
  const next = await writeHeader({ id, token: legacy.token, key, salt: row.salt, iterations: row.iterations, dataKey, expected: row.version, household: legacy.household });
  if (!next) throw new Error('Another phone is updating this backup. Try again in a minute.');
  await setVaultSecrets(key, legacy.token, dataKey);
  logInfo('cloud backup: upgraded from one snapshot to per-entry records');
  return { dataKey, merged: merged.inserted + merged.updated };
}

/**
 * After a restore: put this phone back in the backed-up household, so family sync works without a
 * new QR scan. Skipped when this phone is already paired with other phones in another household;
 * moving it silently would cut it off from them.
 */
async function adoptHousehold(h: VaultHousehold | undefined): Promise<string | null> {
  if (!h) return null;
  const { identity } = getState();
  let joined: string | null = null;
  if (h.id !== identity.householdId) {
    if ((await listPeers()).length) {
      logWarn('cloud backup: restored data, but kept this phone in its current household (it has paired phones)');
    } else {
      await setHouseholdKey(fromBase64(h.key));
      await saveIdentity({ householdId: h.id, householdName: h.name });
      if (h.cloudSync && cloudConfigured) await saveSettings({ cloudSync: true });
      logInfo('cloud backup: rejoined the household from the backup');
      joined = h.name;
    }
  }
  if (!identity.selfMemberId && h.selfMemberId && getState().tables.members.some((m) => m.id === h.selfMemberId)) {
    const me = getState().tables.members.find((m) => m.id === h.selfMemberId)!;
    await saveIdentity({ selfMemberId: h.selfMemberId, ...(identity.deviceName === 'My phone' ? { deviceName: `${me.name}'s phone` } : {}) });
  }
  return joined;
}

function checkPassword(password: string) {
  if (password.length < VAULT_MIN_PASSWORD) throw new Error(`Use at least ${VAULT_MIN_PASSWORD} characters`);
}

/** Turn the backup on: creates the header now and uploads the entries right after. Returns the recovery code. */
export async function enableVault(password: string): Promise<string> {
  if (!cloudConfigured) throw new Error('This build has no cloud server configured');
  checkPassword(password);
  const id = newVaultId();
  const salt = newSalt();
  const key = await keyFromPassphrase(password, saltBytes(salt), VAULT_ITERATIONS);
  const token = newWriteToken();
  const dataKey = newKey();
  await writeHeader({ id, token, key, salt, iterations: VAULT_ITERATIONS, dataKey, expected: 0 });
  await markHouseholdSeen();
  await setVaultSecrets(key, token, dataKey);
  await saveSettings({ vaultSync: true });
  await setStatus({ ok: true, message: 'Backup created, uploading entries' });
  vaultSyncSoon(0);
  return formatRecoveryCode(id);
}

/**
 * Open an existing backup with its recovery code and password (new phone, or after the password
 * was changed on another phone) and merge its entries into this phone. Newer edits win; nothing is
 * deleted unless it was deleted in the backup.
 */
export async function restoreVault(code: string, password: string): Promise<{ received: number; joined: string | null }> {
  if (!cloudConfigured) throw new Error('This build has no cloud server configured');
  const id = parseRecoveryCode(code);
  if (!id) throw new Error('That recovery code is not valid. It has 24 letters and numbers.');
  const current = await getMeta(META.id);
  if (getState().settings.vaultSync && current && current !== id) throw new Error('Turn off the current cloud backup first');
  // A background backup may be reading the same entries: let it finish first.
  if (inFlight) await inFlight.catch(() => {});
  const row = await fetchVault(id);
  if (!row) throw new Error('No cloud backup found for this recovery code');
  const key = await keyFromPassphrase(password, saltBytes(row.salt), row.iterations);
  let header: VaultHeader | VaultContents;
  try {
    header = openVault(row.payload, key, id);
  } catch (e) {
    if (e instanceof DecryptError) throw new Error('Wrong password');
    throw e;
  }
  let received = 0;
  let dataKey: Uint8Array;
  if (header.v === 1) {
    const up = await upgradeSnapshot(id, key, header, row);
    dataKey = up.dataKey;
    received += up.merged;
  } else {
    dataKey = fromBase64(header.dataKey);
    await setVaultSecrets(key, header.token, dataKey);
    await remember({ id, salt: row.salt, iterations: row.iterations, version: row.version });
  }
  await saveSettings({ vaultSync: true });
  // Download every entry (and upload anything only this phone has).
  received += (await syncSpace(backupSpace(dataKey, id), BACKUP)).received;
  getState().setAll(await loadTables(), getState().identity, getState().settings);
  const joined = await adoptHousehold(header.household);
  await markHouseholdSeen();
  syncedGeneration = generation;
  await setStatus({ ok: true, message: `Restored ${received} entries` });
  return { received, joined };
}

async function local() {
  const [secrets, id, salt, iterations, version, household] = await Promise.all([
    getVaultSecrets(),
    getMeta(META.id),
    getMeta(META.salt),
    getMeta(META.iterations),
    getMeta(META.version),
    getMeta(META.household),
  ]);
  if (!secrets || !id || !salt || !iterations) throw new NeedsPasswordError('Enter your backup password to continue');
  return { ...secrets, id, salt, iterations: Number(iterations), version: Number(version ?? 0), household };
}

async function syncOnce(): Promise<VaultResult> {
  const v = await local();
  let received = 0;
  let passwordChanged = false;
  const head = Number(await rpc<number>('emx_vault_head', { p_vault: v.id }));
  if (head === 0) throw new Error('This backup was deleted from the cloud. Turn the backup off and on again.');
  // The header only changes on a password change, an upgrade or a household change elsewhere.
  if (head !== v.version || !v.dataKey) {
    const row = await fetchVault(v.id);
    if (!row) throw new Error('This backup was deleted from the cloud. Turn the backup off and on again.');
    try {
      const header = openVault(row.payload, v.key, v.id);
      if (header.v === 1) {
        const up = await upgradeSnapshot(v.id, v.key, header, row);
        v.dataKey = up.dataKey;
        received += up.merged;
      } else {
        if (!v.dataKey) {
          v.dataKey = fromBase64(header.dataKey);
          await setVaultSecrets(v.key, v.token, v.dataKey);
        }
        await setMeta(META.version, String(row.version));
        v.version = row.version;
      }
    } catch (e) {
      // New password set on another phone: the entries still sync (the data key didn't change),
      // only the header can't be updated from here until this phone gets the new password.
      if (!(e instanceof DecryptError) || row.salt === v.salt) throw e;
      passwordChanged = true;
    }
  }
  if (!v.dataKey) throw new NeedsPasswordError('The backup password was changed on another phone. Enter the new one.');

  const r = await syncSpace(backupSpace(v.dataKey, v.id), BACKUP);
  received += r.received;

  // This phone joined another household or switched family sync: keep the header's copy current.
  if (!passwordChanged && householdFingerprint(await householdNow()) !== v.household) {
    // 0: another phone wrote the header first; retried on a later sync.
    if (await writeHeader({ id: v.id, token: v.token, key: v.key, salt: v.salt, iterations: v.iterations, dataKey: v.dataKey, expected: v.version })) await markHouseholdSeen();
  }
  if (passwordChanged) throw new NeedsPasswordError('Your entries are backed up, but the password was changed on another phone. Enter the new one.');
  return { received, sent: r.sent > 0 };
}

let inFlight: Promise<VaultResult> | null = null;
// Same idea as cloud.ts: bumped on every change, recorded by a backup that succeeds.
let generation = 1;
let syncedGeneration = 0;

/** Merge the backup if another phone changed it, then upload this phone's snapshot if anything changed. */
export function vaultSyncNow(): Promise<VaultResult> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      if (!cloudConfigured) throw new Error('This build has no cloud server configured');
      if (!getState().settings.vaultSync) throw new Error('Cloud backup is turned off');
      const started = generation;
      const r = await syncOnce();
      syncedGeneration = Math.max(syncedGeneration, started);
      await setStatus({ ok: true, message: r.sent ? `Backed up${r.received ? `, ${r.received} received` : ''}` : r.received ? `${r.received} received, up to date` : 'Up to date' });
      return r;
    } catch (e) {
      logFailure('cloud backup failed', e);
      await setStatus({ ok: false, message: (e as Error).message, needsPassword: e instanceof NeedsPasswordError || undefined });
      throw e;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Cheap check while the app is open: one small request for the backup's newest entry number, and a
 * sync only when another phone added entries or this phone has unsent ones.
 */
export async function vaultCheckNow(): Promise<VaultResult | null> {
  if (!cloudConfigured || !getState().settings.vaultSync || inFlight) return null;
  // Changes not backed up yet (made offline, or the last attempt failed): back up now.
  if (syncedGeneration < generation) return vaultSyncNow();
  const [secrets, id] = await Promise.all([getVaultSecrets(), getMeta(META.id)]);
  if (!secrets || !id) return null;
  if (!secrets.dataKey) return vaultSyncNow();
  return (await spaceHasNews(backupSpace(secrets.dataKey, id))) ? vaultSyncNow() : null;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Debounced background backup; errors land in the status shown on the backup screen. */
export function vaultSyncSoon(delayMs = 10_000) {
  if (!cloudConfigured || !getState().settings.vaultSync) return;
  generation++;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    whenSyncReleased(() => vaultSyncNow().catch(() => {}));
  }, delayMs);
}

/** New password for the same backup: re-seals the header only. Other phones keep syncing entries and ask for it once. */
export async function changeVaultPassword(currentPassword: string, newPassword: string): Promise<void> {
  checkPassword(newPassword);
  await vaultSyncNow();
  const v = await local();
  const check = await keyFromPassphrase(currentPassword, saltBytes(v.salt), v.iterations);
  if (!safeEqual(toBase64(check), toBase64(v.key))) throw new Error('Current password is wrong');
  if (!v.dataKey) throw new Error('Back up once before changing the password');
  const salt = newSalt();
  const key = await keyFromPassphrase(newPassword, saltBytes(salt), VAULT_ITERATIONS);
  const next = await writeHeader({ id: v.id, token: v.token, key, salt, iterations: VAULT_ITERATIONS, dataKey: v.dataKey, expected: v.version });
  if (!next) throw new Error('Another phone just updated the backup. Try again.');
  await setVaultSecrets(key, v.token, v.dataKey);
  await setStatus({ ok: true, message: 'Password changed' });
}

/** Stop backing up from this phone. With `deleteFromCloud`, the backup (header and entries) is removed for every phone. */
export async function disableVault(deleteFromCloud: boolean): Promise<void> {
  // Let a running sync finish so it can't write vault state back after we clear it.
  if (inFlight) await inFlight.catch(() => {});
  const [secrets, id] = await Promise.all([getVaultSecrets(), getMeta(META.id)]);
  const space = secrets?.dataKey && id ? backupSpace(secrets.dataKey, id) : null;
  if (deleteFromCloud && secrets && id) {
    if (space) await rpc<boolean>('emx_space_delete', { p_space: space.id, p_token: space.token });
    await rpc<boolean>('emx_vault_delete', { p_vault: id, p_token: secrets.token });
  }
  if (timer) clearTimeout(timer);
  timer = null;
  if (space) await forgetSpace(space);
  await clearVaultSecrets();
  for (const k of Object.values(META)) await setMeta(k, null);
  await saveSettings({ vaultSync: false });
}
