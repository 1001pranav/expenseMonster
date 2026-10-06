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
  [/\bbhim\b|bharat'?s own payments app/i, 'BHIM'],
  [/paytm/i, 'Paytm'],
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

type Hero = { amount: number; exact: boolean; /** A ₹ (or a misread of it) was in front of the digits. */ symbol: boolean };

function amountLine(line: string): Hero | null {
  const l = line.trim();
  const m = l.match(MONEY_LINE);
  if (m) {
    const a = parseAmount(m[1]);
    return a ? { amount: a, exact: true, symbol: true } : null;
  }
  if (BARE_AMOUNT.test(l) && !/^(?:19|20)\d{2}$/.test(l)) {
    const a = parseAmount(l);
    return a ? { amount: a, exact: false, symbol: false } : null;
  }
  return null;
}

/**
 * The amount is the biggest text on GPay, PhonePe and BHIM, so the OCR's largest lines are tried first.
 * Then any "₹1,250" line, then a bare number (₹ dropped by OCR) below the first payment-related line.
 */
function findHeroAmount(lines: string[], prominent: string[]): Hero | null {
  const big = prominent.map(amountLine).filter((a) => a !== null);
  const bigExact = big.find((a) => a.exact);
  if (bigExact) return bigExact;
  for (const line of lines) {
    const a = amountLine(line);
    if (a?.exact) return a;
  }
  // A bare number in the largest type is the amount with the ₹ lost.
  if (big[0]) return { ...big[0], exact: true };
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

// "Paid to" / "To" (GPay) / "Sent to" … and "Received from" / "From" (GPay) …
const PAID_HEAD = /^(?:paid\s+(?:successfully\s+)?to|sent\s+(?:successfully\s+)?to|payment\s+(?:sent\s+)?to|transferred\s+to|you\s+paid)\b:?/i;
// Not "Payment received by X": BHIM ends every *payment* with that line, naming the payee.
const RECEIVED_HEAD = /^(?:received\s+(?:successfully\s+)?from|money\s+received(?:\s+from)?|payment\s+received(?:\s+from)?(?!\s+by)|you\s+received|sent\s+by|paid\s+by)\b:?/i;
/** BHIM's banner: the word "Paid" or "Received" alone on a line (OCR may keep a stray icon character). */
const BANNER = /^(?:\S{1,2}\s+)?(paid|received)$/i;
// The bank-verified "Banking Name" is the most reliable name on GPay and BHIM, either direction.
const PAYEE_LABELS = [/^banking\s+name\b:?/i, PAID_HEAD, /^to\b:?/i, /^payment\s+received\s+by\b:?/i, /\bpaid\s+to\b:?/i];
const PAYER_LABELS = [/^banking\s+name\b:?/i, RECEIVED_HEAD, /^from\b:?/i, /^payment\s+initiated\s+by\b:?/i, /\breceived\s+from\b:?/i];
/** The user's own side of the payment: their account on a debit, the receiving account on a credit. */
const SELF_ON_DEBIT = /^(?:from\b|debited\s+(?:from|account))/i;
const SELF_ON_CREDIT = /^(?:to\b|credited\s+(?:to|account))/i;

/**
 * Expenses are the common case, so a screen is a credit only on real evidence: a "Received from" /
 * "Money received" heading, "credited to" your account, or a GPay-style "From X" heading with no
 * sign of money going out.
 */
function detectCredit(lines: string[], flat: string): boolean {
  const banner = lines.slice(0, 8).map((l) => l.match(BANNER)?.[1]).find(Boolean);
  if (banner) return banner.toLowerCase() === 'received';
  for (const l of lines) {
    if (PAID_HEAD.test(l)) return false;
    if (RECEIVED_HEAD.test(l)) return true;
  }
  const debitHint = /\b(?:debited|paid|sent|you\s+paid|payment\s+to|payment\s+received\s+by)\b/i.test(flat);
  const creditHint = /\b(?:credited\s+(?:to|account)|received\s+successfully|money\s+received|you\s+received)\b/i.test(flat);
  if (debitHint !== creditHint) return creditHint;
  if (debitHint) return false;
  const first = lines.find((l) => /^(?:to|from)\b/i.test(l));
  return Boolean(first && /^from\b/i.test(first));
}

const PHONE_RE = /(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/;
const NOT_A_NAME =
  /^(?:completed|successful(?:ly)?|success|pending|failed|transaction|transfer\s+details|payment|upi|details|view|share|split|done|paid|received|debited|credited|banking\s+name|upi\s+id|google\s+pay|phonepe|bhim|remarks?|no\s+remark|date|process\s+details|hide\s+details)\b/i;

/** A person / merchant name from an OCR line, without VPAs, amounts, masked accounts or "(HDFC Bank)". */
function asName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw
    .replace(VPA_RE, ' ')
    .replace(/(?:google\s*pay|phonepe|bhim)\s*[•·.-]?/gi, ' ')
    .replace(/^\s*(?:banking\s+name|upi\s+id|name|by)\s*[:\-]?/i, ' ')
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
    for (let j = i; j < Math.min(lines.length, i + 5) && (j === i || !(isParty(lines[j]) || self.test(lines[j]))); j++) into.add(j);
  });
  const hits = lines
    .map((l, i) => {
      const m = l.match(re);
      // "******6241@upi" is masked: its visible tail is not a usable UPI ID.
      const masked = m && /[*xX•]$/.test(l.slice(0, m.index ?? 0));
      return { i, m: masked ? undefined : m?.[0] };
    })
    .filter((h) => h.m && !own.has(h.i));
  return (hits.find((h) => near.has(h.i)) ?? hits[0])?.m ?? null;
}

