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

/**
 * Turn a failed Supabase RPC response into a message a person can act on. The raw PostgREST body
 * is JSON like {"code":"PGRST202","message":"Could not find the function …"}.
 */
export function describeRpcError(fn: string, status: number, body: string): string {
  let err: { code?: string; message?: string } = {};
  try {
    err = JSON.parse(body) ?? {};
  } catch {
    // Not JSON (proxy or gateway page): fall through to the generic message.
  }
  const migration = fn.startsWith('emx_vault_') ? '20261008000000_emx_vault.sql' : '20261002000000_emx_cloud_sync.sql';
  if (err.code === 'PGRST202' || (status === 404 && /function/i.test(err.message ?? ''))) {
    return `The cloud server is not set up for this feature yet. Run supabase/migrations/${migration} in the Supabase SQL editor.`;
  }
  if (status === 401 || status === 403 || err.code === 'PGRST301' || /api key/i.test(err.message ?? '')) {
    return 'The cloud server refused this app (API key). Check EXPO_PUBLIC_SUPABASE_ANON_KEY in the build.';
  }
  // Errors raised on purpose by our SQL functions (errcode P0001) are already readable.
  if (err.code === 'P0001' && err.message) return err.message;
  return `Cloud request failed (${status})${err.message ? `: ${err.message.slice(0, 160)}` : body ? `: ${body.slice(0, 160)}` : ''}`;
}
