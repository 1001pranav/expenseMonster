import { addMonths, parts, type YMD } from './dates';
import type { Frequency } from './types';

export const FREQUENCY_MONTHS: Record<Frequency, number> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
};

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  monthly: 'Monthly',
  bimonthly: 'Every 2 months',
  quarterly: 'Quarterly',
  half_yearly: 'Half-yearly',
  yearly: 'Yearly',
};

/** Next occurrence after advancing `date` by one period, keeping the anchor day (31st stays 31st). */
export function advance(date: YMD, frequency: Frequency, anchorDay?: number): YMD {
  return addMonths(date, FREQUENCY_MONTHS[frequency], anchorDay ?? parts(date).d);
}

/** All occurrences of a schedule anchored at `start`, within [from, to]. */
export function occurrencesBetween(start: YMD, frequency: Frequency, from: YMD, to: YMD, limit = 500): YMD[] {
  const anchor = parts(start).d;
  const step = FREQUENCY_MONTHS[frequency];
  const out: YMD[] = [];
  for (let i = 0; i < limit; i++) {
    const d = addMonths(start, i * step, anchor);
    if (d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/** Occurrence number `index` (0-based) of a schedule. */
export const nthOccurrence = (start: YMD, frequency: Frequency, index: number): YMD =>
  addMonths(start, index * FREQUENCY_MONTHS[frequency], parts(start).d);

/** Convert an amount per period to a monthly equivalent (for budgeting views). */
export const monthlyEquivalent = (amount: number, frequency: Frequency): number =>
  Math.round(amount / FREQUENCY_MONTHS[frequency]);
