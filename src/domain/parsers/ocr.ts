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
  titleCase,
  type ParsedBill,
  type ParsedTxn,
} from './common';

export type PaymentApp = 'Google Pay' | 'PhonePe' | 'Paytm' | 'BHIM' | 'Amazon Pay' | 'CRED' | 'Bank app';

const VPA_RE = /\b[a-z0-9][a-z0-9.\-_]{1,63}@[a-z][a-z0-9]{1,30}\b/gi;

const APPS: [RegExp, PaymentApp][] = [
  [/google\s*pay|\bg\s?pay\b|google\s+transaction\s+id|powered by upi.*google/i, 'Google Pay'],
  // PhonePe transaction IDs are "T" + ~21 digits.
  [/phonepe|phone\s?pe|\bT\d{18,24}\b/i, 'PhonePe'],
  [/paytm/i, 'Paytm'],
  [/\bbhim\b/i, 'BHIM'],
  [/amazon\s*pay/i, 'Amazon Pay'],
  [/\bcred\b/i, 'CRED'],
];

export function detectApp(text: string): PaymentApp | null {
  // The payee's VPA names *their* app (…@paytm, …@ybl), not the one this screenshot came from.
  const own = text.replace(VPA_RE, ' ');
  for (const [re, app] of APPS) if (re.test(own)) return app;
  return /\b(?:upi|imps|neft)\b/i.test(own) ? 'Bank app' : null;
}

export type OcrStatus = 'success' | 'failed' | 'pending' | 'unknown';

export function detectStatus(text: string): OcrStatus {
  if (/\b(failed|declined|unsuccessful|cancelled|canceled|reversed)\b/i.test(text)) return 'failed';
  if (/\b(pending|processing|in progress|awaiting)\b/i.test(text)) return 'pending';
  if (/\b(successful(?:ly)?|success|completed|paid|sent|received|done)\b/i.test(text)) return 'success';
  return 'unknown';
}

/** ML Kit's Latin model often reads the ₹ glyph as one of these. */
const MONEY_LINE = /^(?:₹|rs\.?|inr|[%zZ?<])\s*((?:\d{1,3}(?:,\d{2})*,\d{3}|\d{1,7})(?:\.\d{1,2})?)(?:\s*\/-)?$/i;
const BARE_AMOUNT = /^(?:\d{1,3}(?:,\d{2})*,\d{3}|\d{1,7})(?:\.\d{1,2})?$/;
/** A line that belongs to the payment itself (status-bar noise like "10:42", "85", "4G" comes before it). */
const PAYMENT_WORDS = /\b(?:to|from|paid|received|sent|success(?:ful)?|completed|transaction|payment|credited|debited|pending|failed)\b/i;

function amountLine(line: string): { amount: number; exact: boolean } | null {
  const l = line.trim();
  const m = l.match(MONEY_LINE);
  if (m) {
    const a = parseAmount(m[1]);
    return a ? { amount: a, exact: true } : null;
  }
  if (BARE_AMOUNT.test(l) && !/^(?:19|20)\d{2}$/.test(l)) {
    const a = parseAmount(l);
    return a ? { amount: a, exact: false } : null;
  }
  return null;
}

/**
 * The amount is the biggest text on GPay, PhonePe and BHIM, so the OCR's largest lines are tried first.
 * Then any "₹1,250" line, then a bare number (₹ dropped by OCR) below the first payment-related line.
 */
