import { addDays, addMonths, diffDays, formatDay, formatMonth, fromParts, monthKey, parts, type YMD } from './dates';
import type { RecurringIncome } from './types';

/**
 * A budget period that starts on payday. With payday = 1 it is exactly the calendar month; with
 * payday = 25 the "November" period runs 25 Oct – 24 Nov, because that's the money you live on
 * through November. Paydays are 1–28, so every month has the day.
 */
export interface Cycle {
  start: YMD;
  /** Last day, inclusive. */
  end: YMD;
  /** The month holding most of the period ('YYYY-MM'): budgets set for a month apply to it. */
  key: string;
  days: number;
}

export function clampPayday(day: number): number {
  return Number.isFinite(day) ? Math.min(28, Math.max(1, Math.round(day))) : 1;
}

export function cycleFor(date: YMD, payday: number): Cycle {
  const p = clampPayday(payday);
  const { y, m, d } = parts(date);
  const start = d >= p ? fromParts(y, m, p) : addMonths(fromParts(y, m, p), -1);
  const end = addDays(addMonths(start, 1), -1);
  return { start, end, key: monthKey(addDays(start, 15)), days: diffDays(end, start) + 1 };
}

/** The period `n` periods before (n < 0) or after (n > 0) the one holding `date`. */
export function shiftCycle(date: YMD, payday: number, n: number): Cycle {
  return cycleFor(addMonths(cycleFor(date, payday).start, n), payday);
}

/** "November" for calendar months, "25 Oct – 24 Nov" for a payday period. */
export function cycleLabel(c: Cycle): string {
  if (parts(c.start).d === 1) return formatMonth(c.key);
  const year = c.start.slice(0, 4) !== c.end.slice(0, 4);
  return `${formatDay(c.start, { year })} – ${formatDay(c.end, { year })}`;
}

/** How budgets are measured (Settings › Budget period). */
export type BudgetPeriod = 'calendar' | 'payday';

/** The start day actually used: 1 for calendar months, the chosen payday otherwise. */
export function effectivePayday(period: BudgetPeriod | undefined, payday: number): number {
  return period === 'payday' ? clampPayday(payday) : 1;
}

/** The period budgets for `month` ('YYYY-MM') are measured over: the one holding its 15th. */
export function cycleForMonth(month: string, payday: number): Cycle {
  return cycleFor(`${month}-15`, payday);
}

/**
 * A payday to offer: the day the largest active monthly recurring income (salary) arrives.
 * Null when there's none, or it arrives on the 1st (that's already the calendar month).
 */
export function suggestPayday(incomes: readonly RecurringIncome[]): { day: number; name: string } | null {
  const monthly = incomes.filter((i) => i.active && !i.deletedAt && i.frequency === 'monthly');
  const top = monthly.sort((a, b) => b.amount - a.amount)[0];
  if (!top) return null;
  const day = clampPayday(parts(top.nextDate).d);
  return day === 1 ? null : { day, name: top.name };
}
