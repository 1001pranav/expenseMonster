import { addDays, isoToYMD, type YMD } from './dates';
import type { Paise } from './money';
import { cardEndingIn, maskedCardDigits, type ParsedTxn } from './parsers/common';
import { flagsOf, isClearCapture } from './transactions';
import type { PayMethod, Transaction, TxnType } from './types';

/**
 * Check captures, split in two: READY were read clearly (sure amount, known payee and category,
 * no duplicate) and approve together in one tap; NEEDS YOU have one open question each.
 */
export function splitCaptures(pending: Transaction[]): { ready: Transaction[]; needsYou: Transaction[] } {
  const ready: Transaction[] = [];
  const needsYou: Transaction[] = [];
  for (const t of pending) (isClearCapture(t) ? ready : needsYou).push(t);
  return { ready, needsYou };
}

/** Last four digits of a card the message named but that isn't saved (or has no number yet). */
export const cardHintOf = (t: Pick<Transaction, 'flags'>): string | null => flagsOf(t).find((f) => f.startsWith('card-hint:'))?.split(':')[1] || null;

/** The capture this one may repeat, from its "duplicate:<id>" flag. */
export const duplicateOf = (t: Pick<Transaction, 'flags'>): string | null => flagsOf(t).find((f) => f.startsWith('duplicate:'))?.split(':')[1] || null;

/** The payment app a screenshot came from ("PhonePe"), from its "app:" flag. */
export const appOf = (t: Pick<Transaction, 'flags'>): string | null => flagsOf(t).find((f) => f.startsWith('app:'))?.slice(4) || null;

/**
 * When the ₹ sign wasn't read, OCR often turns it into a 7 or a 2 in front of the amount
 * ("₹640" → "7640"). Offer the amount without that digit as a one-tap fix.
 */
export function suggestAmountFix(amount: Paise, flags: string[]): Paise | null {
  if (!flags.includes('amount-unsure')) return null;
  const rupees = String(Math.floor(amount / 100));
  if (rupees.length < 2 || !/^[72]/.test(rupees)) return null;
  const fixed = Number(rupees.slice(1)) * 100 + (amount % 100);
  return fixed > 0 ? fixed : null;
}

export interface Repeat {
  payee: string;
  amount: Paise;
  categoryId: string | null;
  method: PayMethod;
  cardId: string | null;
  accountId: string | null;
  count: number;
}

/**
 * Payments made more than once lately with the same payee and amount (milk, auto, a usual order),
 * most frequent first, so "Again?" can fill the whole form in one tap.
 */
export function recentRepeats(txns: Transaction[], type: TxnType, today: YMD, limit = 3, days = 60): Repeat[] {
  const since = addDays(today, -days);
  const byKey = new Map<string, Repeat & { last: string }>();
  for (const t of txns) {
    if (t.status !== 'confirmed' || t.deletedAt || t.type !== type || !t.payee?.trim()) continue;
    if (isoToYMD(t.occurredAt) < since) continue;
    const key = `${t.payee.trim().toLowerCase()}|${t.amount}`;
    const hit = byKey.get(key);
    if (hit) {
      hit.count++;
      if (t.occurredAt > hit.last) Object.assign(hit, { last: t.occurredAt, payee: t.payee.trim(), categoryId: t.categoryId, method: t.method, cardId: t.cardId, accountId: t.accountId });
    } else {
      byKey.set(key, { payee: t.payee.trim(), amount: t.amount, categoryId: t.categoryId, method: t.method, cardId: t.cardId, accountId: t.accountId, count: 1, last: t.occurredAt });
    }
  }
  return [...byKey.values()]
    .filter((r) => r.count >= 2)
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, limit)
    .map(({ last: _last, ...r }) => r);
}

/** What a bank SMS fills in on the new-entry form (the keypad's "Paste bank SMS"). */
export interface SmsFill {
  type: TxnType;
  amount: Paise;
  payee: string | null;
  vpa: string | null;
  method: PayMethod;
  cardId: string | null;
  accountId: string | null;
  date: YMD | null;
  /** UPI reference, kept so the same SMS imported or pasted later is seen as already recorded. */
  sourceRef: string | null;
  /** A "payment received" on a credit card: a card bill paid, so a transfer to that card. */
  paysCardId: string | null;
}

export function fillFromSms(p: ParsedTxn, text: string, cards: { id: string; last4: string | null }[], accounts: { id: string; last4: string | null }[]): SmsFill {
  const card = p.isCreditCard ? cardEndingIn(cards, p.cardLast4 ?? maskedCardDigits(text)) : undefined;
  const account = p.isCreditCard ? undefined : cardEndingIn(accounts, p.accountLast4);
  const cardBill = p.isCreditCard && p.direction === 'credit' && !p.isRefund && /payment/i.test(text);
  return {
    type: cardBill ? 'transfer' : p.direction === 'debit' ? 'expense' : 'income',
    amount: p.amount,
    payee: cardBill ? null : (p.payee ?? null),
    vpa: p.vpa,
    method: cardBill ? 'bank' : p.isCreditCard ? 'card' : p.vpa || p.ref ? 'upi' : 'bank',
    cardId: cardBill ? null : (card?.id ?? null),
    accountId: account?.id ?? null,
    date: p.date,
    sourceRef: p.ref,
    paysCardId: cardBill ? (card?.id ?? null) : null,
  };
}
