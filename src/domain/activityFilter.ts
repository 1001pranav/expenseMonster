import { addDays, isoToYMD, monthKey, type YMD } from './dates';
import { parseSplits } from './transactions';
import type { Category, Transaction } from './types';

/** Which days the Spending list covers. */
export type Period = { kind: 'month'; month: string } | { kind: 'last30' } | { kind: 'all' } | { kind: 'day'; day: YMD } | { kind: 'range'; from: YMD; to: YMD };

/** Spending entries, money in (refunds included), or both. Transfers and settlements show only under "all". */
export type Flow = 'all' | 'expense' | 'income';

/** How it was paid or where it stands. */
export type Kind = 'all' | 'card' | 'upi' | 'pending' | 'shared';

export interface ActivityFilter {
  period: Period;
  flow: Flow;
  kind: Kind;
  /** Picked categories; a parent includes its sub-categories. Empty = any. */
  categoryIds: string[];
  cardId?: string | null;
  query?: string;
}

/** A picked parent category stands for its sub-categories too. */
export function expandCategories(ids: string[], categories: Category[]): Set<string> {
  const out = new Set(ids);
  for (const c of categories) if (c.parentId && out.has(c.parentId)) out.add(c.id);
  return out;
}

export function inPeriod(day: YMD, period: Period, today: YMD): boolean {
  switch (period.kind) {
    case 'month':
      return monthKey(day) === period.month;
    case 'last30':
      return day >= addDays(today, -30);
    case 'day':
      return day === period.day;
    case 'range': {
      // Either order: picking "to" before "from" shouldn't empty the list.
      const [from, to] = period.from <= period.to ? [period.from, period.to] : [period.to, period.from];
      return day >= from && day <= to;
    }
    default:
      return true;
  }
}

export function filterActivity(transactions: Transaction[], f: ActivityFilter, categories: Category[], today: YMD): Transaction[] {
  const q = f.query?.trim().toLowerCase() ?? '';
  const picked = f.categoryIds.length ? expandCategories(f.categoryIds, categories) : null;
  const name = new Map(categories.map((c) => [c.id, c.name]));
  return transactions.filter((t) => {
    if (t.status === 'rejected') return false;
    if (!inPeriod(isoToYMD(t.occurredAt), f.period, today)) return false;
    if (f.flow === 'expense' && t.type !== 'expense') return false;
    if (f.flow === 'income' && t.type !== 'income') return false;
    if (f.kind === 'card' && t.method !== 'card') return false;
    if (f.kind === 'upi' && t.method !== 'upi') return false;
    if (f.kind === 'pending' && t.status !== 'pending') return false;
    if (f.kind === 'shared' && t.scope !== 'household') return false;
    if (f.cardId && t.cardId !== f.cardId) return false;
    // A split entry counts when any of its parts is in a picked category.
    if (picked && !(picked.has(t.categoryId ?? '') || parseSplits(t.splits).some((s) => picked.has(s.categoryId)))) return false;
    if (q) {
      const hay = `${t.payee ?? ''} ${t.note ?? ''} ${t.vpa ?? ''} ${name.get(t.categoryId ?? '') ?? ''} ${(t.amount / 100).toFixed(0)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
