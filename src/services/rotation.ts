import { fromBase64, newKey } from '@/domain/sync/crypto';
import { keyIdOf, openGrant, sealGrant } from '@/domain/sync/grant';
import { parseIds } from '@/domain/settle';
import type { HouseholdInfo, KeyGrant } from '@/domain/types';
import { insert, saveSettings, update } from '@/db/repo';
import { getState } from '@/db/store';
import { cloudConfigured, cloudSyncNow } from './cloud';
import { logFailure, logInfo } from './diagnostics';
import { HOUSEHOLD_ID, isHead } from './holds';
import { getDeviceKeys, getHouseholdKey, getNextHouseholdKey, setHouseholdKey, setNextHouseholdKey } from './secure';

/**
 * Removing a phone from the household (protocol in domain/sync/grant.ts):
 * 1. The head makes a new household key, seals it to every remaining phone's public key (key
 *    grants), and marks the phone removed in the household record.
 * 2. These are uploaded under the OLD key: the remaining phones can only read that one yet. The
 *    removed phone can read them too, but can't open a grant.
 * 3. The head switches to the new key. A new key means a new cloud space, so everything is
 *    uploaded there; nothing more goes to the old one.
 * 4. Each remaining phone, on its next sync, opens its grant, switches, and catches up.
 * Needs cloud sync: with files only, the head pairs the remaining phones again by QR instead.
 */

const household = () => getState().tables.household.find((h) => h.id === HOUSEHOLD_ID);
export const removedPhones = (h: HouseholdInfo | undefined = household()) => parseIds(h?.removed ?? null);

/**
 * Phones that get the new key when `deviceId` is removed: every other known phone with a public key.
 * Shown to the head before removing. A phone record is only as trustworthy as the phone that
 * published it: a modified app on the phone being removed could have published a made-up one with
 * its own key. The head checks this list and removes any phone they don't recognise too.
 * A phone that missed the new key (older version, offline too long) pairs again by QR, in person:
 * the head never reads the old key's space again, which the removed phone can still write to.
 */
export function keyRecipients(deviceId: string): { id: string; name: string; hasKey: boolean }[] {
  const { identity, tables } = getState();
  const removed = [...removedPhones(), deviceId];
  return tables.devices
    .filter((d) => !d.deletedAt && d.id !== identity.deviceId && !removed.includes(d.id))
    .map((d) => ({ id: d.id, name: d.name, hasKey: Boolean(d.publicKey) }));
}

export interface RemoveResult {
  /** Remaining phones on an older app version (no public key): they must pair again by QR. */
  needQr: string[];
  /** Everything is on the new key. False: offline, it finishes on the next successful sync. */
  finished: boolean;
}

export async function removePhone(deviceId: string): Promise<RemoveResult> {
  if (!isHead()) throw new Error('Only the household head can remove a phone');
  const { identity, settings, tables } = getState();
  if (deviceId === identity.deviceId) throw new Error("The head can't remove its own phone. Hand the role over first.");
  if (!settings.cloudSync || !cloudConfigured) {
    throw new Error('Removing a phone needs cloud sync. Without it: separate on the phone you keep, then pair the others with it again by QR.');
  }
  // An earlier removal that didn't finish keeps its key, so grants already sent stay valid.
  const next = (await getNextHouseholdKey()) ?? newKey();
  await setNextHouseholdKey(next);
  const keyId = keyIdOf(next);
  const removed = [...new Set([...removedPhones(), deviceId])];
  const remaining = tables.devices.filter((d) => !d.deletedAt && d.id !== identity.deviceId && !removed.includes(d.id));
  const granted = new Set(tables.key_grants.filter((g) => g.keyId === keyId).map((g) => g.recipient));
  for (const d of remaining) {
    if (!d.publicKey || granted.has(d.id)) continue;
    const sealed = sealGrant(next, fromBase64(d.publicKey), { householdId: identity.householdId, recipient: d.id });
    await insert('key_grants', { recipient: d.id, keyId, sealed, scope: 'household' } as never);
  }
  await update('household', HOUSEHOLD_ID, { keyId, removed: JSON.stringify(removed) } as Partial<HouseholdInfo>);
  logInfo(`household: removing a phone, new key ${keyId.slice(0, 8)} for ${remaining.length} phones`);
  return { needQr: remaining.filter((d) => !d.publicKey).map((d) => d.name), finished: await finishRemoval() };
}

/**
 * Head: once the grants are on the server under the old key, switch to the new key and upload
 * everything to its space. Safe to call any time; false while offline.
 */
export async function finishRemoval(): Promise<boolean> {
  const next = await getNextHouseholdKey();
  if (!next) return true;
  try {
    await cloudSyncNow();
    await setHouseholdKey(next);
    await setNextHouseholdKey(null);
    logInfo('household: switched to the new key');
    await cloudSyncNow();
    return true;
  } catch (e) {
    logFailure('household: removing a phone will finish on the next sync', e, 'warn');
    return false;
  }
}

export type KeyStatus = 'current' | 'switched' | 'waiting' | 'removed';

/**
 * Every phone, after a sync: follow a key change the head made. Opens this phone's grant and
 * switches to the new key; a removed phone stops syncing (its data stays on it).
 */
export async function followKeyChange(): Promise<KeyStatus> {
  if (await getNextHouseholdKey()) return (await finishRemoval()) ? 'switched' : 'waiting';
  const h = household();
  const current = await getHouseholdKey();
  // Checked before "removed": a removed phone paired again by QR has the current key.
  if (!h?.keyId || !current || keyIdOf(current) === h.keyId) return 'current';
  const { identity, tables } = getState();
  if (removedPhones(h).includes(identity.deviceId)) {
    if (getState().settings.cloudSync) {
      logInfo('household: this phone was removed by the head; cloud sync turned off');
      await saveSettings({ cloudSync: false });
    }
    return 'removed';
  }
  const grant = tables.key_grants.find((g: KeyGrant) => !g.deletedAt && g.recipient === identity.deviceId && g.keyId === h.keyId);
  // No grant yet (it may arrive in a later page), or this phone had no public key: pair again by QR.
  if (!grant) return 'waiting';
  const key = openGrant(grant.sealed, await getDeviceKeys(), { householdId: identity.householdId, recipient: identity.deviceId, keyId: h.keyId });
  await setHouseholdKey(key);
  logInfo(`household: switched to the new key ${h.keyId.slice(0, 8)} from the head`);
  await cloudSyncNow();
  return 'switched';
}

/** For screens: is this phone's key the household's current one? */
export async function keyStatus(): Promise<KeyStatus> {
  if (await getNextHouseholdKey()) return 'waiting';
  const h = household();
  const current = await getHouseholdKey();
  if (!h?.keyId || (current && keyIdOf(current) === h.keyId)) return 'current';
  return removedPhones(h).includes(getState().identity.deviceId) ? 'removed' : 'waiting';
}
