import { formatINR } from '@/domain/money';
import type { BaseRow } from '@/domain/types';

/** How synced records are named on the conflicts and review screens. */
export const TABLE_LABEL: Record<string, string> = {
  transactions: 'Transaction',
  loans: 'Loan',
  cards: 'Credit card',
  billers: 'Bill',
  bills: 'Bill amount',
  policies: 'Insurance',
  incomes: 'Income',
  members: 'Member',
  accounts: 'Account',
  categories: 'Category',
  budgets: 'Budget',
  rules: 'Auto-category rule',
  sms_formats: 'SMS format',
  card_overrides: 'Card statement',
  devices: 'Phone',
  household: 'Household head',
  sync_holds: 'Review rule',
};
const MONEY = /amount|principal|emi|premium|limit|total|minDue|fixedAmount|sumAssured|lateFee|openingBalance/i;
const rec = (r: BaseRow) => r as unknown as Record<string, unknown>;

export function show(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'deletedAt') return 'Deleted';
  if (typeof v === 'number' && MONEY.test(field)) return formatINR(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString();
  return String(v);
}

export const titleOf = (r: BaseRow) => {
  const x = rec(r);
  return String(x.payee ?? x.name ?? x.pattern ?? x.insurer ?? (typeof x.amount === 'number' ? formatINR(x.amount) : '') ?? '');
};
