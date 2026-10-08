import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { writeCacheFile } from './files';

/**
 * An on-phone log of errors, warnings and the steps a shared screenshot goes through, so a problem
 * that only happens on the user's phone can be traced. Kept in the app's private storage; it leaves
 * the phone only when the user taps Share. Log messages never include amounts or names.
 */
export type Level = 'info' | 'warn' | 'error';

const MAX = 300;
const file = () => new File(Paths.document, 'diagnostics.log');

function load(): string[] {
  try {
    const f = file();
    return f.exists ? f.textSync().split('\n').filter(Boolean).slice(-MAX) : [];
  } catch {
    return [];
  }
}

export const useDiagnostics = create<{ lines: string[] }>(() => ({ lines: load() }));

// The console methods as they were before capture, so logging never calls itself.
const original = { log: console.log, warn: console.warn, error: console.error };

const TAG: Record<Level, string> = { info: 'INFO ', warn: 'WARN ', error: 'ERROR' };

function write(level: Level, message: string) {
  const t = new Date();
  const stamp = `${t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} ${t.toTimeString().slice(0, 8)}`;
  // Multi-line messages (stack traces) stay one entry: indent continuation lines.
  const text = message.trim().slice(0, 4000).replace(/\n/g, '\n      ');
  const lines = [...useDiagnostics.getState().lines, `${stamp} ${TAG[level]} ${text}`].slice(-MAX);
  useDiagnostics.setState({ lines });
  try {
    // Synchronous on purpose: after a fatal error there is no later tick to finish an async write.
    const f = file();
    if (!f.exists) f.create();
    f.write(lines.join('\n'));
  } catch {
    // Logging must never break the app.
  }
}

/** A step worth tracing (also printed to logcat under ReactNativeJS). */
export function logInfo(message: string) {
  original.log(`[diag] ${message}`);
  write('info', message);
}

export const logWarn = (message: string) => write('warn', message);
export const logError = (message: string) => write('error', message);

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}${value.stack ? `\n${value.stack.split('\n').slice(1, 8).join('\n')}` : ''}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

let installed = false;

/** Capture every JS error, crash, unhandled promise rejection and console warning/error. */
export function installErrorCapture() {
  if (installed) return;
  installed = true;

  console.warn = (...args: unknown[]) => {
    write('warn', args.map(describe).join(' '));
    original.warn(...args);
  };
  console.error = (...args: unknown[]) => {
    write('error', args.map(describe).join(' '));
    original.error(...args);
  };

  const errorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void } }).ErrorUtils;
  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((e, fatal) => {
      write('error', `${fatal ? 'CRASH ' : ''}${describe(e)}`);
      previous(e, fatal);
    });
  }

  // Release builds don't track promise rejections at all; dev builds keep their own warning.
  const hermes = (globalThis as { HermesInternal?: { enablePromiseRejectionTracker?: (o: object) => void } }).HermesInternal;
  if (!__DEV__ && hermes?.enablePromiseRejectionTracker) {
    hermes.enablePromiseRejectionTracker({
      allRejections: true,
      onUnhandled: (_id: number, reason: unknown) => write('error', `Unhandled promise rejection: ${describe(reason)}`),
      onHandled: () => {},
    });
  }

  logInfo(`app started · ${appVersion()} · ${Device.manufacturer ?? ''} ${Device.modelName ?? ''} · Android ${Platform.Version}`);
}

/** e.g. "v1.0.0 (pr15 3f2a9c1)": the build the log came from (see app.config.ts). */
function appVersion(): string {
  const build = (Constants.expoConfig?.extra as { build?: string } | undefined)?.build;
  return `v${Constants.expoConfig?.version ?? '?'}${build ? ` (${build})` : ''}`;
}

export function diagnosticsText(): string {
  const header = [
    'ExpenseMonster diagnostics',
    `App ${appVersion()} · ${Device.manufacturer ?? ''} ${Device.modelName ?? ''} · ${Platform.OS} ${Platform.Version}`,
    `Shared ${new Date().toISOString()}`,
    '',
  ];
  return [...header, ...useDiagnostics.getState().lines].join('\n');
}

/** Hand the log to any app (WhatsApp, email, Drive…) as a text file. */
export async function shareDiagnostics() {
  const f = writeCacheFile(`expensemonster-log-${Date.now()}.txt`, diagnosticsText());
  await Sharing.shareAsync(f.uri, { mimeType: 'text/plain', dialogTitle: 'Share ExpenseMonster log', UTI: 'public.plain-text' });
}

export function clearDiagnostics() {
  useDiagnostics.setState({ lines: [] });
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}
