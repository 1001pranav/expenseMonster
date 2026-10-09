import { buildBundle, bundleSize } from '@/domain/sync/bundle';
import { describeRpcError, fullPushDue, mailboxId } from '@/domain/sync/cloud';
import { DecryptError, seal } from '@/domain/sync/crypto';
import { getMeta, setMeta } from '@/db/repo';
import { getState } from '@/db/store';
import { SUPABASE } from '@/config/supabase';
import { logFailure, logWarn } from './diagnostics';
import { getHouseholdKey } from './secure';
import { whenSyncReleased } from './syncHold';
import { collectRows, importSealed, loadConflicts } from './sync';

/**
 * Optional cloud sync through a Supabase project. The server only ever sees sealed bundles
 * (the same AES-256-GCM envelopes as .emx files) in a mailbox derived from the household key.
 * Only household rows are sent; private rows stay on the phone. Off unless the user enables it.
 */

const URL = SUPABASE.url.trim().replace(/\/+$/, '');
const KEY = SUPABASE.anonKey.trim();

/** A Supabase project is set in src/config/supabase.ts; without one the cloud option is hidden. */
export const cloudConfigured = Boolean(URL && KEY);

const PAGE = 20;
const TIMEOUT_MS = 20_000;

/** Call one of the SECURITY DEFINER functions; also used by the personal backup (vault.ts). */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        'Content-Type': 'application/json',
        // Legacy anon keys are JWTs and also go in Authorization; new publishable keys must not.
        ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}),
      },
      body: JSON.stringify(args),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      // The raw server answer is what explains a failure; it never contains plaintext data.
      logWarn(`cloud ${fn} → HTTP ${res.status}: ${body.slice(0, 300)}`);
      throw new Error(describeRpcError(fn, res.status, body));
    }
    return (await res.json()) as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      logWarn(`cloud ${fn} timed out after ${TIMEOUT_MS / 1000}s`);
      throw new Error('Cloud sync timed out. Check your connection.');
    }
    // fetch() rejects with a bare TypeError when the phone can't reach the server at all.
    if (e instanceof TypeError) {
      logFailure(`cloud ${fn} unreachable (${URL})`, e, 'warn');
      throw new Error(`Can't reach the cloud server (${URL}). Check your connection and EXPO_PUBLIC_SUPABASE_URL.`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export interface CloudStatus {
  at: string;
  ok: boolean;
  message: string;
}

export interface CloudResult {
  received: number;
  sent: number;
  pendingConflicts: number;
  /** Bundles in the mailbox that this household key could not open. */
  unreadable: number;
}

// Cursor and push stamps are per mailbox, so joining another household starts fresh.
const metaKey = (mailbox: string, name: string) => `cloud.${mailbox.slice(0, 16)}.${name}`;
const STATUS_KEY = 'cloud.status';

export async function loadCloudStatus(): Promise<CloudStatus | null> {
  try {
    return JSON.parse((await getMeta(STATUS_KEY)) ?? 'null');
  } catch (e) {
    logFailure('cloud sync: could not read status', e, 'warn');
    return null;
  }
}

async function pull(mailbox: string, deviceId: string) {
  let cursor = Number((await getMeta(metaKey(mailbox, 'cursor'))) ?? 0);
  let received = 0;
  let unreadable = 0;
  let pendingConflicts = (await loadConflicts()).length;
  for (;;) {
    const rows = await rpc<{ id: number; payload: string }[]>('emx_pull', { p_mailbox: mailbox, p_after: cursor, p_device: deviceId, p_limit: PAGE });
    for (const row of rows) {
      try {
        const r = await importSealed(row.payload);
        received += r.inserted + r.updated;
        pendingConflicts = r.pendingConflicts;
      } catch (e) {
        // Anyone with the public API key can post into a mailbox; junk simply fails to decrypt.
        if (!(e instanceof DecryptError)) throw e;
        logWarn(`cloud sync: skipped bundle ${row.id} that this household key can't open`);
        unreadable++;
      }
      cursor = row.id;
      await setMeta(metaKey(mailbox, 'cursor'), String(cursor));
    }
    if (rows.length < PAGE) break;
  }
  return { received, unreadable, pendingConflicts };
}

async function push(mailbox: string, key: Uint8Array): Promise<number> {
  const { identity } = getState();
  const fullAt = await getMeta(metaKey(mailbox, 'fullAt'));
  const full = fullPushDue(fullAt);
  const since = full ? null : await getMeta(metaKey(mailbox, 'pushedAt'));
  const startedAt = new Date().toISOString();
  const bundle = buildBundle(await collectRows(), {
    householdId: identity.householdId,
    deviceId: identity.deviceId,
    deviceName: identity.deviceName,
    since,
  });
  const rows = bundleSize(bundle);
  if (rows) await rpc<number>('emx_push', { p_mailbox: mailbox, p_device: identity.deviceId, p_payload: seal(bundle, key, identity.householdId) });
  await setMeta(metaKey(mailbox, 'pushedAt'), startedAt);
  if (full) await setMeta(metaKey(mailbox, 'fullAt'), startedAt);
  return rows;
}

let inFlight: Promise<CloudResult> | null = null;

/** Download new bundles from family phones, then upload this phone's changes. */
export function cloudSyncNow(): Promise<CloudResult> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      if (!cloudConfigured) throw new Error('This build has no cloud server configured');
      if (!getState().settings.cloudSync) throw new Error('Cloud sync is turned off');
      const key = await getHouseholdKey();
      if (!key) throw new Error('Household key missing');
      const { identity } = getState();
      const mailbox = mailboxId(key, identity.householdId);
      const pulled = await pull(mailbox, identity.deviceId);
      const sent = await push(mailbox, key);
      const result = { ...pulled, sent };
      await setMeta(STATUS_KEY, JSON.stringify({ at: new Date().toISOString(), ok: true, message: `Received ${pulled.received}, sent ${sent}` } satisfies CloudStatus));
      return result;
    } catch (e) {
      logFailure('cloud sync failed', e);
      await setMeta(STATUS_KEY, JSON.stringify({ at: new Date().toISOString(), ok: false, message: (e as Error).message } satisfies CloudStatus)).catch((m) => logFailure('cloud sync: could not save status', m, 'warn'));
      throw e;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Cheap check for family edits while the app is open: download only, no upload (local edits
 * already trigger cloudSyncSoon). Returns null when there was nothing to do or a sync is running.
 */
export function cloudPullNow(): Promise<CloudResult | null> {
  if (!cloudConfigured || !getState().settings.cloudSync || inFlight) return Promise.resolve(null);
  const run = (async () => {
    try {
      const key = await getHouseholdKey();
      if (!key) throw new Error('Household key missing');
      const { identity } = getState();
      return { ...(await pull(mailboxId(key, identity.householdId), identity.deviceId)), sent: 0 };
    } finally {
      inFlight = null;
    }
  })();
  // Shares the guard with cloudSyncNow so two pulls never read the same cursor at once.
  inFlight = run;
  return run;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Debounced background sync; errors are kept in the status shown on the Sync screen. */
export function cloudSyncSoon(delayMs = 10_000, onResult?: (r: CloudResult) => void) {
  if (!cloudConfigured || !getState().settings.cloudSync) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    // Waits while a shared screenshot is being scanned; runs right after.
    whenSyncReleased(() => cloudSyncNow().then(onResult, () => {}));
  }, delayMs);
}
