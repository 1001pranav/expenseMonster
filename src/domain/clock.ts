/**
 * Sync clock: UTC corrected by how far this phone's clock is from the server's, so "newest edit
 * wins" compares the same clock on every phone. Learned from each cloud response (no network is
 * needed to save: offline edits use the last known correction). Only bookkeeping times
 * (createdAt / updatedAt / deletedAt, sync stamps) use it; "when you spent" stays phone time,
 * because that is what the user sees and agrees with.
 */

let offsetMs = 0;
let lastIssued = 0;

/** Ignore corrections smaller than this: the server's Date header only has 1 s resolution. */
export const MIN_CORRECTION_MS = 2_000;

export const clockOffsetMs = () => offsetMs;

export function setClockOffset(ms: number) {
  if (Number.isFinite(ms)) offsetMs = Math.round(ms);
}

/** Corrected UTC in ms. Never repeats and never goes backwards while the app runs, even when the correction changes. */
export function syncedNowMs(raw: number = Date.now()): number {
  lastIssued = Math.max(raw + offsetMs, lastIssued + 1);
  return lastIssued;
}

export const syncedNowISO = () => new Date(syncedNowMs()).toISOString();

/**
 * Server minus phone, from one request: the server stamped its Date header somewhere between
 * sending and receiving, so compare it with the midpoint. Null when the header is missing.
 */
export function offsetFromResponse(sentMs: number, receivedMs: number, dateHeader: string | null): number | null {
  const server = dateHeader ? Date.parse(dateHeader) : NaN;
  if (Number.isNaN(server)) return null;
  // The header is truncated to the second: on average the real server time is 0.5 s later.
  return server + 500 - (sentMs + receivedMs) / 2;
}

/** Whether a newly measured offset differs enough from the current one to adopt it. */
export const worthUpdating = (measured: number, current: number = offsetMs) => Math.abs(measured - current) >= MIN_CORRECTION_MS;

/** Test hook. */
export function resetClockForTests() {
  offsetMs = 0;
  lastIssued = 0;
}
