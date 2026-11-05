import type { Cycle } from './cycle';
import { isoToYMD, monthKey, type YMD } from './dates';
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
export function spendByCategory(transactions: Transaction[], month: string, uptoDay = 31): Map<string, Paise> {
  return spendWhere(transactions, (d) => monthKey(d) === month && Number(d.slice(8)) <= uptoDay);
}

/** Spend per category between two days, both included (a payday budget period). */
export function spendInRange(transactions: Transaction[], from: YMD, to: YMD): Map<string, Paise> {
  return spendWhere(transactions, (d) => d >= from && d <= to);
}

function spendWhere(transactions: Transaction[], within: (day: YMD) => boolean): Map<string, Paise> {
  const out = new Map<string, Paise>();
  for (const t of transactions) {
    if (t.deletedAt || t.status !== 'confirmed' || t.type !== 'expense') continue;
    const d = isoToYMD(t.occurredAt);
    if (!within(d)) continue;
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
  return usageOf(budgetsFor(budgets, month), spendByCategory(transactions, month));
}

/** Budget use over a payday period: the limits set for the month it mostly covers, spend inside it. */
export function cycleUsage(budgets: Budget[], transactions: Transaction[], cycle: Cycle): BudgetUsage[] {
  return usageOf(budgetsFor(budgets, cycle.key), spendInRange(transactions, cycle.start, cycle.end));
}

function usageOf(limits: Budget[], spend: Map<string, Paise>): BudgetUsage[] {
  return limits
    .map((b) => {
      const spent = spend.get(b.categoryId) ?? 0;
      const ratio = b.amount > 0 ? spent / b.amount : 0;
      return { categoryId: b.categoryId, limit: b.amount, spent, ratio, level: ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok' } as BudgetUsage;
    })
    .sort((a, b) => b.ratio - a.ratio);
}

export interface SafeToSpend {
  /** What today may cost, fixed for the day: (budget − spent before today − committed) ÷ days left. */
  allowance: Paise;
  left: Paise;
  /** close: at least 85% of today's allowance used. over: past it, or nothing is left this month. */
  state: 'ok' | 'close' | 'over';
  /** Tomorrow's allowance if today ends as it is now; null on the last day of the month. */
  tomorrow: Paise | null;
}

/**
 * "Am I okay today?" The allowance doesn't move as you spend during the day (a target that runs
 * away from you isn't one); spending today only uses it up. `daysLeft` counts today.
 */
export function safeToSpend({
  budget,
  spentBeforeToday,
  spentToday,
  committed,
  daysLeft,
}: {
  budget: Paise;
  spentBeforeToday: Paise;
  spentToday: Paise;
  committed: Paise;
  daysLeft: number;
}): SafeToSpend {
  const days = Math.max(1, daysLeft);
  const pool = budget - spentBeforeToday - committed;
  const allowance = Math.max(0, Math.floor(pool / days));
  const left = allowance - spentToday;
  const state = allowance === 0 || left < 0 ? 'over' : spentToday >= allowance * 0.85 ? 'close' : 'ok';
  const tomorrow = days > 1 ? Math.max(0, Math.floor((pool - spentToday) / (days - 1))) : null;
  return { allowance, left, state, tomorrow };
}

/**
 * Money already promised for the rest of this month: EMIs, bills and premiums due by `monthEnd`,
 * overdue ones included. They become expenses when paid, so the budget has to make room for them.
 * Card bills are left out: the spending on the card was counted when it happened, and paying the
 * bill is a transfer. Dues with no amount yet (a bill still to be entered) can't be counted.
 */
export function committedDues(dues: readonly { kind: string; amount: Paise | null; date: string; incoming: boolean }[], monthEnd: string): Paise {
  let sum = 0;
  for (const d of dues) if (!d.incoming && d.kind !== 'card' && d.amount && d.date <= monthEnd) sum += d.amount;
  return sum;
}
