import { EXTRA } from '@/domain/sync/forward';
import type { TableName } from '@/domain/types';

const COMMON: Record<string, string> = {
  id: 'TEXT PRIMARY KEY NOT NULL',
  createdAt: 'TEXT NOT NULL',
  updatedAt: 'TEXT NOT NULL',
  deletedAt: 'TEXT',
  deviceId: 'TEXT NOT NULL',
  scope: "TEXT NOT NULL DEFAULT 'personal'",
};

const T = 'TEXT';
const TN = 'TEXT NOT NULL';
const I = 'INTEGER';
const IN0 = 'INTEGER NOT NULL DEFAULT 0';
const R = 'REAL';

/** Column definitions double as the write whitelist: unknown keys are never interpolated into SQL. */
export const TABLES: Record<TableName, Record<string, string>> = {
  accounts: { name: TN, type: TN, last4: T, openingBalance: IN0 },
  cards: { name: TN, last4: T, statementDay: I, dueDay: I, creditLimit: I, color: T },
  card_overrides: { cardId: TN, statementDate: TN, total: IN0, minDue: I },
  categories: { name: TN, icon: TN, color: TN, kind: TN, parentId: T, sortOrder: IN0 },
  members: { name: TN, upiId: T, phone: T, color: TN },
  transactions: {
    type: TN,
    amount: IN0,
    occurredAt: TN,
    categoryId: T,
    accountId: T,
    method: TN,
    cardId: T,
    payee: T,
    vpa: T,
    note: T,
    memberId: T,
    toMemberId: T,
    splitWith: T,
    splits: T,
    linkType: T,
    linkId: T,
    source: TN,
    sourceRef: T,
    sourceHash: T,
    confidence: R,
    flags: T,
    status: TN,
    attachment: T,
  },
  loans: {
    name: TN,
    direction: TN,
    kind: TN,
    lender: T,
    memberId: T,
    principal: IN0,
    ratePa: R,
    interestType: TN,
    tenureMonths: I,
    firstEmiDate: TN,
    emi: IN0,
    paidBeforeTracking: IN0,
    closed: IN0,
    upiId: T,
    note: T,
  },
  billers: {
    name: TN,
    type: TN,
    provider: T,
    consumerNo: T,
    frequency: TN,
    amountMode: TN,
    fixedAmount: I,
    billDay: I,
    dueOffsetDays: I,
    autopay: IN0,
    defaultMethod: T,
    defaultCardId: T,
    upiId: T,
    validityDays: I,
    categoryId: T,
    usageUnit: T,
    active: 'INTEGER NOT NULL DEFAULT 1',
  },
  bills: {
    billerId: TN,
    periodFrom: T,
    periodTo: T,
    billDate: TN,
    dueDate: TN,
    amount: IN0,
    lateFee: IN0,
    usage: R,
    validUntil: T,
    status: TN,
    attachment: T,
    sourceHash: T,
  },
  policies: {
    type: TN,
    insurer: TN,
    policyNo: T,
    name: TN,
    sumAssured: I,
    premium: IN0,
    frequency: TN,
    nextDueDate: TN,
    endDate: T,
    coveredMemberIds: T,
    nominee: T,
    autopay: IN0,
    active: 'INTEGER NOT NULL DEFAULT 1',
  },
  incomes: { name: TN, amount: IN0, frequency: TN, nextDate: TN, accountId: T, categoryId: T, active: 'INTEGER NOT NULL DEFAULT 1' },
  budgets: { categoryId: TN, month: TN, amount: IN0 },
  rules: { pattern: TN, categoryId: TN },
  sms_formats: { name: TN, sender: T, pattern: TN, roles: TN, direction: TN, isCard: IN0, active: 'INTEGER NOT NULL DEFAULT 1' },
  devices: { name: TN, publicKey: T },
  household: { headDeviceId: T, keyId: T, removed: T },
  sync_holds: { holdDevice: T, since: T, until: T, tbl: T, recordId: T, decision: TN, note: T },
  key_grants: { recipient: TN, keyId: TN, sealed: TN },
};

/** Tables created after v1, by the migration that created them (older migrations must skip them). */
const CREATED_IN: Partial<Record<TableName, number>> = { sms_formats: 2, devices: 5, household: 5, sync_holds: 5, key_grants: 6 };
/** Columns added to an existing table, by the migration that added them (with ALTER TABLE). */
const ADDED_IN: Partial<Record<TableName, Record<string, number>>> = {
  devices: { publicKey: 6 },
  household: { keyId: 6, removed: 6 },
};
const EXTRA_ADDED_IN = 4;
const tablesAt = (version: number) => (Object.keys(TABLES) as TableName[]).filter((t) => (CREATED_IN[t] ?? 1) <= version);

