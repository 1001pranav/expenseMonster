import * as AI from 'expo-ai-kit';
import * as Device from 'expo-device';
import { AppState, Platform } from 'react-native';
import { answer, type Answer, type ChatMessage, type Generate } from '@/domain/assistant/answer';
import { financeTools, type FinanceSnapshot } from '@/domain/assistant/tools';
import { todayYMD } from '@/domain/dates';
import { getState } from '@/db/store';
import { logFailure } from './diagnostics';

/**
 * Optional on-device assistant ("model pack"). The LiteRT-LM runtime ships in the app; the
 * Gemma 4 E2B weights (~2.6 GB) are downloaded only if the user asks, verified by SHA-256,
 * stored in app-private storage and deletable from Settings. Prompts and data never leave
 * the phone: the only network use is that one download.
 */

export const MODEL_ID = 'gemma-e2b';

/** Below this the model would compete with the app itself for memory. */
const MIN_RAM = 4 * 1024 ** 3;
/** 4–6 GB phones work but slowly; we say so before a 2.6 GB download. */
const COMFORT_RAM = 6 * 1024 ** 3;
/** Free the ~1.5 GB the model holds once the user stops asking. */
const IDLE_UNLOAD_MS = 2 * 60_000;

export type PackState =
  | { kind: 'unsupported'; reason: string }
  | { kind: 'not-installed'; sizeBytes: number; slowDevice: boolean; license: string }
  | { kind: 'downloading' }
  | { kind: 'installed'; sizeBytes: number };

function deviceCheck(): string | null {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return 'Only available on phones.';
  if (!Device.isDevice) return 'Not available on emulators.';
  const ram = Device.totalMemory ?? 0;
  if (ram && ram < MIN_RAM) return `Needs a phone with at least 4 GB of memory (this one has ${(ram / 1024 ** 3).toFixed(1)} GB).`;
  return null;
}

export async function packState(): Promise<PackState> {
  const blocked = deviceCheck();
  if (blocked) return { kind: 'unsupported', reason: blocked };
  try {
    const model = (await AI.getDownloadableModels()).find((m) => m.id === MODEL_ID);
    if (!model) return { kind: 'unsupported', reason: 'This app build does not include the assistant runtime.' };
    if (model.status === 'downloading') return { kind: 'downloading' };
    if (model.status === 'not-downloaded') {
      return { kind: 'not-installed', sizeBytes: model.sizeBytes, slowDevice: (Device.totalMemory ?? 0) < COMFORT_RAM, license: model.license };
    }
    return { kind: 'installed', sizeBytes: model.sizeBytes };
  } catch (e) {
    logFailure('assistant: status check failed', e, 'warn');
    return { kind: 'unsupported', reason: friendly(e) };
  }
}

export const installPack = (onProgress: (p: number) => void) => AI.downloadModel(MODEL_ID, { onProgress });
export const cancelInstall = () => AI.cancelDownload(MODEL_ID);

export async function removePack(): Promise<void> {
  await unload();
  await AI.deleteModel(MODEL_ID);
}

// ── loading / unloading ──────────────────────────────────────────────────

let loaded = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

async function unload() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (!loaded) return;
  loaded = false;
  await AI.unloadModel().catch(() => {});
}

AppState.addEventListener('change', (s) => {
  if (s === 'background') unload();
});

async function ensureLoaded() {
  if (idleTimer) clearTimeout(idleTimer);
  if (loaded) return;
  // Low temperature: we want the same, literal answer for the same data.
  await AI.setModel(MODEL_ID, { generation: { temperature: 0.2, topK: 40 } });
  loaded = true;
}

function scheduleUnload() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => unload(), IDLE_UNLOAD_MS);
}

// ── asking ───────────────────────────────────────────────────────────────

function snapshot(): FinanceSnapshot {
  const t = getState().tables;
  return {
    transactions: t.transactions,
    loans: t.loans,
    cards: t.cards,
    cardOverrides: t.card_overrides,
    billers: t.billers,
    bills: t.bills,
    policies: t.policies,
    incomes: t.incomes,
    categories: t.categories,
    budgets: t.budgets,
  };
}

export async function ask(question: string, history: ChatMessage[], priorSources: string[], signal?: AbortSignal): Promise<Answer> {
  await ensureLoaded();
  try {
    // Tools see the data as it is now; the model only ever gets their (formatted) results.
    const tools = Object.fromEntries(
      Object.entries(financeTools(snapshot(), todayYMD())).map(([name, t]) => [name, { description: t.description, parameters: t.parameters, execute: t.run }]),
    ) as AI.ToolSet;
    const generate: Generate = async (messages) => {
      const r = await AI.generateText(messages, { tools, maxSteps: 4, signal });
      return { text: r.text, toolResults: r.toolResults.map((x) => ({ toolName: x.toolName, result: x.result })) };
    };
    return await answer(generate, question, history, priorSources);
  } finally {
    scheduleUnload();
  }
}

/** Plain-language error for the UI from expo-ai-kit's typed errors. */
export function friendly(e: unknown): string {
  const code = e instanceof AI.ModelError ? e.code : null;
  switch (code) {
    case 'DOWNLOAD_STORAGE_FULL':
      return 'Not enough free space. The assistant needs about 2.6 GB.';
    case 'DOWNLOAD_CORRUPT':
      return 'The download was damaged and has been discarded. Please try again.';
    case 'DOWNLOAD_FAILED':
      return 'Download failed. Check your connection (Wi-Fi recommended) and try again.';
    case 'DOWNLOAD_CANCELLED':
      return 'Download cancelled.';
    case 'INFERENCE_OOM':
      return 'The phone ran out of memory. Close other apps and try again.';
    case 'INFERENCE_FAILED':
      return 'I couldn’t work that one out. Try asking more simply, e.g. “food spending in August”.';
    case 'INFERENCE_BUSY':
      return 'Still working on the previous question.';
    case 'INFERENCE_CANCELLED':
      return 'Stopped.';
    case 'MODEL_NOT_DOWNLOADED':
      return 'The assistant is not installed yet.';
    case 'LLM_NOT_ENABLED':
      return 'This app build does not include the assistant runtime.';
    case 'DEVICE_NOT_SUPPORTED':
      return 'This phone cannot run the assistant.';
    case 'MODEL_LOAD_FAILED':
      return 'The assistant could not start. Try again, or reinstall it from Settings.';
    default:
      return (e as Error)?.message ?? 'Something went wrong.';
  }
}
