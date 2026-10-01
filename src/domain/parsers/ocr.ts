import type { YMD } from '../dates';
import { parseAmount } from '../money';
import {
  cleanName,
  findAmounts,
  findBank,
  findDate,
  findLast4,
  findRef,
  findTime,
  findVpa,
  titleCase,
  type ParsedBill,
  type ParsedTxn,
} from './common';

export type PaymentApp = 'Google Pay' | 'PhonePe' | 'Paytm' | 'BHIM' | 'Amazon Pay' | 'CRED' | 'Bank app';

const APPS: [RegExp, PaymentApp][] = [
  [/google\s*pay|\bg\s?pay\b|powered by upi.*google/i, 'Google Pay'],
  [/phonepe|phone\s?pe/i, 'PhonePe'],
  [/paytm/i, 'Paytm'],
  [/\bbhim\b/i, 'BHIM'],
  [/amazon\s*pay/i, 'Amazon Pay'],
  [/\bcred\b/i, 'CRED'],
];

export function detectApp(text: string): PaymentApp | null {
  for (const [re, app] of APPS) if (re.test(text)) return app;
  return /\b(?:upi|imps|neft)\b/i.test(text) ? 'Bank app' : null;
}

export type OcrStatus = 'success' | 'failed' | 'pending' | 'unknown';

export function detectStatus(text: string): OcrStatus {
  if (/\b(failed|declined|unsuccessful|cancelled|canceled|reversed)\b/i.test(text)) return 'failed';
  if (/\b(pending|processing|in progress|awaiting)\b/i.test(text)) return 'pending';
  if (/\b(successful(?:ly)?|success|completed|paid|sent|received|done)\b/i.test(text)) return 'success';
  return 'unknown';
}

/**
 * Amounts in payment screenshots are usually a big standalone line ("₹1,250" or "1,250").
 * ML Kit sometimes drops the ₹ glyph, so a bare number line near the top also counts.
 */
function findHeroAmount(lines: string[]): { amount: number; exact: boolean } | null {
  for (const line of lines.slice(0, 14)) {
    const l = line.trim();
    if (/^(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d{1,2})?$/i.test(l)) {
      const a = parseAmount(l);
      if (a) return { amount: a, exact: true };
    }
  }
  for (const line of lines.slice(0, 10)) {
    const l = line.trim();
    if (/^(?:19|20)\d{2}$/.test(l)) continue; // a year, not an amount
    if (/^(?:\d{1,3}(?:,\d{2})*,\d{3}|\d{1,6})(?:\.\d{1,2})?$/.test(l)) {
      const a = parseAmount(l);
      if (a) return { amount: a, exact: false };
    }
  }
  return null;
}