const PSP_HANDLES = new Set(
  'upi ybl ibl axl okaxis okhdfcbank okicici oksbi paytm pty ptyes ptaxis pthdfc ptsbi hdfcbank icici sbi axisbank apl yapl ikwik freecharge kotak idfcbank fbl federal aubank barodampay cnrb pnb unionbank indus rbl yesbank waicici wahdfcbank waaxis wasbi superyes jupiteraxis naviaxis'.split(' '),
);

/**
 * Narrow columns wrap long UPI IDs: BHIM prints "MCDONALDS" / ".27312402@hd" / "fcbank", with the
 * next column's "NO REMARK" read in between. Glue the pieces back into one line.
 */
function mergeWrappedVpas(input: string[]): string[] {
  const lines = [...input];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([a-z0-9.\-_*]*)@([a-z0-9]*)$/i);
    if (!m) continue;
    let [, local, domain] = m;
    const used: number[] = [];
    if (/^[.\-_]/.test(local) || !local) {
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        if (/\s/.test(lines[j])) continue;
        if (/^[a-z0-9.\-_]+$/i.test(lines[j])) {
          local = lines[j] + local;
          used.push(j);
        }
        break;
      }
    }
    for (let j = i + 1; j < Math.min(lines.length, i + 3) && !PSP_HANDLES.has(domain.toLowerCase()); j++) {
      if (/\s/.test(lines[j])) continue;
      if (/^[a-z]{1,12}$/i.test(lines[j])) {
        domain += lines[j];
        used.push(j);
      }
      break;
    }
    if (!used.length) continue;
    lines[i] = `${local}@${domain}`;
    for (const j of used) lines[j] = '';
  }
  return lines.filter(Boolean);
}

/** A reference written after its label or on one of the next lines (BHIM puts "Date & Time" in between). */
function labelledRef(lines: string[], label: RegExp): string | null {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    const rest = lines[i].slice((m.index ?? 0) + m[0].length);
    for (const candidate of [rest, ...lines.slice(i + 1, i + 4)]) {
      const tokens = candidate.match(/\b[A-Z0-9]{9,30}\b/gi) ?? [];
      // A word like "Completed" is not a reference: a fake ref made every later screenshot a "duplicate".
      const ref = tokens.find((t) => /^\d{12}$/.test(t)) ?? tokens.find((t) => (t.match(/\d/g)?.length ?? 0) >= 6);
      if (ref) return ref;
    }
  }
  return null;
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
  /** The user's own name(s): seen as the other party, the direction must be the other way round. */
  selfNames?: string[];
}

const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
/** "PRANAV N" matches "Pranav Nair": same first word, and the rest agree as far as both go. */
function isSelf(name: string | null, selfNames: string[]): boolean {
  if (!name) return false;
  const words = name.toLowerCase().split(/\s+/).map(nameKey).filter(Boolean);
  return selfNames.some((self) => {
    const own = self.toLowerCase().split(/\s+/).map(nameKey).filter(Boolean);
    if (!own.length || !words.length || own[0] !== words[0]) return false;
    return words.slice(1).every((w, i) => !own[i + 1] || own[i + 1].startsWith(w) || w.startsWith(own[i + 1]));
  });
}

/** Parse the OCR text of a UPI / bank payment screenshot (Google Pay, PhonePe, BHIM, Paytm, bank apps). */
export function parsePaymentScreenshot(
  text: string,
  today: YMD,
  hints: ScreenshotHints = {},
): (ParsedTxn & { status: OcrStatus; amountSure: boolean }) | null {
  const lines = mergeWrappedVpas(text.split(/\n+/).map((l) => l.trim()).filter(Boolean));
  const flat = lines.join(' ');
  const status = detectStatus(flat);
  const app = detectApp(flat);

  const hero = findHeroAmount(lines, hints.prominent ?? []);
  const amount = hero?.amount ?? findAmounts(flat)[0]?.amount ?? null;
  if (!amount) return null;

  let isCredit = detectCredit(lines, flat);
  const selfNames = (hints.selfNames ?? []).filter((n) => n.trim().length >= 2);
  // The user's own name on the "other party" side means the direction was read backwards.
  if (selfNames.length && isSelf(findParty(lines, isCredit ? PAYER_LABELS : PAYEE_LABELS), selfNames)) {
    const flipped = findParty(lines, isCredit ? PAYEE_LABELS : PAYER_LABELS);
    if (flipped && !isSelf(flipped, selfNames)) isCredit = !isCredit;
  }
  const ref =
    labelledRef(lines, /upi\s*(?:transaction|txn|ref(?:erence)?)\.?\s*(?:id|no\.?|number)?/i) ??
    labelledRef(lines, /\b(?:utr|rrn)\b(?:\s*no\.?)?/i) ??
    labelledRef(lines, /transaction\s*id/i) ??
    findRef(flat);

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
    // No ₹ sign was read next to the amount, so a misread digit (₹ → 7 / 2) can't be ruled out.
    amountSure: Boolean(hero?.symbol),
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
