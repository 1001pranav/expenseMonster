import type { Transaction } from './types';

export type DuplicateMatch = { kind: 'exact' | 'likely'; existing: Transaction; reason: string };

const WINDOW_MS = 10 * 60 * 1000;

const normRef = (ref: string | null) => (ref ? ref.replace(/\D/g, '') || ref.toLowerCase() : null);

/**
 * The same payment often arrives three ways: a bank SMS, a GPay screenshot and a manual entry.
 * - exact: same capture hash, or same UPI reference / UTR
 * - likely: same amount and direction within ±10 minutes (and same account/card when both are known)
 */
export function findDuplicate(
  candidate: Pick<Transaction, 'amount' | 'occurredAt' | 'type' | 'sourceRef' | 'sourceHash' | 'accountId' | 'cardId'>,
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
  const likely = pool.find((t) => {
    if (t.status === 'rejected' || t.amount !== candidate.amount || t.type !== candidate.type) return false;
    if (Math.abs(new Date(t.occurredAt).getTime() - at) > WINDOW_MS) return false;
    if (candidate.accountId && t.accountId && candidate.accountId !== t.accountId) return false;
    if (candidate.cardId && t.cardId && candidate.cardId !== t.cardId) return false;
    return true;
  });
  return likely ? { kind: 'likely', existing: likely, reason: 'Same amount within 10 minutes' } : null;
}
