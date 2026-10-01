import { addDays, isoToYMD, monthKey, type YMD } from './dates';
import type { Paise } from './money';
import type { CategoryRule, Transaction } from './types';

export interface Split {
  categoryId: string;
  amount: Paise;
}

export function parseSplits(json: string | null): Split[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((s) => s && typeof s.categoryId === 'string' && Number.isInteger(s.amount)) : [];
  } catch {
    return [];
  }
}

export const isLive = (t: Transaction) => !t.deletedAt && t.status === 'confirmed';

export interface MonthTotals {
  income: Paise;
  expense: Paise;
  net: Paise;
  cardSpend: Paise;
}

/**
 * Income and expense for a month. Transfers (incl. credit-card bill payments) and
 * settlements are excluded: they move money between your own pockets / people.
 * Card refunds (income on a card) reduce expense instead of counting as income.
 */
export function monthTotals(transactions: Transaction[], month: string): MonthTotals {
  let income = 0;
  let expense = 0;
  let cardSpend = 0;
  for (const t of transactions) {
    if (!isLive(t) || monthKey(isoToYMD(t.occurredAt)) !== month) continue;
    if (t.type === 'expense') {
      expense += t.amount;
      if (t.method === 'card') cardSpend += t.amount;
    } else if (t.type === 'income') {
      if (t.method === 'card') expense -= t.amount;
      else income += t.amount;
    }
  }
  return { income, expense, net: income - expense, cardSpend };
}

/** Expense per day for the last `days` days ending `today` (oldest first). */
export function dailySpend(transactions: Transaction[], today: YMD, days: number): { date: YMD; amount: Paise }[] {
  const start = addDays(today, -(days - 1));
  const map = new Map<YMD, Paise>();
  for (const t of transactions) {
    if (!isLive(t) || t.type !== 'expense') continue;
    const d = isoToYMD(t.occurredAt);
    if (d < start || d > today) continue;
    map.set(d, (map.get(d) ?? 0) + t.amount);
  }
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(start, i);
    return { date, amount: map.get(date) ?? 0 };
  });
}

/** Totals for each of the last `count` months ending at `month` (oldest first). */
export function monthlySeries(transactions: Transaction[], month: string, count: number): ({ month: string } & MonthTotals)[] {
  const [y, m] = month.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const total = y * 12 + (m - 1) - (count - 1 - i);
    const key = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
    return { month: key, ...monthTotals(transactions, key) };
  });
}

/** Suggest a category from learned merchant/VPA rules (longest matching pattern wins). */
export function suggestCategory(text: string, rules: CategoryRule[]): string | null {
  const t = text.toLowerCase();
  const hit = rules
    .filter((r) => !r.deletedAt && r.pattern && t.includes(r.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  return hit?.categoryId ?? null;
}

/** Key used to learn a rule from a payee/VPA: "swiggy" from "Swiggy Ltd", "zomato" from "zomato@hdfcbank". */
export function ruleKey(payee: string | null, vpa: string | null): string | null {
  const source = (vpa?.split('@')[0] || payee || '').toLowerCase();
  const word = source
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .find((w) => w.length >= 4 && !/^\d+$/.test(w) && !['paytm', 'upi', 'pay', 'payment', 'ltd', 'private', 'limited'].includes(w));
  return word ?? null;
}

export const flagsOf = (t: Pick<Transaction, 'flags'>): string[] => (t.flags ? t.flags.split(',').filter(Boolean) : []);
