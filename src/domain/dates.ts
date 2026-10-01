/**
 * Calendar dates are plain "YYYY-MM-DD" strings in the user's local time zone.
 * They sort lexically, survive JSON/SQLite round trips and avoid UTC-shift bugs
 * that plague due-date maths when using Date objects.
 */
export type YMD = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function fromParts(y: number, m: number, d: number): YMD {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parts(date: YMD): { y: number; m: number; d: number } {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

export function toYMD(date: Date): YMD {
  return fromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Local date of an ISO timestamp. */
export function isoToYMD(iso: string): YMD {
  return toYMD(new Date(iso));
}

export function toDate(date: YMD, hour = 12): Date {
  const { y, m, d } = parts(date);
  return new Date(y, m - 1, d, hour, 0, 0, 0);
}

export const todayYMD = (now: Date = new Date()): YMD => toYMD(now);

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** Day 31 in a 30-day month becomes 30; Feb clamps to 28/29. */
export function clampedDate(y: number, m: number, day: number): YMD {
  return fromParts(y, m, Math.min(Math.max(day, 1), daysInMonth(y, m)));
}

export function addDays(date: YMD, n: number): YMD {
  const dt = toDate(date);
  dt.setDate(dt.getDate() + n);
  return toYMD(dt);
}

/**
 * Add months keeping the anchor day where possible: Jan 31 + 1 month = Feb 28,
 * and with anchorDay 31, Feb 28 + 1 month = Mar 31 (not Mar 28).
 */
export function addMonths(date: YMD, n: number, anchorDay?: number): YMD {
  const { y, m, d } = parts(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return clampedDate(ny, nm, anchorDay ?? d);
}

export function diffDays(a: YMD, b: YMD): number {
  const ms = toDate(a).getTime() - toDate(b).getTime();
  return Math.round(ms / 86_400_000);
}

export const monthKey = (date: YMD): string => date.slice(0, 7);

export function monthStart(date: YMD): YMD {
  const { y, m } = parts(date);
  return fromParts(y, m, 1);
}

export function monthEnd(date: YMD): YMD {
  const { y, m } = parts(date);
  return fromParts(y, m, daysInMonth(y, m));
}

export function maxYMD(a: YMD, b: YMD): YMD {
  return a > b ? a : b;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthIndex(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase());
}

export function formatDay(date: YMD, opts: { year?: boolean } = {}): string {
  const { y, m, d } = parts(date);
  return `${d} ${MONTH_LABELS[m - 1]}${opts.year ? ` ${y}` : ''}`;
}

export function formatMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_LABELS[m - 1]} ${y}`;
}

export const shortMonth = (key: string): string => MONTH_LABELS[Number(key.split('-')[1]) - 1];

/** "Today", "Yesterday", "Tomorrow", "in 5 days", "3 days ago". */
export function relativeDay(date: YMD, today: YMD): string {
  const n = diffDays(date, today);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n <= 30) return `in ${n} days`;
  if (n < -1 && n >= -30) return `${-n} days ago`;
  return formatDay(date, { year: parts(date).y !== parts(today).y });
}

function expandYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/**
 * Parse the date formats found in Indian bank SMS and payment-app screenshots:
 * 12-09-2026, 12/09/26, 12-Sep-26, 12 Sep 2026, Sep 12, 2026, 2026-09-12, 15-Oct (no year).
 * A date without a year is resolved to the occurrence nearest `ref`.
 */
export function parseLooseDate(text: string, ref: YMD): YMD | null {
  const t = text.trim();
  let m: RegExpMatchArray | null;

  if ((m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/))) {
    return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  if ((m = t.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/))) {
    return valid(expandYear(Number(m[3])), Number(m[2]), Number(m[1]));
  }
  if ((m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]*([A-Za-z]{3,9})[,\s-]*(\d{2,4})?\b/))) {
    const mi = monthIndex(m[2]);
    if (mi >= 0) return withOptionalYear(Number(m[1]), mi + 1, m[3], ref);
  }
  if ((m = t.match(/\b([A-Za-z]{3,9})[\s-]*(\d{1,2})(?:st|nd|rd|th)?,?[\s-]*(\d{4})?\b/))) {
    const mi = monthIndex(m[1]);
    if (mi >= 0) return withOptionalYear(Number(m[2]), mi + 1, m[3], ref);
  }
  return null;
}

function valid(y: number, m: number, d: number): YMD | null {
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return fromParts(y, m, d);
}

function withOptionalYear(d: number, m: number, year: string | undefined, ref: YMD): YMD | null {
  if (year) return valid(expandYear(Number(year)), m, d);
  const { y } = parts(ref);
  const candidates = [y - 1, y, y + 1]
    .map((yy) => valid(yy, m, d))
    .filter((v): v is YMD => v !== null);
  if (!candidates.length) return null;
  return candidates.reduce((best, c) =>
    Math.abs(diffDays(c, ref)) < Math.abs(diffDays(best, ref)) ? c : best,
  );
}

/** Parse "10:32 pm" / "22:05" into minutes since midnight. */
export function parseTime(text: string): number | null {
  const iso = text.match(/\d{4}-\d{2}-\d{2}[:T ](\d{2}):(\d{2})/);
  if (iso) return Number(iso[1]) * 60 + Number(iso[2]);
  const m = text.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3]?.toLowerCase().replace(/\./g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Combine a local date and optional minutes-of-day into an ISO timestamp. */
export function toISO(date: YMD, minutes: number | null = null): string {
  const dt = toDate(date, 0);
  dt.setMinutes(minutes ?? 12 * 60);
  return dt.toISOString();
}
