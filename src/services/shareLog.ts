import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';

/**
 * A short record of what happened to the last few shared screenshots (received, copied, opened,
 * read), kept on the phone so a share that "does nothing" can be traced. No amounts or names.
 */
const MAX = 60;
const file = () => new File(Paths.document, 'share-log.txt');

function load(): string[] {
  try {
    const f = file();
    return f.exists ? f.textSync().split('\n').filter(Boolean).slice(-MAX) : [];
  } catch {
    return [];
  }
}

export const useShareLog = create<{ lines: string[] }>(() => ({ lines: load() }));

export function logShare(event: string) {
  const t = new Date();
  const stamp = `${t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} ${t.toTimeString().slice(0, 8)}`;
  // Also to logcat (tag ReactNativeJS), so the same trail shows over adb or in an emulator test.
  console.log(`[share] ${event}`);
  const lines = [...useShareLog.getState().lines, `${stamp}  ${event}`].slice(-MAX);
  useShareLog.setState({ lines });
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(lines.join('\n'));
  } catch {
    // Logging must never break sharing.
  }
}

export function clearShareLog() {
  useShareLog.setState({ lines: [] });
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}
