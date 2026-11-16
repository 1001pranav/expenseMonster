import { File } from 'expo-file-system';
import { randomBytes } from '@/domain/ids';
import { buildBundle, validateBundle, type Bundle } from '@/domain/sync/bundle';
import { DecryptError, fromBase64, keyFromPassphrase, open, seal, toBase64 } from '@/domain/sync/crypto';
import type { VaultHousehold } from '@/domain/sync/vault';
import { loadTables, saveSettings } from '@/db/repo';
import { DEFAULT_SETTINGS, getState, type Settings } from '@/db/store';
import { writeCacheFile } from './files';
import { collectRows, mergeBundle, shareFile, stamp, type ImportResult } from './sync';
import { adoptHousehold, householdNow } from './vault';

/**
 * Backup file (.emxbak): everything on this phone in one file, sealed with a passphrase. Besides
 * the entries it carries what a new phone needs to carry on as this one: the household (with its
 * key, so family sync works without a new QR scan), who "me" is, and the app's preferences.
 */

interface BackupEnvelope {
  t: 'emx-backup';
  v: 1;
  salt: string;
  data: string;
}

/** What is not an entry. Optional: files made before this existed hold entries only. */
interface BackupPhone {
  household?: VaultHousehold;
  settings?: Partial<Settings>;
}

/** The sealed payload. Older app versions read it as a plain bundle and ignore `phone`. */
type BackupContents = Bundle & { phone?: BackupPhone };

const BACKUP_AAD = 'emx-backup-v1';

/**
 * Preferences that mean the same on any phone. Left out on purpose: the lock (biometric,
 * wipeAfterFailures: the PIN stays in the old phone's Keystore), cloudSync and vaultSync (they
 * need keys and a server, see adoptHousehold) and smsImportedTo (about that phone's inbox).
 */
const PORTABLE_SETTINGS = [
  'autoLockMinutes',
  'screenSecure',
  'reviewNudge',
  'hideAmounts',
  'deleteScreenshots',
  'defaultTxnScope',
  'theme',
  'syncConflictPolicy',
  'setupDismissed',
  'autoSaveCaptures',
  'smsCheckOnOpen',
  'smsOfferDismissed',
  'budgetPeriod',
  'payday',
  'categoryOrder',
] as const satisfies readonly (keyof Settings)[];

function portableSettings(from: Partial<Settings> | undefined): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const k of PORTABLE_SETTINGS) {
    // Same type as the default: a value from a different app version is skipped, not trusted.
    if (from && typeof from[k] === typeof DEFAULT_SETTINGS[k]) out[k] = from[k];
  }
  return out as Partial<Settings>;
}

/** The backup file's text: everything on this phone, sealed with the passphrase. */
export async function sealBackup(passphrase: string): Promise<string> {
  if (passphrase.length < 8) throw new Error('Use at least 8 characters');
  const { identity, settings } = getState();
  const salt = randomBytes(16);
  const key = await keyFromPassphrase(passphrase, salt);
  const bundle = buildBundle(await collectRows(), {
    householdId: identity.householdId,
    deviceId: identity.deviceId,
    deviceName: identity.deviceName,
    since: null,
    kind: 'backup',
  });
  const contents: BackupContents = { ...bundle, phone: { household: await householdNow(), settings: portableSettings(settings) } };
  const envelope: BackupEnvelope = { t: 'emx-backup', v: 1, salt: toBase64(salt), data: seal(contents, key, BACKUP_AAD) };
  return JSON.stringify(envelope);
}

export async function createBackup(passphrase: string): Promise<void> {
  const file = writeCacheFile(`ExpenseMonster-backup-${stamp()}.emxbak`, await sealBackup(passphrase));
  await shareFile(file, 'Save encrypted backup');
}

export interface RestoreResult extends ImportResult {
  /** Name of the household this phone was put back in, or null if it stayed where it was. */
  joined: string | null;
}

/**
 * Merge a backup file's entries into this phone (newer edits win), then put the phone back in the
 * backed-up household (see adoptHousehold: not when it is paired with phones of another one). On a
 * phone that isn't set up yet it also takes who "me" is and the preferences; a phone already in
 * use keeps its own.
 */
export async function openBackup(text: string, passphrase: string): Promise<RestoreResult> {
  let env: BackupEnvelope;
  try {
    env = JSON.parse(text);
  } catch {
    throw new Error('Not an ExpenseMonster backup');
  }
  if (env?.t !== 'emx-backup' || typeof env.salt !== 'string' || typeof env.data !== 'string') throw new Error('Not an ExpenseMonster backup');
  const key = await keyFromPassphrase(passphrase, fromBase64(env.salt));
  let contents: BackupContents;
  try {
    contents = open<BackupContents>(env.data, key, BACKUP_AAD);
  } catch (e) {
    if (e instanceof DecryptError) throw new Error('Wrong passphrase or damaged file');
    throw e;
  }
  const bundle = validateBundle(contents);
  const newPhone = !getState().identity.onboarded;
  const result = await mergeBundle(bundle, 'newest');
  getState().setAll(await loadTables(), getState().identity, getState().settings);
  const joined = await adoptHousehold(contents.phone?.household, 'backup file');
  if (newPhone) await saveSettings(portableSettings(contents.phone?.settings));
  return { from: bundle.fromName, ...result, clockAheadMinutes: 0, joined };
}

export async function restoreBackup(uri: string, passphrase: string): Promise<RestoreResult> {
  return openBackup(await new File(uri).text(), passphrase);
}
