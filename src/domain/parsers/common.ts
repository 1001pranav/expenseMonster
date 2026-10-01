import { parseLooseDate, parseTime, type YMD } from '../dates';
import type { Paise } from '../money';

export type Direction = 'debit' | 'credit';

export interface ParsedTxn {
  kind: 'transaction';
  direction: Direction;
  amount: Paise;
  date: YMD | null;
  /** Minutes since midnight. */
  time: number | null;
  payee: string | null;
  vpa: string | null;
  ref: string | null;
  accountLast4: string | null;
  cardLast4: string | null;
  /** Charged to a credit card (not a debit card). */
  isCreditCard: boolean;
  isRefund: boolean;
  balance: Paise | null;
  bank: string | null;
  app: string | null;
  confidence: number;
}

export interface ParsedBill {
  kind: 'bill';
  amount: Paise;
  dueDate: YMD | null;
  billDate: YMD | null;
  provider: string | null;
  consumerNo: string | null;
  usage: number | null;
  usageUnit: string | null;
  confidence: number;
}

export interface ParsedCardStatement {
  kind: 'card_statement';
  cardLast4: string | null;
  bank: string | null;
  total: Paise;
  minDue: Paise | null;
  dueDate: YMD | null;
  confidence: number;
}

export type Parsed = ParsedTxn | ParsedBill | ParsedCardStatement;

const AMOUNT = String.raw`(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)`;
export const AMOUNT_RE = new RegExp(AMOUNT, 'gi');

const toPaiseStr = (s: string): Paise | null => {
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

export interface FoundAmount {
  amount: Paise;
  index: number;
}

/** All currency amounts that are not balances / limits. */
export function findAmounts(text: string): FoundAmount[] {
  const out: FoundAmount[] = [];
  for (const m of text.matchAll(new RegExp(AMOUNT, 'gi'))) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 22), m.index).toLowerCase();
    if (/(bal|balance|avl|available|limit|lmt)[^a-z]*[a-z.: ]{0,6}$/.test(before)) continue;
    const amount = toPaiseStr(m[1]);
    if (amount) out.push({ amount, index: m.index ?? 0 });
  }
  // SBI style: "debited by 250.0", "credited by Rs500"
  for (const m of text.matchAll(/(?:debited|credited)\s+(?:by|for|with)\s+([\d,]+(?:\.\d{1,2})?)/gi)) {
    const amount = toPaiseStr(m[1]);
    if (amount) out.push({ amount, index: m.index ?? 0 });
  }
  return out.sort((a, b) => a.index - b.index);
}

export function findBalance(text: string): Paise | null {
  const m = text.match(/(?:avl\.?\s*bal(?:ance)?|available\s+bal(?:ance)?|\bbal(?:ance)?)\b[\s.:-]*(?:is\s*)?(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  return m ? toPaiseStr(m[1]) : null;
}

export function findLast4(text: string, label: RegExp): string | null {
  const m = text.match(new RegExp(label.source + String.raw`[^\dxX*]{0,20}(?:no\.?\s*)?[xX*.]*\s?(\d{3,6})\b`, 'i'));
  return m ? m[1].slice(-4) : null;
}

export function findVpa(text: string): string | null {
  const m = text.match(/\b([a-z0-9][a-z0-9.\-_]{1,63}@[a-z][a-z0-9]{1,30})\b/i);
  if (!m) return null;
  // Exclude e-mail addresses (have a dot-domain after @).
  const after = text.slice((m.index ?? 0) + m[0].length);
  if (/^\.[a-z]{2,}/i.test(after)) return null;
  return m[1].toLowerCase();
}

export function findRef(text: string): string | null {
  const patterns = [
    /(?:upi\s*(?:ref(?:erence)?|txn|transaction)?\s*(?:no|id|number)?|ref(?:erence)?\s*(?:no|number|id)?|refno|utr(?:\s*no)?|rrn)[\s.:#-]*([0-9]{9,16})/i,
    /UPI\/(?:P2[AM]|CR|DR)\/(\d{9,16})/i,
    /\b(\d{12})\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

/** Prefer the date written after " on ", then anywhere in the text (with amounts removed). */
export function findDate(text: string, ref: YMD): YMD | null {
  const noAmounts = text.replace(new RegExp(AMOUNT, 'gi'), ' ');
  for (const m of noAmounts.matchAll(/\b(?:on|dt|date|dated)\b[:\s]*(?:date\s*)?/gi)) {
    const d = parseLooseDate(noAmounts.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 24), ref);
    if (d) return d;
  }
  return parseLooseDate(noAmounts, ref);
}

export const findTime = (text: string) => parseTime(text);

const BANKS: [RegExp, string][] = [
  [/hdfc/i, 'HDFC Bank'],
  [/\bsbi\b|state bank/i, 'SBI'],
  [/icici/i, 'ICICI Bank'],
  [/axis/i, 'Axis Bank'],
  [/kotak/i, 'Kotak'],
  [/\bpnb\b|punjab national/i, 'PNB'],
  [/bank of baroda|\bbob\b/i, 'Bank of Baroda'],
  [/canara/i, 'Canara Bank'],
  [/union bank/i, 'Union Bank'],
  [/idfc/i, 'IDFC First'],
  [/indusind/i, 'IndusInd'],
  [/yes bank/i, 'Yes Bank'],
  [/\bau\b.*bank|au small/i, 'AU Bank'],
  [/federal/i, 'Federal Bank'],
  [/\bamex\b|american express/i, 'Amex'],
  [/onecard/i, 'OneCard'],
];

export function findBank(text: string): string | null {
  for (const [re, name] of BANKS) if (re.test(text)) return name;
  return null;
}

export function cleanName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw
    .replace(/\s+/g, ' ')
    .replace(/^(?:to|at|from|by|vpa|mr\.?|ms\.?|mrs\.?)\s+/i, '')
    .replace(/[.;,:]+$/, '')
    .trim();
  if (!s || s.length < 2 || /^\d+$/.test(s)) return null;
  return s.length > 40 ? s.slice(0, 40).trim() : s;
}

export function titleCase(s: string | null): string | null {
  if (!s) return s;
  if (s.includes('@')) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}
