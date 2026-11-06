import { isFamilyTransfer } from './settle';
import type { Transaction } from './types';

export type DuplicateMatch = { kind: 'exact' | 'likely'; existing: Transaction; reason: string };

const WINDOW_MS = 10 * 60 * 1000;
/**
 * A card bill payment sends two SMS that can arrive a day or more apart (the bank's debit at once,
 * the card's "payment received" when NEFT lands), and is often recorded by hand before either.
 */
const CARD_PAYMENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const isCardPayment = (t: Pick<Transaction, 'type' | 'linkType'>) => t.type === 'transfer' && t.linkType === 'card';

const normRef = (ref: string | null) => (ref ? ref.replace(/\D/g, '') || ref.toLowerCase() : null);

/**
 * The same payment often arrives three ways: a bank SMS, a GPay screenshot and a manual entry.
 * - exact: same capture hash, or same UPI reference / UTR
 * - likely: same amount and direction within ±10 minutes (and same account/card when both are known);
 *   for a card bill payment, within ±3 days
 */
export function findDuplicate(
  candidate: Pick<Transaction, 'amount' | 'occurredAt' | 'type' | 'sourceRef' | 'sourceHash' | 'accountId' | 'cardId' | 'toMemberId'> & Partial<Pick<Transaction, 'linkType'>>,
  existing: Transaction[],
): DuplicateMatch | null {
  const pool = existing.filter((t) => !t.deletedAt);

  if (candidate.sourceHash) {
    const same = pool.find((t) => t.sourceHash === candidate.sourceHash);
    if (same) return { kind: 'exact', existing: same, reason: 'Already captured' };
  }

  const ref = normRef(candidate.sourceRef);
  if (ref && ref.length >= 6) {
    const same = pool.find((t) => normRef(t.sourceRef) === ref);
    if (same) return { kind: 'exact', existing: same, reason: 'Same UPI reference' };
  }

  const at = new Date(candidate.occurredAt).getTime();
  if (isCardPayment({ type: candidate.type, linkType: candidate.linkType ?? null })) {
    // The card's SMS doesn't say which account paid, and the bank's may not name a saved card: only
    // two known, different cards (or accounts) tell them apart.
    const same = pool.find(
      (t) =>
        isCardPayment(t) &&
        t.status !== 'rejected' &&
        t.amount === candidate.amount &&
        Math.abs(new Date(t.occurredAt).getTime() - at) <= CARD_PAYMENT_WINDOW_MS &&
        !(candidate.cardId && t.cardId && candidate.cardId !== t.cardId) &&
        !(candidate.accountId && t.accountId && candidate.accountId !== t.accountId),
    );
    if (same) return { kind: 'likely', existing: same, reason: 'Same card bill payment' };
  }

  const likely = pool.find((t) => {
    // A settlement paid from the app and the bank SMS for it (a family transfer) are one payment.
    const sameKind = t.type === candidate.type || (isFamilyTransfer(t) && isFamilyTransfer(candidate));
    if (t.status === 'rejected' || t.amount !== candidate.amount || !sameKind) return false;
    if (Math.abs(new Date(t.occurredAt).getTime() - at) > WINDOW_MS) return false;
    if (candidate.accountId && t.accountId && candidate.accountId !== t.accountId) return false;
    if (candidate.cardId && t.cardId && candidate.cardId !== t.cardId) return false;
    return true;
  });
  return likely ? { kind: 'likely', existing: likely, reason: 'Same amount within 10 minutes' } : null;
}

type Merged = Pick<Transaction, 'type' | 'method' | 'accountId' | 'cardId' | 'categoryId' | 'payee' | 'vpa' | 'linkType' | 'linkId' | 'flags'>;

/**
 * Two SMS for one payment (same UPI reference / UTR) each know part of it. When the first is still
 * waiting in Review, what the second adds is folded into it instead of being thrown away:
 * - money out of one saved account and into another (the debit and the credit SMS of an IMPS or UPI
 *   between your own accounts): a transfer, not spending and income;
 * - the card it was charged to (a payment app's "you paid" SMS, then the card's own for UPI on a
 *   credit card), or the account, VPA or payee the first didn't name.
 * Null when there is nothing to add, or the first was already decided.
 */
export function mergeDuplicate(existing: Transaction, candidate: Merged): Partial<Merged> | null {
  if (existing.status !== 'pending') return null;
  const flags = (existing.flags ?? '').split(',').filter(Boolean);
  const types = new Set([existing.type, candidate.type]);
  if (
    types.has('expense') &&
    types.has('income') &&
    !existing.cardId &&
    !candidate.cardId &&
    existing.accountId &&
    candidate.accountId &&
    existing.accountId !== candidate.accountId
  ) {
    const from = existing.type === 'expense' ? existing.accountId : candidate.accountId;
    return { type: 'transfer', categoryId: null, linkType: null, linkId: null, accountId: from, payee: null, flags: [...flags, 'self-transfer'].join(',') };
  }
  if (existing.type !== candidate.type) return null;

  const patch: Partial<Merged> = {};
  if (!existing.cardId && candidate.cardId) {
    if (existing.type === 'transfer' && existing.linkType === 'card') {
      patch.cardId = candidate.cardId;
      patch.linkId = candidate.cardId;
    } else if (candidate.method === 'card') {
      patch.method = 'card';
      patch.cardId = candidate.cardId;
      patch.accountId = null;
    }
    if (patch.cardId) patch.flags = flags.filter((f) => !f.startsWith('card-hint:')).join(',') || null;
  }
  if (!existing.accountId && candidate.accountId && patch.method !== 'card' && existing.method !== 'card') patch.accountId = candidate.accountId;
  if (!existing.vpa && candidate.vpa) patch.vpa = candidate.vpa;
  if (!existing.payee?.trim() && candidate.payee) patch.payee = candidate.payee;
  return Object.keys(patch).length ? patch : null;
}
