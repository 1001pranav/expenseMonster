import type { BaseRow, Bill, Biller, CreditCard, Transaction } from '../types';

let n = 0;
export const base = (over: Partial<BaseRow> = {}): BaseRow => ({
  id: `id-${++n}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  deviceId: 'dev-a',
  scope: 'household',
  ...over,
});

export const txn = (over: Partial<Transaction>): Transaction => ({
  ...base(),
  type: 'expense',
  amount: 100_00,
  occurredAt: '2026-09-10T06:30:00.000Z',
  categoryId: null,
  accountId: null,
  method: 'upi',
  cardId: null,
  payee: null,
  vpa: null,
  note: null,
  memberId: null,
  toMemberId: null,
  splitWith: null,
  splits: null,
  linkType: null,
  linkId: null,
  source: 'manual',
  sourceRef: null,
  sourceHash: null,
  confidence: null,
  flags: null,
  status: 'confirmed',
  attachment: null,
  ...over,
});

export const card = (over: Partial<CreditCard> = {}): CreditCard => ({
  ...base({ id: 'card-1' }),
  name: 'HDFC Millennia',
  last4: '5678',
  statementDay: 15,
  dueDay: 5,
  creditLimit: 1_00_000_00,
  color: null,
  ...over,
});

export const biller = (over: Partial<Biller> = {}): Biller => ({
  ...base({ id: 'biller-1' }),
  name: 'BESCOM – Home',
  type: 'electricity',
  provider: 'BESCOM',
  consumerNo: '1234567890',
  frequency: 'monthly',
  amountMode: 'variable',
  fixedAmount: null,
  billDay: 5,
  dueOffsetDays: 15,
  autopay: 0,
  defaultMethod: null,
  defaultCardId: null,
  upiId: null,
  validityDays: null,
  categoryId: null,
  usageUnit: 'kWh',
  active: 1,
  ...over,
});

export const bill = (over: Partial<Bill> = {}): Bill => ({
  ...base(),
  billerId: 'biller-1',
  periodFrom: null,
  periodTo: null,
  billDate: '2026-09-05',
  dueDate: '2026-09-20',
  amount: 1840_00,
  lateFee: 0,
  usage: null,
  validUntil: null,
  status: 'open',
  attachment: null,
  sourceHash: null,
  ...over,
});

/** ISO timestamp at local noon on a date (avoids TZ edge cases in tests). */
export const at = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
};
