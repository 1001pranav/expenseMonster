import { clockOffsetMs, offsetFromResponse, setClockOffset, worthUpdating } from '@/domain/clock';
import { describeRpcError } from '@/domain/sync/cloud';
import { householdSpace, recordKey, sealRecord, type Space } from '@/domain/sync/records';
import { SYNC_TABLES } from '@/domain/types';
import { dirtyRows, getMeta, setMeta, setSyncMarks } from '@/db/repo';
import { getState } from '@/db/store';
import { SUPABASE } from '@/config/supabase';
import { logFailure, logWarn } from './diagnostics';
import { getHouseholdKey } from './secure';
import { whenSyncReleased } from './syncHold';
import { applyRecords, loadConflicts, type PulledRecord } from './sync';

/**
 * Optional cloud sync through a Supabase project, one encrypted server row per household record
 * (domain/sync/records.ts, supabase/migrations/…_emx_records.sql). The family shares one sequence
 * number: each phone remembers how far it has read and pulls only what came after. Only household
 * rows are sent; private rows stay on the phone. Off unless the user enables it.
 */

const URL = SUPABASE.url.trim().replace(/\/+$/, '');
const KEY = SUPABASE.anonKey.trim();

/** A Supabase project is set in src/config/supabase.ts; without one the cloud option is hidden. */
export const cloudConfigured = Boolean(URL && KEY);

const PAGE = 200;
/** Server limit is 65,536 characters per record. */
const MAX_RECORD_CHARS = 60_000;
const TIMEOUT_MS = 20_000;

export const CLOCK_META = 'clock.offsetMs';

/** Keep this phone's clock correction current from the server's Date header (see domain/clock.ts). */
function learnServerTime(sentAt: number, receivedAt: number, header: string | null) {
  const measured = offsetFromResponse(sentAt, receivedAt, header);
  if (measured === null || !worthUpdating(measured)) return;
  setClockOffset(measured);
  if (Math.abs(measured) > 120_000) logWarn(`phone clock is ${Math.round(measured / 1000)} s ${measured > 0 ? 'behind' : 'ahead of'} the server; edits are stamped with server time`);
  setMeta(CLOCK_META, String(clockOffsetMs())).catch((e) => logFailure('clock: could not save correction', e, 'warn'));
}

/** Call one of the SECURITY DEFINER functions; also used by the personal backup (vault.ts). */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const sentAt = Date.now();
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
    learnServerTime(sentAt, Date.now(), res.headers.get('date'));
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
  /** Records in the household's space that this household key could not open. */
  unreadable: number;
}

const STATUS_KEY = 'cloud.status';
// The cursor is per space, so joining another household starts fresh.
const cursorKey = (space: Space) => `cloud.space.${space.id.slice(0, 16)}.cursor`;

export async function loadCloudStatus(): Promise<CloudStatus | null> {
  try {
    return JSON.parse((await getMeta(STATUS_KEY)) ?? 'null');
  } catch (e) {
    logFailure('cloud sync: could not read status', e, 'warn');
    return null;
  }
}

async function currentSpace(): Promise<Space> {
  const key = await getHouseholdKey();
  if (!key) throw new Error('Household key missing');
  return householdSpace(key, getState().identity.householdId);
}

/** Download every record the family saved after this phone's cursor, page by page. */
async function pull(space: Space): Promise<Omit<CloudResult, 'sent'>> {
  let cursor = Number((await getMeta(cursorKey(space))) ?? 0);
  let received = 0;
  let unreadable = 0;
  for (;;) {
    const page = await rpc<PulledRecord[]>('emx_records_pull', { p_space: space.id, p_token: space.token, p_after: cursor, p_limit: PAGE });
    if (!page.length) break;
    const r = await applyRecords(space, page);
    received += r.received;
    unreadable += r.unreadable;
    cursor = Number(page[page.length - 1].seq);
    await setMeta(cursorKey(space), String(cursor));
    if (page.length < PAGE) break;
  }
  return { received, unreadable, pendingConflicts: (await loadConflicts()).length };
}

/**
 * Upload household rows changed on this phone, each naming the version it was edited from.
 * Records someone else changed in the meantime come back as conflicts and stay dirty.
 */