function findHeroAmount(lines: string[], prominent: string[]): { amount: number; exact: boolean } | null {
  const big = prominent.map(amountLine).filter((a) => a !== null);
  const bigExact = big.find((a) => a.exact);
  if (bigExact) return bigExact;
  for (const line of lines) {
    const a = amountLine(line);
    if (a?.exact) return a;
  }
  // A bare number in the largest type is the amount with the ₹ lost.
  if (big[0]) return { amount: big[0].amount, exact: true };
  const start = lines.findIndex((l) => PAYMENT_WORDS.test(l));
  if (start < 0) return null;
  for (const line of lines.slice(start, start + 12)) {
    const a = amountLine(line);
    if (a) return a;
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

// "Paid to" / "To" (GPay) / "Sent to" … and "Received from" / "From" (GPay, BHIM) …
const PAID_HEAD = /^(?:paid\s+(?:successfully\s+)?to|sent\s+(?:successfully\s+)?to|payment\s+(?:sent\s+)?to|transferred\s+to|you\s+paid)\b:?/i;
const RECEIVED_HEAD = /^(?:received\s+(?:successfully\s+)?from|money\s+received(?:\s+from)?|payment\s+received(?:\s+from)?|you\s+received|sent\s+by|paid\s+by)\b:?/i;
const PAYEE_LABELS = [PAID_HEAD, /^to\b:?/i, /^banking\s+name\b:?/i, /\bpaid\s+to\b:?/i];
const PAYER_LABELS = [RECEIVED_HEAD, /^from\b:?/i, /\breceived\s+from\b:?/i];
/** The user's own side of the payment: their account on a debit, the receiving account on a credit. */
const SELF_ON_DEBIT = /^(?:from\b|debited\s+from)/i;
const SELF_ON_CREDIT = /^(?:to\b|credited\s+to)/i;

/** Credit when the screen leads with "Received from" / "From …"; debit when it leads with "Paid to" / "To …". */
function detectCredit(lines: string[], flat: string): boolean {
  for (const l of lines) {
    if (PAID_HEAD.test(l)) return false;
    if (RECEIVED_HEAD.test(l)) return true;
  }
  const debitHint = /\b(?:debited\s+from|paid\s+successfully)\b/i.test(flat);
  const creditHint = /\b(?:credited\s+to|received\s+successfully|credited)\b/i.test(flat);
  if (debitHint !== creditHint) return creditHint;
  for (const l of lines) {
    if (/^to\b/i.test(l)) return false;
    if (/^from\b/i.test(l)) return true;
  }
  return false;
}

const PHONE_RE = /(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/;
const NOT_A_NAME =
  /^(?:completed|successful(?:ly)?|success|pending|failed|transaction|transfer\s+details|payment|upi|details|view|share|split|done|paid|received|debited|credited|banking\s+name|upi\s+id|google\s+pay|phonepe|bhim)\b/i;

/** A person / merchant name from an OCR line, without VPAs, amounts, masked accounts or "(HDFC Bank)". */
function asName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw
    .replace(VPA_RE, ' ')
    .replace(/(?:google\s*pay|phonepe|bhim)\s*[•·.-]?/gi, ' ')
    .replace(/^(?:banking\s+name|upi\s+id|name)\s*[:\-]?/i, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d{1,2})?/gi, ' ')
    .replace(/\b[xX*•]{2,}\s?\d{2,6}\b/g, ' ')
    .replace(PHONE_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[a-z]{2,}/i.test(s) || NOT_A_NAME.test(s) || (s.match(/\d/g)?.length ?? 0) > 3) return null;
  return cleanName(s);
}

/** First name written after (or below) one of the labels, tried in priority order. */
function findParty(lines: string[], labels: RegExp[]): string | null {
  for (const label of labels) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(label);
      if (!m) continue;
      const rest = lines[i].slice((m.index ?? 0) + m[0].length);
      const name = asName(rest) ?? (rest.trim() ? null : lines.slice(i + 1, i + 4).map(asName).find(Boolean));
      if (name) return name;
    }
  }
  return null;
}

/** The other party's VPA (or phone number): the one written near their label, never the user's own. */
function findPartyHandle(lines: string[], labels: RegExp[], self: RegExp, re: RegExp): string | null {
  const isParty = (l: string) => labels.some((lb) => lb.test(l));
  const near = new Set<number>();
  const own = new Set<number>();
  // Each label owns the next few lines, up to the next label.
  lines.forEach((l, i) => {
    const into = isParty(l) ? near : self.test(l) ? own : null;
    if (!into) return;
    for (let j = i; j < Math.min(lines.length, i + 4) && (j === i || !(isParty(lines[j]) || self.test(lines[j]))); j++) into.add(j);
  });
  const hits = lines.map((l, i) => ({ i, m: l.match(re)?.[0] })).filter((h) => h.m && !own.has(h.i));
  return (hits.find((h) => near.has(h.i)) ?? hits[0])?.m ?? null;
}

