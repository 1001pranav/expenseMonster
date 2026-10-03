import type { YMD } from '../dates';
import {
  cleanName,
  findAmounts,
  findBalance,
  findBank,
  findDate,
  findLast4,
  findRef,
  findTime,
  findVpa,
  titleCase,
  type Parsed,
  type ParsedBill,
  type ParsedCardStatement,
  type ParsedTxn,
} from './common';

const IGNORE = [
  /\botp\b|one[\s-]?time\s+password|verification code|\bcode is\b/i,
  /pre-?approved|eligible for|apply now|offer|cashback up ?to|win\b|lucky|reward points? (?:earned|balance)/i,
  /\bwill be debited\b|\bscheduled\b|\bmandate\b(?!.*\bdebited\b)/i,
  /has requested|collect request|requested money/i,
  /^(?!.*\bcredited\b).*\b(?:failed|declined|unsuccessful)\b/is,
];

const DEBIT = /\b(debited|spent|sent|paid|withdrawn|purchase|txn of|transferred|deducted|charged|used for)\b/i;
const CREDIT = /\b(credited|received|deposited|refund(?:ed)?|reversed|added)\b/i;

function direction(text: string): 'debit' | 'credit' | null {
  const d = text.search(DEBIT);
  const c = text.search(CREDIT);
  if (d < 0 && c < 0) return null;
  if (d < 0) return 'credit';
  if (c < 0) return 'debit';
  return d < c ? 'debit' : 'credit';
}

