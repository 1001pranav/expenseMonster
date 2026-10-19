import { create } from 'zustand';

/**
 * Pauses automatic syncing while a shared screenshot is being scanned and approved, so the scan
 * isn't competing with downloads and merges. Manual "Sync now" ignores the hold. Released when the
 * user leaves the scan flow (see ShareHoldWatcher in app/_layout.tsx), or after 15 min at the latest.
 */
export const useSyncHold = create<{ held: boolean }>(() => ({ held: false }));

const MAX_HOLD_MS = 15 * 60_000;
let waiters: (() => void)[] = [];
let safety: ReturnType<typeof setTimeout> | null = null;

export const isSyncHeld = () => useSyncHold.getState().held;

export function holdSync() {
  if (safety) clearTimeout(safety);
  safety = setTimeout(releaseSync, MAX_HOLD_MS);
  useSyncHold.setState({ held: true });
}

export function releaseSync() {
  if (safety) clearTimeout(safety);
  safety = null;
  if (!isSyncHeld()) return;
  useSyncHold.setState({ held: false });
  const run = waiters;
  waiters = [];
  for (const fn of run) fn();
}

/** Run now, or as soon as the hold is released. */
export function whenSyncReleased(fn: () => void) {
  if (isSyncHeld()) waiters.push(fn);
  else fn();
}