/** Column → SQL type, as checked on rows from other phones (domain/sync/validate.ts). */
export const columnDefsOf = (table: TableName): Record<string, string> => ({ ...COMMON, ...TABLES[table] });

/** Every column, including `extra`: fields from a newer app version (domain/sync/forward.ts). */
export const columnsOf = (table: TableName) => [...Object.keys(COMMON), ...Object.keys(TABLES[table]), EXTRA];

/**
 * The table as migration `version` creates it. Migrations run on fresh installs too, so a column
 * added later (ADDED_IN, `extra`) is left out here and added by its own ALTER TABLE migration;
 * otherwise a fresh install would add it twice.
 */
function createTable(name: TableName, version: number): string {
  const later = ADDED_IN[name] ?? {};
  const own = Object.fromEntries(Object.entries(TABLES[name]).filter(([c]) => (later[c] ?? 0) <= version));
  const cols = { ...COMMON, ...own, ...(version >= EXTRA_ADDED_IN ? { [EXTRA]: T } : {}) };
  const body = Object.entries(cols)
    .map(([c, def]) => `"${c}" ${def}`)
    .join(', ');
  return `CREATE TABLE IF NOT EXISTS "${name}" (${body});\nCREATE INDEX IF NOT EXISTS "${name}_updated" ON "${name}"(updatedAt);`;
}

/** Append-only. Each entry runs once, tracked with PRAGMA user_version. */
export const MIGRATIONS: string[] = [
  [
    // v1 tables (later tables get their own migration below).
    ...tablesAt(1).map((t) => createTable(t, 1)),
    'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);',
    'CREATE TABLE IF NOT EXISTS peers (deviceId TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, lastSentAt TEXT, lastReceivedAt TEXT, pairedAt TEXT NOT NULL);',
    'CREATE INDEX IF NOT EXISTS txn_when ON transactions(occurredAt);',
    'CREATE INDEX IF NOT EXISTS txn_link ON transactions(linkType, linkId);',
    'CREATE INDEX IF NOT EXISTS txn_ref ON transactions(sourceRef);',
    'CREATE INDEX IF NOT EXISTS txn_hash ON transactions(sourceHash);',
    'CREATE INDEX IF NOT EXISTS bills_biller ON bills(billerId);',
  ].join('\n'),
  // v2: user-taught SMS formats.
  createTable('sms_formats', 2),
  // v3: per-record cloud sync. For each household record: the server seq this phone last saw and
  // the updatedAt it had then. A row whose updatedAt differs has local edits to push.
  [
    'CREATE TABLE IF NOT EXISTS cloud_records (space TEXT NOT NULL, tbl TEXT NOT NULL, id TEXT NOT NULL, seq INTEGER NOT NULL, updatedAt TEXT NOT NULL, PRIMARY KEY (space, tbl, id));',
  ].join('\n'),
  // v4: keep data from newer app versions (domain/sync/forward.ts): unknown fields per row, and
  // whole records of tables this version doesn't have yet (never synced from here).
  [
    ...tablesAt(3).map((t) => `ALTER TABLE "${t}" ADD COLUMN "${EXTRA}" TEXT;`),
    'CREATE TABLE IF NOT EXISTS held_records (tbl TEXT NOT NULL, id TEXT NOT NULL, row TEXT NOT NULL, PRIMARY KEY (tbl, id));',
  ].join('\n'),
  // v5: household head and review (domain/sync/holds.ts, services/holds.ts). Synced: phones, who is
  // head, the head's rules. Local only: rows set aside for review, and versions replaced by other
  // phones' edits (so a held edit can be undone without asking anyone).
  [
    createTable('devices', 5),
    createTable('household', 5),
    createTable('sync_holds', 5),
    'CREATE TABLE IF NOT EXISTS aside_records (tbl TEXT NOT NULL, id TEXT NOT NULL, row TEXT NOT NULL, reason TEXT NOT NULL, receivedAt TEXT NOT NULL, PRIMARY KEY (tbl, id));',
    'CREATE TABLE IF NOT EXISTS row_history (tbl TEXT NOT NULL, id TEXT NOT NULL, updatedAt TEXT NOT NULL, row TEXT NOT NULL, savedAt TEXT NOT NULL, PRIMARY KEY (tbl, id, updatedAt));',
  ].join('\n'),
  // v6: removing a phone (services/rotation.ts): each phone's public key, the household's current key
  // id and removed phones, and the new key sealed to each remaining phone.
  [
    'ALTER TABLE "devices" ADD COLUMN "publicKey" TEXT;',
    'ALTER TABLE "household" ADD COLUMN "keyId" TEXT;',
    'ALTER TABLE "household" ADD COLUMN "removed" TEXT;',
    createTable('key_grants', 6),
  ].join('\n'),
];