/** Value written on the same line after a label, or on the next line. */
function labelled(lines: string[], label: RegExp): string | null {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    const rest = lines[i].slice((m.index ?? 0) + m[0].length).replace(/^[\s:#.-]+/, '').trim();
    if (rest) return rest;
    if (lines[i + 1]) return lines[i + 1].trim();
  }
  return null;
}

function findPayee(lines: string[]): string | null {
  const v =
    labelled(lines, /^(?:paid\s+(?:successfully\s+)?to|sent\s+to|payment\s+to|to)\b:?/i) ??
    labelled(lines, /^banking name\b:?/i) ??
    labelled(lines, /\bpaid to\b:?/i);
  return cleanName(v?.replace(/\b[a-z0-9.\-_]+@[a-z]+\b/i, ''));
}

function findPayer(lines: string[]): string | null {
  return cleanName(labelled(lines, /^(?:received\s+from|from)\b:?/i)?.replace(/\b[a-z0-9.\-_]+@[a-z]+\b/i, ''));
}

/** Parse the OCR text of a UPI / bank payment screenshot. */
export function parsePaymentScreenshot(text: string, today: YMD): (ParsedTxn & { status: OcrStatus }) | null {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const flat = lines.join(' ');
  const status = detectStatus(flat);
  const app = detectApp(flat);

  const hero = findHeroAmount(lines);
  const inline = findAmounts(flat)[0];
  const amount = hero?.amount ?? inline?.amount ?? null;
  if (!amount) return null;

  const isCredit = /\breceived\s+from\b|\bcredited\b|\bmoney received\b/i.test(flat) && !/\bpaid to\b/i.test(flat);
  const refText =
    labelled(lines, /upi\s*(?:transaction|txn|ref(?:erence)?)\s*(?:id|no\.?|number)?/i) ??
    labelled(lines, /\b(?:utr|rrn)\b(?:\s*no\.?)?/i) ??
    labelled(lines, /transaction\s*id/i);
  const ref = refText?.match(/[A-Z0-9]{9,30}/i)?.[0] ?? findRef(flat);
  const vpa = findVpa(flat);
  const date = findDate(flat, today);
  const payee = titleCase(isCredit ? findPayer(lines) : findPayee(lines)) ?? vpa;
  const isCreditCard = /credit\s*card/i.test(flat);
  const last4 = findLast4(flat, /(?:a\/?c|account|bank|card|from)/);

  let confidence = hero?.exact ? 0.55 : 0.35;
  if (status === 'success') confidence += 0.1;
  if (date) confidence += 0.1;
  if (ref) confidence += 0.1;
  if (payee) confidence += 0.1;
  if (app) confidence += 0.05;

  return {
    kind: 'transaction',
    status,
    direction: isCredit ? 'credit' : 'debit',
    amount,
    date: date ?? today,
    time: findTime(flat),
    payee,
    vpa,
    ref,
    accountLast4: isCreditCard ? null : last4,
    cardLast4: isCreditCard ? last4 : null,
    isCreditCard,
    isRefund: /refund/i.test(flat),
    balance: null,
    bank: findBank(flat),
    app,
    confidence: Math.min(confidence, 0.95),
  };
}

/** Parse a photographed / PDF utility bill: amount payable, due date, units, consumer number. */
export function parseBillDocument(text: string, today: YMD): ParsedBill | null {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const flat = lines.join(' ');
  const amountText =
    labelled(lines, /(?:net\s+)?(?:amount\s+payable|total\s+amount\s+due|amount\s+due|bill\s+amount|net\s+amount|total\s+payable|pay\s+by\s+due\s+date)/i) ?? null;
  const amount = parseAmount(amountText?.match(/(?:₹|rs\.?|inr)?\s*[\d,]+(?:\.\d{1,2})?/i)?.[0]) ?? findAmounts(flat)[0]?.amount ?? null;
  if (!amount) return null;
  const dueText = labelled(lines, /(?:due\s+date|pay\s+by|last\s+date)/i);
  const billDateText = labelled(lines, /(?:bill\s+date|date\s+of\s+bill|invoice\s+date|bill\s+issue\s+date)/i);
  const consumer = labelled(lines, /(?:consumer|account|ca|customer|service|connection|k)\s*(?:no\.?|number|id)/i)?.match(/[A-Z0-9-]{5,20}/i)?.[0] ?? null;
  const usage =
    flat.match(/(?:units?\s+consumed|consumption|units?\s+billed|total\s+units?)[^\d]{0,15}([\d.]+)/i) ?? flat.match(/([\d.]+)\s*(kwh|kl|scm)\b/i);
  const unit = flat.match(/\b(kwh|kl|scm)\b/i)?.[1] ?? (usage ? 'kWh' : null);
  const providerLine = lines.slice(0, 4).find((l) => /[a-z]{3,}/i.test(l) && !/bill|invoice|receipt|tax/i.test(l));
  const dueDate = dueText ? findDate(dueText, today) : null;
  return {
    kind: 'bill',
    amount,
    dueDate,
    billDate: billDateText ? findDate(billDateText, today) : null,
    provider: cleanName(providerLine),
    consumerNo: consumer && /\d/.test(consumer) ? consumer : null,
    usage: usage ? Number(usage[1]) : null,
    usageUnit: unit ? (unit.toLowerCase() === 'kwh' ? 'kWh' : unit.toUpperCase()) : null,
    confidence: 0.4 + (amountText ? 0.2 : 0) + (dueDate ? 0.2 : 0) + (consumer ? 0.1 : 0),
  };
}

/** Is this screenshot a bill rather than a payment receipt? */
export function looksLikeBill(text: string): boolean {
  return /(amount\s+payable|due\s+date|units?\s+consumed|bill\s+(?:no|date|period)|consumer\s+no)/i.test(text) &&
    !/(paid\s+to|payment\s+successful|upi\s+transaction\s+id)/i.test(text);
}