async function push(space: Space): Promise<{ sent: number; conflicts: number }> {
  const waiting = new Set((await loadConflicts()).map((c) => `${c.table}:${c.local.id}`));
  let cursor = Number((await getMeta(cursorKey(space))) ?? 0);
  let sent = 0;
  let conflicts = 0;
  for (const table of SYNC_TABLES) {
    let after = '';
    for (;;) {
      const batch = await dirtyRows(space.id, table, after, PAGE);
      if (!batch.length) break;
      after = batch[batch.length - 1].row.id;
      const items = [];
      for (const { row, base } of batch) {
        // A conflict waiting for the user's choice must not overwrite the other version.
        if (waiting.has(`${table}:${row.id}`)) continue;
        const payload = sealRecord(space, table, row);
        if (payload.length > MAX_RECORD_CHARS) {
          logWarn(`cloud sync: ${table} ${row.id} is too large to upload (${payload.length} chars), skipped`);
          continue;
        }
        items.push({ row, base, rkey: recordKey(space, table, row.id), payload });
      }
      if (items.length) {
        const res = await rpc<PushResult>('emx_records_push', {
          p_space: space.id,
          p_token: space.token,
          p_records: items.map((i) => ({ k: i.rkey, b: i.base, p: i.payload })),
        });
        const byKey = new Map(items.map((i) => [i.rkey, i.row]));
        // Remember the version that was sent: an edit made meanwhile has a newer updatedAt and stays dirty.
        await setSyncMarks(
          space.id,
          res.applied.map((a) => ({ table, id: byKey.get(a.k)!.id, seq: Number(a.s), updatedAt: byKey.get(a.k)!.updatedAt })),
        );
        sent += res.applied.length;
        conflicts += res.conflicts.length;
        // If the server numbered this batch right after what this phone had read, with nobody
        // else's records in between, move the read mark past it: no need to download our own.
        const seqs = res.applied.map((a) => Number(a.s)).sort((x, y) => x - y);
        if (seqs.length && seqs[0] === cursor + 1 && seqs[seqs.length - 1] === Number(res.head) && seqs.every((n, i) => n === cursor + 1 + i)) {
          cursor = Number(res.head);
          await setMeta(cursorKey(space), String(cursor));
        }
      }
      if (batch.length < PAGE) break;
    }
  }
  return { sent, conflicts };
}

interface PushResult {
  head: number;
  applied: { k: string; s: number | string }[];
  conflicts: string[];
}

/** Pull, push, and when someone changed the same records meanwhile: pull their versions, merge, push again. */
async function syncSpace(space: Space): Promise<CloudResult> {
  const total = { ...(await pull(space)), sent: 0 };
  for (let round = 0; round < 3; round++) {
    const pushed = await push(space);
    total.sent += pushed.sent;
    if (!pushed.conflicts) break;
    const again = await pull(space);
    total.received += again.received;
    total.unreadable += again.unreadable;
    total.pendingConflicts = again.pendingConflicts;
  }
  return total;
}

let inFlight: Promise<CloudResult> | null = null;
/**
 * Bumped whenever something may need uploading (an edit, the app coming back); a sync that
 * succeeds records the generation it started at. While they differ there may be unsent edits,
 * e.g. made offline, and the 30 s check does a full sync instead of only downloading.
 * Starts "unsent": after the app was killed, the first check makes sure everything went out.
 */
let generation = 1;
let syncedGeneration = 0;
let checking: Promise<CloudResult | null> | null = null;

/** Download the family's new records, then upload this phone's changes. */
export function cloudSyncNow(): Promise<CloudResult> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      if (!cloudConfigured) throw new Error('This build has no cloud server configured');
      if (!getState().settings.cloudSync) throw new Error('Cloud sync is turned off');
      // Never read the same cursor twice at once: let a running check finish first.
      if (checking) await checking.catch(() => {});
      const started = generation;
      const result = await syncSpace(await currentSpace());
      syncedGeneration = Math.max(syncedGeneration, started);
      await setMeta(STATUS_KEY, JSON.stringify({ at: new Date().toISOString(), ok: true, message: `Received ${result.received}, sent ${result.sent}` } satisfies CloudStatus));
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
 * Cheap check for family edits while the app is open: one request for the family's sequence number,
 * and a download only when it moved past this phone's cursor. Returns null when there was nothing
 * to do or a sync is running.
 */
export function cloudPullNow(): Promise<CloudResult | null> {
  if (!cloudConfigured || !getState().settings.cloudSync || inFlight || checking) return Promise.resolve(null);
  // Edits still waiting to go out (made offline, or the last sync failed): upload them now.
  if (syncedGeneration < generation) return cloudSyncNow();
  checking = (async () => {
    try {
      const space = await currentSpace();
      const head = Number(await rpc<number>('emx_space_head', { p_space: space.id, p_token: space.token }));
      if (head <= Number((await getMeta(cursorKey(space))) ?? 0)) return null;
      return { ...(await pull(space)), sent: 0 };
    } finally {
      checking = null;
    }
  })();
  return checking;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Debounced background sync; errors are kept in the status shown on the Sync screen. */
export function cloudSyncSoon(delayMs = 10_000, onResult?: (r: CloudResult) => void) {
  if (!cloudConfigured || !getState().settings.cloudSync) return;
  generation++;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    // Waits while a shared screenshot is being scanned; runs right after.
    whenSyncReleased(() => cloudSyncNow().then(onResult, () => {}));
  }, delayMs);
}