/** Prefer the line holding a year or a clock time, so stray words ("85 Paid") can't be read as a date. */
function findScreenDate(lines: string[], today: YMD): { date: YMD; line: string } | null {
  const ranked = [...lines.filter((l) => /\b20\d{2}\b|\d{1,2}:\d{2}/.test(l)), ...lines];
  for (const line of ranked) {
    if (amountLine(line)) continue;
    const date = findDate(line, today);
    if (date) return { date, line };
  }
  return null;
}

/** The status-bar clock ("10:42") is the first time on every screenshot, so only trust a time next to the date or with am/pm. */
function findScreenTime(lines: string[], dateLine: string | null): number | null {
  const onDateLine = dateLine ? findTime(dateLine) : null;
  if (onDateLine !== null) return onDateLine;
  const withMeridiem = lines.find((l) => /\d{1,2}:\d{2}(?::\d{2})?\s*[ap]\.?m\b/i.test(l));
  return withMeridiem ? findTime(withMeridiem) : null;
}

export interface ScreenshotHints {
  /** OCR lines set in the largest type, biggest first. */
  prominent?: string[];
}

/** Parse the OCR text of a UPI / bank payment screenshot (Google Pay, PhonePe, BHIM, Paytm, bank apps). */
export function parsePaymentScreenshot(text: string, today: YMD, hints: ScreenshotHints = {}): (ParsedTxn & { status: OcrStatus }) | null {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const flat = lines.join(' ');
  const status = detectStatus(flat);
  const app = detectApp(flat);

  const hero = findHeroAmount(lines, hints.prominent ?? []);
  const amount = hero?.amount ?? findAmounts(flat)[0]?.amount ?? null;
  if (!amount) return null;

  const isCredit = detectCredit(lines, flat);
  const refText =
    labelled(lines, /upi\s*(?:transaction|txn|ref(?:erence)?)\.?\s*(?:id|no\.?|number)?/i) ??
    labelled(lines, /\b(?:utr|rrn)\b(?:\s*no\.?)?/i) ??
    labelled(lines, /transaction\s*id/i);
  // The 12-digit UTR is what bank SMS quote too, so it is the best duplicate key.
  const ref = refText?.match(/\b\d{12}\b/)?.[0] ?? refText?.match(/[A-Z0-9]{9,30}/i)?.[0] ?? findRef(flat);

  const labels = isCredit ? PAYER_LABELS : PAYEE_LABELS;
  const self = isCredit ? SELF_ON_CREDIT : SELF_ON_DEBIT;
  const vpa = findPartyHandle(lines, labels, self, new RegExp(VPA_RE.source, 'i'))?.toLowerCase() ?? null;
  const phone = findPartyHandle(lines, labels, self, PHONE_RE);
  const payee = titleCase(findParty(lines, labels)) ?? vpa ?? (phone ? phone.replace(/\s+/g, ' ').trim() : null);

  const when = findScreenDate(lines, today);
  const isCreditCard = /credit\s*card/i.test(flat);
  const last4 = findLast4(flat, /(?:a\/?c|account|bank|card|debited\s+from|credited\s+to|from)/);

  let confidence = hero?.exact ? 0.55 : 0.35;
  if (status === 'success') confidence += 0.1;
  if (when) confidence += 0.1;
  if (ref) confidence += 0.1;
  if (payee) confidence += 0.1;
  if (app) confidence += 0.05;

  return {
    kind: 'transaction',
    status,
    direction: isCredit ? 'credit' : 'debit',
    amount,
    date: when?.date ?? today,
    time: findScreenTime(lines, when?.line ?? null),
    payee,
    vpa,
    ref,
    accountLast4: isCreditCard ? null : last4,
    cardLast4: isCreditCard ? last4 : null,
    isCreditCard,
    isRefund: /refund/i.test(flat),
    balance: null,
    bank: findBank(flat.replace(VPA_RE, ' ')),
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
