import type { YMD } from './dates';
import type { Paise } from './money';

/**
 * Reading a consolidated account statement (CAS) from CDSL or NSDL: every share and mutual fund a
 * person holds, with quantity, price and value as on the statement date. The PDF's words and their
 * positions come from the phone (modules/cas-pdf); this file rebuilds the table rows and reads them.
 *
 * The layouts vary (CDSL and NSDL, summary and detailed tables, pledged balances, long fund names
 * that wrap, a Hindi overlay on some CDSL pages), and change over time. So a row is only accepted
 * when it checks itself: among its numbers there must be a quantity, a price and a value with
 * quantity × price = value (within 0.5%, as printed values are rounded). A row that doesn't add
 * up is counted as unreadable, never guessed. Learned from the open-source casparser (MIT).
 */

/** A word of the PDF: page (1-based), x, y (points from the top-left), width, font size, text. */
export type Word = [page: number, x: number, y: number, width: number, size: number, text: string];

export interface CasRow {
  isin: string;
  name: string;
  /** Shares (ISIN INE…/IN9…) or a fund (INF…: mutual funds and ETFs). */
  kind: 'equity' | 'fund';
  /** Thousandths of a share or unit. */
  quantity: number;
  /** Paise per share or unit (NAVs are rounded to the paisa). */
  price: Paise;
  value: Paise;
  /** Total cost, when the statement prints it (fund tables do). */
  invested: Paise | null;
  folio: string | null;
}

export interface CasStatement {
  depository: 'CDSL' | 'NSDL' | null;
  /** Holdings date ("as on"), or the end of the statement period. */
  asOf: YMD | null;
  rows: CasRow[];
  /** Rows with an ISIN whose numbers didn't add up: not imported. */
  unreadable: number;
}

const ISIN = /^IN[EF9][0-9A-Z]{8}\d$/;
// CDSL sometimes drops the leading zero (".196").
const NUMBER = /^-?(?:\d[\d,]*(?:\.\d+)?|\.\d+)$/;

export interface Line {
  page: number;
  y: number;
  /** Words merged into cells: a gap wider than about one character starts a new cell. */
  cells: { x: number; text: string }[];
}

/** Words on (nearly) the same baseline form a line; close words form a cell. */
export function toLines(words: Word[]): Line[] {
  const sorted = [...words].sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
  const lines: { page: number; y: number; words: Word[] }[] = [];
  for (const w of sorted) {
    const last = lines[lines.length - 1];
    if (last && last.page === w[0] && Math.abs(last.y - w[2]) <= 1.5) last.words.push(w);
    else lines.push({ page: w[0], y: w[2], words: [w] });
  }
  return lines.map((l) => {
    const ws = l.words.sort((a, b) => a[1] - b[1]);
    const cells: Line['cells'] = [];
    let end = -Infinity;
    for (const w of ws) {
      const gap = w[1] - end;
      const prev = cells[cells.length - 1];
      if (prev && gap < w[4] * 0.8) prev.text += ` ${w[5]}`;
      else cells.push({ x: w[1], text: w[5] });
      end = w[1] + w[3];
    }
    return { page: l.page, y: l.y, cells };
  });
}

const num = (t: string) => Number(t.replace(/,/g, ''));
const closes = (q: number, p: number, v: number) => q > 0 && p > 0 && v > 0 && Math.abs(q * p - v) <= Math.max(0.01, v * 0.005);

/**
 * The quantity, price and value among a row's numbers. Tried in the order the tables print them:
 * shares end with price and value (the quantity first, or among balances); fund rows start with
 * units and NAV, the value following (after the cost, when printed).
 */
export function closingTriple(n: number[]): { q: number; p: number; v: number; invested: number | null } | null {
  const m = n.length;
  if (m < 3) return null;
  for (let i = 0; i <= m - 3; i++) if (closes(n[i], n[m - 2], n[m - 1])) return { q: n[i], p: n[m - 2], v: n[m - 1], invested: null };
  for (let k = 2; k < m; k++) if (closes(n[0], n[1], n[k])) return { q: n[0], p: n[1], v: n[k], invested: k === 3 ? n[2] : null };
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) for (let k = j + 1; k < m; k++) if (closes(n[i], n[j], n[k])) return { q: n[i], p: n[j], v: n[k], invested: null };
  return null;
}

const FOLIO = /^\d+\/\d+$/;
const NOT_NAME = /^(?:--?|@|ARN-?\d+|DIRECT|\d+\/\d+)$/i;

