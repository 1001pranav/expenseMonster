import type { YMD } from './dates';
import type { Paise } from './money';

/**
 * AMFI's daily NAV file (NAVAll.txt): every mutual fund scheme's latest net asset value, published
 * by the industry body. Semicolon-separated. Category and fund-house lines and blank lines sit
 * between the scheme rows.
 *
 * Columns are found by their header names, never by position. AMFI added Plan and Option columns
 * before the NAV in August 2026, which broke readers that counted columns; the old six-column
 * layout is still read too.
 */

export interface SchemeNav {
  code: string;
  name: string;
  /** ISINs (growth/payout and reinvestment), to match a scheme from a statement. */
  isins: string[];
  /** Paise per unit. The file has 4 decimals; values are rounded to the paisa. */
  nav: Paise;
  date: YMD;
}

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

/** "17-Oct-2026" → "2026-10-17"; null when it isn't a date. */
export function navDate(text: string): YMD | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(text.trim());
  const month = m && MONTHS[m[2].toLowerCase()];
  return m && month ? `${m[3]}-${month}-${m[1].padStart(2, '0')}` : null;
}

/** "106.7901" → 10679 paise; null for "N.A.", blanks and nonsense. */
export function navPaise(text: string): Paise | null {
  const t = text.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const v = Math.round(Number(t) * 100);
  return v > 0 ? v : null;
}

const normal = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Every scheme with a usable NAV. Throws when the file doesn't look like AMFI's at all. */
export function parseNavFile(text: string): SchemeNav[] {
  const lines = text.split(/\r?\n/);
  const headerAt = lines.findIndex((l) => /scheme code/i.test(l) && /net asset value/i.test(l));
  if (headerAt < 0) throw new Error('Not an AMFI NAV file');
  const header = lines[headerAt].split(';').map(normal);
  const col = (test: (h: string) => boolean) => header.findIndex(test);
  const code = col((h) => h === 'scheme code');
  const name = col((h) => h === 'scheme name');
  const nav = col((h) => h === 'net asset value');
  const date = col((h) => h === 'date');
  const isinCols = header.map((h, i) => (h.includes('isin') ? i : -1)).filter((i) => i >= 0);
  if ([code, name, nav, date].some((i) => i < 0)) throw new Error('The AMFI NAV file has changed: a column is missing');

  const out: SchemeNav[] = [];
  for (const line of lines.slice(headerAt + 1)) {
    const f = line.split(';');
    // Category ("Open Ended Schemes(...)") and fund-house lines have no semicolons.
    if (f.length < header.length || !/^\d+$/.test(f[code]?.trim() ?? '')) continue;
    const value = navPaise(f[nav]);
    const day = navDate(f[date]);
    if (value === null || !day) continue;
    out.push({
      code: f[code].trim(),
      name: f[name].trim(),
      isins: isinCols.map((i) => f[i]?.trim() ?? '').filter((s) => /^IN[A-Z0-9]{10}$/.test(s)),
      nav: value,
      date: day,
    });
  }
  return out;
}

/** The scheme a holding's code refers to: an AMFI scheme code or an ISIN. */
export function findScheme(schemes: SchemeNav[], symbol: string | null): SchemeNav | undefined {
  const s = symbol?.trim().toUpperCase();
  if (!s) return undefined;
  return schemes.find((x) => x.code === s || x.isins.includes(s));
}

/** Schemes whose name has every word typed, in any order ("parag flexi direct"). */
export function searchSchemes(schemes: SchemeNav[], query: string, limit = 20): SchemeNav[] {
  const words = normal(query).split(' ').filter((w) => w.length > 1);
  if (!words.length) return [];
  return schemes.filter((x) => words.every((w) => x.name.toLowerCase().includes(w))).slice(0, limit);
}
