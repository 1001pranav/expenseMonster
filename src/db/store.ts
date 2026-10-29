import { create } from 'zustand';
import type { ConflictPolicy } from '@/domain/sync/merge';
import type { Scope, TableMap, TableName } from '@/domain/types';

export interface Settings {
  autoLockMinutes: number;
  biometric: boolean;
  screenSecure: boolean;
  reviewNudge: boolean;
  hideAmounts: boolean;
  wipeAfterFailures: boolean;
  /** Delete a capture's screenshot once it's approved. Off: it stays viewable on the entry. */
  deleteScreenshots: boolean;
  defaultTxnScope: Scope;
  theme: 'system' | 'light' | 'dark';
  syncConflictPolicy: ConflictPolicy;
  setupDismissed: boolean;
  /** Sync encrypted household records through Supabase (services/cloud.ts). Off by default: data stays on the phone. */
  cloudSync: boolean;
  /** Personal cloud backup, sealed with the user's password (services/vault.ts). Off by default. */
  vaultSync: boolean;
  /** Save a capture without asking when everything was read clearly (see isClearCapture); Undo is offered. */
  autoSaveCaptures: boolean;
  /** When the last bank SMS import the user asked for started (ms); the next one reads from here. */
  smsImportedTo: number | null;
  /** After the first import: read bank SMS received since the last one each time the app opens (never in the background). */
  smsCheckOnOpen: boolean;
  /** The Home card offering bank SMS reading was closed. */
  smsOfferDismissed: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  autoLockMinutes: 1,
  biometric: true,
  screenSecure: true,
  reviewNudge: true,
  hideAmounts: false,
  wipeAfterFailures: false,
  deleteScreenshots: false,
  defaultTxnScope: 'household',
  theme: 'system',
  syncConflictPolicy: 'ask',
  setupDismissed: false,
  cloudSync: false,
  vaultSync: false,
  autoSaveCaptures: true,
  smsImportedTo: null,
  smsCheckOnOpen: true,
  smsOfferDismissed: false,
};

export interface Identity {
  deviceId: string;
  deviceName: string;
  householdId: string;
  householdName: string;
  selfMemberId: string;
  onboarded: boolean;
}

type Tables = { [K in TableName]: TableMap[K][] };

export const EMPTY_TABLES: Tables = {
  accounts: [],
  cards: [],
  card_overrides: [],
  categories: [],
  members: [],
  transactions: [],
  loans: [],
  billers: [],
  bills: [],
  policies: [],
  incomes: [],
  budgets: [],
  rules: [],
  sms_formats: [],
  sms_senders: [],
  devices: [],
  household: [],
  sync_holds: [],
  key_grants: [],
  holdings: [],
  trades: [],
};

interface State {
  ready: boolean;
  tables: Tables;
  identity: Identity;
  settings: Settings;
  /** Incremented on every write; cheap dependency for memoised selectors. */
  version: number;
  setAll: (tables: Tables, identity: Identity, settings: Settings) => void;
  putRow: <K extends TableName>(table: K, row: TableMap[K]) => void;
  putRows: <K extends TableName>(table: K, rows: TableMap[K][]) => void;
  setIdentity: (patch: Partial<Identity>) => void;
  setSettings: (patch: Partial<Settings>) => void;
  reset: () => void;
}

const byNewest = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? 1 : -1);

export const useStore = create<State>((set) => ({
  ready: false,
  tables: EMPTY_TABLES,
  identity: { deviceId: '', deviceName: '', householdId: '', householdName: '', selfMemberId: '', onboarded: false },
  settings: DEFAULT_SETTINGS,
  version: 0,
  setAll: (tables, identity, settings) => set((s) => ({ tables, identity, settings, ready: true, version: s.version + 1 })),
  putRow: (table, row) =>
    set((s) => {
      const list = s.tables[table] as TableMap[typeof table][];
      const rest = list.filter((r) => r.id !== row.id);
      const next = row.deletedAt ? rest : [row, ...rest].sort(byNewest);
      return { tables: { ...s.tables, [table]: next }, version: s.version + 1 };
    }),
  putRows: (table, rows) =>
    set((s) => {
      const ids = new Set(rows.map((r) => r.id));
      const list = (s.tables[table] as TableMap[typeof table][]).filter((r) => !ids.has(r.id));
      const next = [...list, ...rows.filter((r) => !r.deletedAt)].sort(byNewest);
      return { tables: { ...s.tables, [table]: next }, version: s.version + 1 };
    }),
  setIdentity: (patch) => set((s) => ({ identity: { ...s.identity, ...patch } })),
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  reset: () => set({ ready: false, tables: EMPTY_TABLES, version: 0 }),
}));

/** Non-hook access for services. */
export const getState = () => useStore.getState();