/** Read the holdings rows of a statement. */
export function parseCas(words: Word[]): CasStatement {
  const lines = toLines(words);
  const rows: CasRow[] = [];
  let unreadable = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const isinAt = line.cells.findIndex((c) => ISIN.test(c.text.split(' ')[0]));
    if (isinAt < 0) continue;
    const isin = line.cells[isinAt].text.split(' ')[0];
    // A wrapped row continues on the next line(s) just below: take their numbers too when needed.
    const cells = [...line.cells];
    const wrapped: Line['cells'] = [];
    for (let next = li + 1; cells.filter((c) => NUMBER.test(c.text)).length < 3 && next < lines.length; next++) {
      const l = lines[next];
      if (l.page !== line.page || l.y - line.y > 9 || l.cells.some((c) => ISIN.test(c.text.split(' ')[0]))) break;
      cells.push(...l.cells);
      wrapped.push(...l.cells);
    }
    const numbers = cells.filter((c, i) => i !== isinAt && NUMBER.test(c.text)).map((c) => num(c.text));
    const t = closingTriple(numbers);
    if (!t) {
      unreadable++;
      continue;
    }
    const restOfIsinCell = line.cells[isinAt].text.split(' ').slice(1);
    const words = (list: Line['cells']) => list.filter((c) => !ISIN.test(c.text.split(' ')[0]) && !NUMBER.test(c.text) && !NOT_NAME.test(c.text)).map((c) => c.text);
    const name = [...restOfIsinCell, ...words(line.cells), ...words(wrapped)].join(' ').replace(/\s+/g, ' ').trim();
    rows.push({
      isin,
      name,
      kind: isin.startsWith('INF') ? 'fund' : 'equity',
      quantity: Math.round(t.q * 1000),
      price: Math.round(t.p * 100),
      value: Math.round(t.v * 100),
      invested: t.invested === null ? null : Math.round(t.invested * 100),
      folio: line.cells.find((c) => FOLIO.test(c.text))?.text ?? null,
    });
  }
  // NSDL prints a holding in its summary and again in the detailed table: the same numbers twice.
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const k = `${r.isin}|${r.quantity}|${r.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const text = lines.map((l) => l.cells.map((c) => c.text).join(' ')).join('\n');
  return { depository: depositoryOf(text), asOf: statementDate(text), rows: unique, unreadable };
}

function depositoryOf(text: string): CasStatement['depository'] {
  const cdsl = /\bCDSL\b|Central Depository Services/i.test(text);
  const nsdl = /\bNSDL\b|National Securities Depository/i.test(text);
  // Both are named in either statement (accounts at the other depository are listed too): the issuer is in the title.
  if (/Central Depository Services[\s\S]{0,200}Consolidated Account Statement|CDSL\s+CAS/i.test(text)) return 'CDSL';
  if (/National Securities Depository[\s\S]{0,200}Consolidated Account Statement|NSDL\s+CAS/i.test(text)) return 'NSDL';
  return cdsl && !nsdl ? 'CDSL' : nsdl && !cdsl ? 'NSDL' : null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** "31-10-2026", "31/10/2026", "31-Oct-2026" → "2026-10-31". */
export function casDate(t: string): YMD | null {
  const m = /^(\d{1,2})[-/ ]([A-Za-z]{3}|\d{1,2})[-/ ](\d{4})$/.exec(t.trim());
  if (!m) return null;
  const month = /^\d+$/.test(m[2]) ? Number(m[2]) : MONTHS[m[2].toLowerCase()];
  const day = Number(m[1]);
  if (!month || month > 12 || day < 1 || day > 31) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const DATE = String.raw`(\d{1,2}[-/ ](?:[A-Za-z]{3}|\d{1,2})[-/ ]\d{4})`;

/** The latest "as on" date (the holdings date), else the end of the statement period. */
export function statementDate(text: string): YMD | null {
  const asOn = [...text.matchAll(new RegExp(String.raw`as\s+on\s*:?\s*` + DATE, 'gi'))].map((m) => casDate(m[1])).filter((d): d is YMD => Boolean(d));
  if (asOn.length) return asOn.sort().at(-1)!;
  const period = new RegExp(String.raw`period\s+from\s+` + DATE + String.raw`\s+to\s+` + DATE, 'i').exec(text);
  return period ? casDate(period[2]) : null;
}

// ── an anonymised copy, to improve the reader without anyone's statement ──────

const KEEP = new Set(
  'isin security securities name current bal balance frozen pledge pledged setup free lent locked safekeep earmarked market price value holding holdings statement as on mutual fund funds units unit held nav folio scheme invested cost total sub grand equity shares account accounts demat cdsl nsdl from to period for the of in rs dp id client bo type details isins page debt hybrid direct regular plan growth idcw option summary consolidated portfolio date transaction transactions opening closing credit debit face pan'.split(
    ' ',
  ),
);

/**
 * The statement's layout without the person: ISINs, column headings, dates and amounts stay;
 * every other word becomes x's of the same length; PAN, account and folio numbers, phone numbers
 * and e-mails are masked. What remains shows the table structure and the arithmetic the reader
 * works with. Amounts are kept, so the copy shows the size of the portfolio: the person decides
 * whether to share it.
 */
export function anonymise(words: Word[]): Word[] {
  return words.map(([page, x, y, w, size, text]) => [page, x, y, w, size, anonymiseText(text)]);
}

export function anonymiseText(text: string): string {
  return text
    .split(' ')
    .map((t) => {
      const bare = t.replace(/[(),:;.]+$/g, '').replace(/^[(]+/, '');
      if (ISIN.test(bare) || casDate(bare) || KEEP.has(bare.toLowerCase())) return t;
      if (/^[A-Z]{5}\d{4}[A-Z]$/i.test(bare) || /@/.test(bare)) return t.replace(/[A-Za-z0-9]/g, '*');
      // Account, folio, phone and pin numbers: long plain digit runs. Amounts carry commas or decimals.
      if (/^\d{6,}$/.test(bare) || /^\d+\/\d+$/.test(bare) || /^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9]{6,}$/.test(bare)) return t.replace(/[A-Za-z0-9]/g, '#');
      if (NUMBER.test(bare)) return t;
      return t.replace(/[A-Za-z]/g, 'x');
    })
    .join(' ');
}
