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
};

export const columnsOf = (table: TableName) => [...Object.keys(COMMON), ...Object.keys(TABLES[table])];

function createTable(name: TableName): string {
  const cols = { ...COMMON, ...TABLES[name] };
  const body = Object.entries(cols)
    .map(([c, def]) => `"${c}" ${def}`)
    .join(', ');
  return `CREATE TABLE IF NOT EXISTS "${name}" (${body});\nCREATE INDEX IF NOT EXISTS "${name}_updated" ON "${name}"(updatedAt);`;
}

/** Append-only. Each entry runs once, tracked with PRAGMA user_version. */
export const MIGRATIONS: string[] = [
  [
    // v1 tables (later tables get their own migration below).
    ...(Object.keys(TABLES) as TableName[]).filter((t) => t !== 'sms_formats').map(createTable),
    'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);',
    'CREATE TABLE IF NOT EXISTS peers (deviceId TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, lastSentAt TEXT, lastReceivedAt TEXT, pairedAt TEXT NOT NULL);',
    'CREATE INDEX IF NOT EXISTS txn_when ON transactions(occurredAt);',
    'CREATE INDEX IF NOT EXISTS txn_link ON transactions(linkType, linkId);',
    'CREATE INDEX IF NOT EXISTS txn_ref ON transactions(sourceRef);',
    'CREATE INDEX IF NOT EXISTS txn_hash ON transactions(sourceHash);',
    'CREATE INDEX IF NOT EXISTS bills_biller ON bills(billerId);',
  ].join('\n'),
  // v2: user-taught SMS formats.
  createTable('sms_formats'),
  // v3: per-record cloud sync. For each household record: the server seq this phone last saw and
  // the updatedAt it had then. A row whose updatedAt differs has local edits to push.
  [
    'CREATE TABLE IF NOT EXISTS cloud_records (space TEXT NOT NULL, tbl TEXT NOT NULL, id TEXT NOT NULL, seq INTEGER NOT NULL, updatedAt TEXT NOT NULL, PRIMARY KEY (space, tbl, id));',
  ].join('\n'),
];