function findPayee(text: string, dir: 'debit' | 'credit'): string | null {
  const patterns: RegExp[] =
    dir === 'debit'
      ? [
          /UPI\/P2[AM]\/\d+\/([^/\n]+)/i,
          /;\s*([A-Za-z0-9 .&'_-]{2,40}?)\s+credited/i,
          /\b(?:trf|transfer(?:red)?)\s+to\s+([A-Za-z0-9 .&'@_-]{2,40}?)(?=\s+(?:ref\w*|on|upi|via)\b|[.\n]|$)/i,
          /\bat\s+([A-Za-z0-9 .&'*_-]{2,40}?)(?=\s+(?:on|via|ref|avl|txn|for)\b|[.\n]|$)/i,
          /\bto\s+(?!your\b|a\/c\b|ac\b)([A-Za-z0-9 .&'@_-]{2,40}?)(?=\s+(?:on|via|ref|upi|from)\b|[.\n]|$)/i,
          /\bon\s+([A-Z][A-Z0-9 .&'*_-]{2,30})\.\s*(?:avl|if not)/,
          /\bInfo:?\s*([A-Za-z0-9 .&'*/_-]{2,40})/i,
        ]
      : [
          /\bby\s+(?:NEFT|IMPS|RTGS|UPI)[-/ ]*([A-Za-z0-9 .&'_-]{2,40}?)(?=[.\n]|\s+(?:avl|ref|on)\b|$)/i,
          /\bfrom\s+(?!your\b|a\/c\b)([A-Za-z0-9 .&'@_-]{2,40}?)(?=\s+(?:on|via|ref|upi)\b|[.\n(]|$)/i,
          /UPI\/CR\/\d+\/([^/\n]+)/i,
        ];
  for (const p of patterns) {
    const m = text.match(p);
    const name = cleanName(m?.[1]);
    if (name && !/^(?:hdfc|sbi|icici|axis|kotak)\b/i.test(name) && !/\b(?:bank|a\/c|acct|card)\s*(?:xx|\*)?\d*$/i.test(name)) return name;
  }
  return null;
}

function parseBill(text: string, ref: YMD): ParsedBill | null {
  if (!/\bbill\b/i.test(text) || !/\bdue\b/i.test(text)) return null;
  if (/\b(debited|spent|paid|received|successful(?:ly)?)\b/i.test(text) && !/\bgenerated\b/i.test(text)) return null;
  const amounts = findAmounts(text);
  if (!amounts.length) return null;
  const dueIdx = text.search(/\bdue\b/i);
  const due = findDate(text.slice(dueIdx), ref);
  const providerMatch =
    text.match(/your\s+([A-Za-z][A-Za-z0-9 &.-]{1,30}?)\s+(?:\w+\s+)?bill/i) ?? text.match(/^([A-Za-z][A-Za-z0-9 &.-]{1,30}?):/);
  const consumer = text.match(/(?:a\/c|acct|account|consumer|ca|k\s*no|service)\s*(?:no\.?|number|id)?[\s.:-]*([A-Z0-9]{5,20})\b/i);
  const usage = text.match(/([\d.]+)\s*(kwh|units?|kl|scm)\b/i);
  return {
    kind: 'bill',
    amount: amounts[0].amount,
    dueDate: due,
    billDate: null,
    provider: cleanName(providerMatch?.[1]),
    consumerNo: consumer && /\d/.test(consumer[1]) ? consumer[1] : null,
    usage: usage ? Number(usage[1]) : null,
    usageUnit: usage ? usage[2].toLowerCase().replace('units', 'kWh').replace('unit', 'kWh') : null,
    confidence: 0.6 + (due ? 0.2 : 0) + (providerMatch ? 0.1 : 0),
  };
}

function parseCardStatement(text: string, ref: YMD): ParsedCardStatement | null {
  if (!/statement/i.test(text) || !/card/i.test(text) || !/(?:total|tot\.?)\s*(?:amt|amount)?\s*due/i.test(text)) return null;
  const total = text.match(/(?:total|tot\.?)\s*(?:amt|amount)?\s*due[^\d₹]{0,12}(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const min = text.match(/min(?:imum)?\.?\s*(?:amt|amount)?\s*due[^\d₹]{0,12}(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!total) return null;
  const toP = (s: string) => Math.round(Number(s.replace(/,/g, '')) * 100);
  const dueIdx = text.search(/due\s*(?:by|on|date)/i);
  return {
    kind: 'card_statement',
    cardLast4: findLast4(text, /card/),
    bank: findBank(text),
    total: toP(total[1]),
    minDue: min ? toP(min[1]) : null,
    dueDate: dueIdx >= 0 ? findDate(text.slice(dueIdx), ref) : null,
    confidence: 0.85,
  };
}

/**
 * Parse one bank / card / biller SMS. Returns null for OTPs, promotions, failed
 * transactions, future mandates and anything without a confident amount.
 * `received` is the SMS timestamp's date, used when the body has no date.
 */
export function parseSms(body: string, received: YMD): Parsed | null {
  const text = body.replace(/[ \t\r]+/g, ' ').replace(/ *\n\s*/g, '\n').trim();
  if (!text) return null;

  const statement = parseCardStatement(text, received);
  if (statement) return statement;

  if (IGNORE.some((re) => re.test(text))) return null;

  const bill = parseBill(text, received);
  if (bill) return bill;

  const dir = direction(text);
  if (!dir) return null;
  const amounts = findAmounts(text);
  if (!amounts.length) return null;

  const isCard = /credit\s*card|\bcard\b/i.test(text) && !/debit\s*card/i.test(text);
  const cardLast4 = isCard ? findLast4(text, /card/) : null;
  const accountLast4 = findLast4(text, /(?:a\/?c|acct|account)/);
  const vpa = findVpa(text);
  const date = findDate(text, received);
  const ref = findRef(text);
  const payee = titleCase(findPayee(text, dir)) ?? vpa;
  const isRefund = /refund|reversed|reversal|cashback/i.test(text) && dir === 'credit';

  let confidence = 0.5;
  if (date) confidence += 0.1;
  if (ref) confidence += 0.15;
  if (accountLast4 || cardLast4) confidence += 0.1;
  if (payee) confidence += 0.1;

  const parsed: ParsedTxn = {
    kind: 'transaction',
    direction: dir,
    amount: amounts[0].amount,
    date: date ?? received,
    time: findTime(text),
    payee,
    vpa,
    ref,
    accountLast4: isCard ? null : accountLast4,
    cardLast4,
    isCreditCard: isCard && Boolean(cardLast4),
    isRefund,
    balance: findBalance(text),
    bank: findBank(text),
    app: null,
    confidence: Math.min(confidence, 0.95),
  };
  return parsed;
}
