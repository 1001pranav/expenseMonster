import { daysInMonth, fromParts, parts, type YMD } from './dates';

/**
 * Picking dates on one calendar: the first tap picks a day; tapping it again keeps just that day,
 * tapping another day makes a range (in whichever order they were tapped); a tap after a finished
 * pick starts over.
 */
export interface DatePick {
  start: YMD;
  /** Null while waiting for the second tap. Equal to `start` for a single day. */
  end: YMD | null;
}

export function pickDate(current: DatePick | null, day: YMD): DatePick {
  if (!current || current.end) return { start: day, end: null };
  return day < current.start ? { start: day, end: current.start } : { start: current.start, end: day };
}

/** The days a pick covers: one day until a different second day is tapped. */
export function pickedRange(p: DatePick): { from: YMD; to: YMD } {
  return { from: p.start, to: p.end ?? p.start };
}

/** Weeks of a month ("YYYY-MM"), Sunday first; null pads the days before the 1st and after the last. */
export function monthGrid(month: string): (YMD | null)[][] {
  const { y, m } = parts(`${month}-01`);
  const lead = new Date(y, m - 1, 1).getDay();
  const cells: (YMD | null)[] = [...Array<null>(lead).fill(null)];
  for (let d = 1; d <= daysInMonth(y, m); d++) cells.push(fromParts(y, m, d));
  while (cells.length % 7) cells.push(null);
  const weeks: (YMD | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
