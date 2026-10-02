import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/ciphers/utils.js';

/**
 * Cloud mailbox id: derived one-way from the household key, so only paired phones can find the
 * household's bundles, and knowing the id (e.g. from a database leak) does not reveal the key.
 */
export function mailboxId(key: Uint8Array, householdId: string): string {
  const bytes = hkdf(sha256, key, utf8ToBytes(householdId), utf8ToBytes('emx-cloud-mailbox-v1'), 32);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The server keeps bundles for this long (see supabase/migrations). */
export const CLOUD_RETENTION_DAYS = 90;
/**
 * Re-upload every household row this often, well inside the retention window, so a phone that
 * joins later still finds rows last edited long ago.
 */
export const FULL_PUSH_DAYS = 30;

export function fullPushDue(lastFullAt: string | null, now: Date = new Date()): boolean {
  if (!lastFullAt) return true;
  return now.getTime() - Date.parse(lastFullAt) > FULL_PUSH_DAYS * 86_400_000;
}
