import { isoToYMD, monthKey } from './dates';
import type { Paise } from './money';
import { parseSplits } from './transactions';
import type { Budget, Transaction } from './types';

export interface BudgetUsage {
  categoryId: string;
  limit: Paise;
  spent: Paise;
  ratio: number;
  level: 'ok' | 'warn' | 'over';
}

/** Spend per category for a month, honouring category splits. Card bill payments are transfers, so never counted. */
export function spendByCategory(transactions: Transaction[], month: string): Map<string, Paise> {
  const out = new Map<string, Paise>();
  for (const t of transactions) {
    if (t.deletedAt || t.status !== 'confirmed' || t.type !== 'expense') continue;
    if (monthKey(isoToYMD(t.occurredAt)) !== month) continue;
    const splits = parseSplits(t.splits);
    const parts = splits.length ? splits : [{ categoryId: t.categoryId ?? 'uncategorised', amount: t.amount }];
    for (const p of parts) out.set(p.categoryId, (out.get(p.categoryId) ?? 0) + p.amount);
  }
  return out;
}

/** Month-specific budgets override the "*" (every month) default for the same category. */
export function budgetsFor(budgets: Budget[], month: string): Budget[] {
  const live = budgets.filter((b) => !b.deletedAt);
  const specific = new Map(live.filter((b) => b.month === month).map((b) => [b.categoryId, b]));
  const defaults = live.filter((b) => b.month === '*' && !specific.has(b.categoryId));
  return [...specific.values(), ...defaults];
}

export function budgetUsage(budgets: Budget[], transactions: Transaction[], month: string): BudgetUsage[] {
  const spend = spendByCategory(transactions, month);
  return budgetsFor(budgets, month)
    .map((b) => {
      const spent = spend.get(b.categoryId) ?? 0;
      const ratio = b.amount > 0 ? spent / b.amount : 0;
      return { categoryId: b.categoryId, limit: b.amount, spent, ratio, level: ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok' } as BudgetUsage;
    })
    .sort((a, b) => b.ratio - a.ratio);
}
