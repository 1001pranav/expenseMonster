import { addDays, addMonths, diffDays, formatDay, formatMonth, fromParts, monthKey, parts, type YMD } from './dates';

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
