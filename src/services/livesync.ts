import { AppState } from 'react-native';
import { cloudPullNow, type CloudResult } from './cloud';
import { logFailure } from './diagnostics';
import { isSyncHeld } from './syncHold';
import { vaultCheckNow } from './vault';

const EVERY_MS = 30_000;
const MAX_BACKOFF_MS = 5 * 60_000;

/**
 * While the app is open and unlocked, look for edits from other phones every 30 s, so a family
 * member's entry shows up without leaving the app. Each check is one small request when nothing
 * changed. Failures (offline, server down) back off up to 5 min; only the first of a streak is
 * logged. Returns a stop function.
 */
export function startLiveSync(onCloudResult: (r: CloudResult) => void): () => void {
  let stopped = false;
  let delay = EVERY_MS;
  let timer: ReturnType<typeof setTimeout>;

  const tick = async () => {
    if (stopped) return;
    if (AppState.currentState === 'active' && !isSyncHeld()) {
      try {
        const r = await cloudPullNow();
        if (r && !stopped) onCloudResult(r);
        await vaultCheckNow();
        delay = EVERY_MS;
      } catch (e) {
        if (delay === EVERY_MS) logFailure('live sync check failed, backing off', e, 'warn');
        delay = Math.min(delay * 2, MAX_BACKOFF_MS);
      }
    }
    if (!stopped) timer = setTimeout(tick, delay);
  };

  timer = setTimeout(tick, delay);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
