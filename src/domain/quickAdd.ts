import type { PayMethod, Transaction, TxnType } from './types';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Minutes between two times of day, going round midnight (23:50 and 00:10 are 20 apart). */
function clockGap(a: Date, b: Date): number {
  const am = a.getHours() * 60 + a.getMinutes();
  const bm = b.getHours() * 60 + b.getMinutes();
  const d = Math.abs(am - bm);
  return Math.min(d, 24 * 60 - d);
}

/**
 * The category you usually log at this time of day: confirmed entries of this type from the last
 * `days` days within `windowMin` minutes of `now`'s clock time. Needs at least `minHits` of them
 * and the winner must be a clear majority of that window, so a guess is only offered when it's
 * likely to be right (a wrong pre-selected chip costs more than no pre-selection).
 */
export function predictCategory(
  txns: readonly Transaction[],
  type: TxnType,
  now: Date,
  { days = 60, windowMin = 90, minHits = 3 }: { days?: number; windowMin?: number; minHits?: number } = {},
): string | null {
  const since = now.getTime() - days * DAY;
  const counts = new Map<string, number>();
  let total = 0;
  for (const t of txns) {
    if (t.type !== type || t.status !== 'confirmed' || t.deletedAt || !t.categoryId) continue;
    const at = new Date(t.occurredAt);
    if (at.getTime() < since || at.getTime() > now.getTime()) continue;
    if (clockGap(at, now) > windowMin) continue;
    counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
    total++;
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [id, n] of counts) if (n > bestN) [best, bestN] = [id, n];
  return best && bestN >= minHits && bestN / total > 0.5 ? best : null;
}

export interface LastPayment {
  method: PayMethod;
  cardId: string | null;
  accountId: string | null;
}

/** How the most recent confirmed entry of this type was paid: the default for the next one. */
export function lastPayment(txns: readonly Transaction[], type: TxnType): LastPayment | null {
  let last: Transaction | null = null;
  for (const t of txns) {
    if (t.type !== type || t.status !== 'confirmed' || t.deletedAt) continue;
    if (!last || t.occurredAt > last.occurredAt) last = t;
  }
  return last ? { method: last.method, cardId: last.cardId, accountId: last.accountId } : null;
}
