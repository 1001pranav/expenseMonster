import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { autoSaveCapture } from '@/data/actions';
import { saveSettings } from '@/db/repo';
import { getState } from '@/db/store';
import { allowedSenders } from '@/domain/smsSender';
import { captureText } from './capture';
import { logFailure, logInfo } from './diagnostics';

/**
 * Bank SMS import, only when the user asks (builds made with EXPO_PUBLIC_SMS_CAPTURE=1 only).
 *
 * Nothing listens for new messages. Tapping "Import bank SMS" asks for READ_SMS (the first time),
 * then a native screen with no UI (plugins/withSmsCapture.js) copies messages newer than `since`
 * from bank and payment sender IDs that look like a payment, never OTPs, into this app-private
 * folder. Here they go through the same parsers as a pasted SMS, clear ones are saved (the same
 * rule as screenshots), the rest wait in Review, and each file is deleted right away.
 */
export const smsCaptureAvailable = Platform.OS === 'android' && Constants.expoConfig?.extra?.smsCapture === true;

const inboxDir = () => new Directory(Paths.document, 'sms-inbox');

export type SmsPermission = 'granted' | 'denied' | 'blocked';

/** Ask for READ_SMS. "blocked": Android won't ask again (or, sideloaded on 13+, restricted settings are off). */
export async function requestSmsPermission(): Promise<SmsPermission> {
  if (!smsCaptureAvailable) return 'denied';
  const perm = PermissionsAndroid.PERMISSIONS.READ_SMS;
  if (await PermissionsAndroid.check(perm)) return 'granted';
  const res = await PermissionsAndroid.request(perm);
  return res === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : res === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
}

/** Whether READ_SMS is already granted. Never shows the Android prompt. */
export async function smsPermissionGranted(): Promise<boolean> {
  return smsCaptureAvailable && PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
}

export interface SmsImport {
  /** Messages the native side kept (bank-looking, not OTPs). */
  read: number;
  added: number;
  saved: number;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Read bank SMS received after `since` (ms) into Review, or straight in when clear. `startedAt` is
 * where the next import should start reading from.
 */
export async function importBankSms(since: number, timeoutMs = 60_000): Promise<SmsImport & { startedAt: number }> {
  const startedAt = Date.now();
  const pkg = Constants.expoConfig?.android?.package;
  if (!smsCaptureAvailable || !pkg) return { read: 0, added: 0, saved: 0, startedAt };
  const dir = inboxDir();
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  const token = `import-${startedAt}`;
  const done = new File(dir, `${token}.done`);
  await Linking.sendIntent(`${pkg}.IMPORT_SMS`, [
    { key: 'since', value: since },
    { key: 'token', value: token },
    { key: 'allow', value: allowedSenders(getState().tables.sms_senders).join(',') },
  ]);
  for (let t = 0; !done.exists && t < timeoutMs; t += 300) await wait(300);
  if (done.exists) done.delete();
  else logInfo('sms: import did not report back in time; reading what it copied so far');
  return { ...(await drainSmsInbox()), startedAt };
}

let draining: Promise<SmsImport> | null = null;

/** Parse copied messages and delete them. Runs one at a time; also clears leftovers of an interrupted import. */
export function drainSmsInbox(): Promise<SmsImport> {
  if (!smsCaptureAvailable) return Promise.resolve({ read: 0, added: 0, saved: 0 });
  draining ??= drain().finally(() => {
    draining = null;
  });
  return draining;
}

async function drain(): Promise<SmsImport> {
  let added = 0;
  let saved = 0;
  const dir = inboxDir();
  if (!dir.exists) return { read: 0, added, saved };
  // Oldest first, so duplicates (same UPI ref) keep the earliest message.
  const files = dir
    .list()
    .filter((f): f is File => f instanceof File && f.name.endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const f of files) {
    try {
      const msg = JSON.parse(await f.text()) as { sender?: string; body?: string; at?: number };
      if (msg.body) {
        const r = await captureText(msg.body, msg.sender ?? '', msg.at ? new Date(msg.at) : undefined);
        added += r.addedIds.length;
        for (const id of r.addedIds) if (await autoSaveCapture(id)) saved++;
      }
    } catch (e) {
      logFailure('sms: could not read a copied message', e, 'warn');
    } finally {
      // The raw text never stays: whatever happened, the file goes.
      if (f.exists) f.delete();
    }
  }
  if (files.length) logInfo(`sms: ${files.length} read, ${added} new, ${saved} saved automatically`);
  return { read: files.length, added, saved };
}

/**
 * On app open, after the user has imported once and left "Check for new ones when I open the app"
 * on: read bank SMS received since the last import. Never asks for the permission; if it was
 * taken away in Android settings this does nothing (and only drains leftovers).
 */
export async function checkNewBankSms(): Promise<SmsImport> {
  const { smsCheckOnOpen, smsImportedTo } = getState().settings;
  if (!smsCheckOnOpen || !smsImportedTo || !(await smsPermissionGranted())) return drainSmsInbox();
  const { startedAt, ...summary } = await importBankSms(smsImportedTo);
  await saveSettings({ smsImportedTo: startedAt });
  return summary;
}
