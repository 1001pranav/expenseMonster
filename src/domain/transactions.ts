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
export function monthTotals(transactions: Transaction[], month: string, uptoDay = 31): MonthTotals {
  let income = 0;
  let expense = 0;
  let cardSpend = 0;
  for (const t of transactions) {
    const d = isoToYMD(t.occurredAt);
    if (!isLive(t) || monthKey(d) !== month || Number(d.slice(8)) > uptoDay) continue;
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

/**
 * Keys that identify the same payee across name spellings and UPI IDs: "MC DONALDS", "McDonald's"
 * and "mcdonalds.27312402@hdfcbank" all share "mcdonalds".
 */
export function payeeKeys(payee: string | null, vpa: string | null): string[] {
  const keys = new Set<string>();
  const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const name = letters(payee ?? '');
  if (name.length >= 4) keys.add(`n:${name}`);
  if (vpa) {
    const v = vpa.toLowerCase();
    keys.add(`v:${v}`);
    // The readable part of a merchant VPA ("mcdonalds" in "mcdonalds.27312402@hdfcbank"), not a phone number.
    const local = letters(v.split('@')[0].split(/[.\-_]/)[0]);
    if (local.length >= 4 && !['paytm', 'phonepe', 'gpay', 'upi', 'bhim'].includes(local)) keys.add(`n:${local}`);
  }
  return [...keys];
}

export interface CategoryChoice {
  categoryId: string;
  /** Approved transactions with this payee filed under this category. */
  count: number;
  lastAt: string;
}

/**
 * The categories this payee was filed under before, most used first (most recent on a tie). Two or
 * more entries means the user has filed them differently, so both are offered.
 */
export function categoryHistory(payee: string | null, vpa: string | null, type: Transaction['type'], txns: Transaction[], excludeId?: string): CategoryChoice[] {
  const keys = new Set(payeeKeys(payee, vpa));
  if (!keys.size) return [];
  const byCategory = new Map<string, CategoryChoice>();
  for (const t of txns) {
    if (t.id === excludeId || t.deletedAt || t.status !== 'confirmed' || t.type !== type || !t.categoryId) continue;
    if (!payeeKeys(t.payee, t.vpa).some((k) => keys.has(k))) continue;
    const c = byCategory.get(t.categoryId) ?? { categoryId: t.categoryId, count: 0, lastAt: '' };
    c.count++;
    if (t.occurredAt > c.lastAt) c.lastAt = t.occurredAt;
    byCategory.set(t.categoryId, c);
  }
  return [...byCategory.values()].sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
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

/**
 * Fair month-over-month change: a month in progress is compared with the same number of
 * days of the previous month (1–10 Oct vs 1–10 Sep), not with all of September.
 */
export function comparableChange(current: Paise, previous: Paise): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}
