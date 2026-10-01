import { addDays, addMonths, clampedDate, diffDays, isoToYMD, parts, type YMD } from './dates';
import type { Paise } from './money';
import type { CardStatementOverride, CreditCard, Transaction } from './types';

export interface Cycle {
  /** First day included in the cycle. */
  start: YMD;
  /** Statement (bill generation) date: last day included in the cycle. */
  statementDate: YMD;
  dueDate: YMD;
}

/** Statement date for the cycle a purchase on `date` belongs to. */
export function statementDateFor(date: YMD, statementDay: number): YMD {
  const { y, m } = parts(date);
  const thisMonth = clampedDate(y, m, statementDay);
  // Purchase on or before this month's statement date → this cycle; after → next cycle.
  return date <= thisMonth ? thisMonth : addMonths(thisMonth, 1, statementDay);
}

/** Payment due date: the first `dueDay` strictly after the statement date. */
export function dueDateFor(statementDate: YMD, dueDay: number): YMD {
  const { y, m } = parts(statementDate);
  const sameMonth = clampedDate(y, m, dueDay);
  return sameMonth > statementDate ? sameMonth : addMonths(sameMonth, 1, dueDay);
}

export function cycleFor(date: YMD, card: Pick<CreditCard, 'statementDay' | 'dueDay'>): Cycle {
  const statementDate = statementDateFor(date, card.statementDay);
  const prevStatement = addMonths(statementDate, -1, card.statementDay);
  return {
    start: addDays(prevStatement, 1),
    statementDate,
    dueDate: dueDateFor(statementDate, card.dueDay),
  };
}

/** Typical Indian issuer minimum due: 5% of total, at least ₹200 (or the full amount if smaller). */
export const estimateMinDue = (total: Paise): Paise => (total <= 0 ? 0 : Math.min(total, Math.max(Math.round(total * 0.05), 20000)));

export type StatementStatus = 'unbilled' | 'due' | 'paid' | 'partly_paid' | 'overdue' | 'nil';

export interface CycleSummary extends Cycle {
  purchases: Paise;
  refunds: Paise;
  /** Computed (purchases - refunds) or the bank's actual figure when overridden. */
  total: Paise;
  computedTotal: Paise;
  minDue: Paise;
  paid: Paise;
  remaining: Paise;
  status: StatementStatus;
  overridden: boolean;
  transactionIds: string[];
}

export interface CardLedger {
  cycles: CycleSummary[];
  /** Spend in the open cycle (not yet billed). */
  current: CycleSummary;
  /** Most recent generated statement, if any. */
  lastStatement: CycleSummary | null;
  /** Everything owed: unpaid statements + unbilled spend. */
  outstanding: Paise;
  utilisation: number | null;
  daysToDue: number | null;
}

const isCardCharge = (t: Transaction, cardId: string) =>
  t.cardId === cardId && t.status === 'confirmed' && !t.deletedAt && (t.type === 'expense' || (t.type === 'income' && t.method === 'card'));

const isCardPayment = (t: Transaction, cardId: string) =>
  t.cardId === cardId && t.status === 'confirmed' && !t.deletedAt && t.type === 'transfer' && t.linkType === 'card';

/**
 * Builds the card's statement history from its transactions.
 *
 * - Card purchases (expense, card) are bucketed by statement cycle.
 * - Refunds (income with method card) reduce the cycle they land in.
 * - Bill payments (transfer, linkType card) are NOT expenses; they are applied to
 *   statements oldest-first, so paying a bill never double-counts spending.
 */
export function buildCardLedger(
  card: CreditCard,
  transactions: Transaction[],
  overrides: CardStatementOverride[],
  today: YMD,
  trackingStart: YMD | null = card.createdAt ? card.createdAt.slice(0, 10) : null,
): CardLedger {
  const byStatement = new Map<YMD, { purchases: Paise; refunds: Paise; ids: string[] }>();
  const currentCycle = cycleFor(today, card);
  byStatement.set(currentCycle.statementDate, { purchases: 0, refunds: 0, ids: [] });

  for (const t of transactions) {
    if (!isCardCharge(t, card.id)) continue;
    const key = statementDateFor(isoToYMD(t.occurredAt), card.statementDay);
    const bucket = byStatement.get(key) ?? { purchases: 0, refunds: 0, ids: [] };
    if (t.type === 'expense') bucket.purchases += t.amount;
    else bucket.refunds += t.amount;
    bucket.ids.push(t.id);
    byStatement.set(key, bucket);
  }

  const overrideFor = new Map(overrides.filter((o) => o.cardId === card.id && !o.deletedAt).map((o) => [o.statementDate, o]));
  for (const o of overrideFor.values()) if (!byStatement.has(o.statementDate)) byStatement.set(o.statementDate, { purchases: 0, refunds: 0, ids: [] });

  let paymentPool = transactions.filter((t) => isCardPayment(t, card.id)).reduce((a, t) => a + t.amount, 0);

  const statementDates = [...byStatement.keys()].sort();
  const cycles: CycleSummary[] = statementDates.map((statementDate) => {
    const b = byStatement.get(statementDate)!;
    const c = cycleFor(statementDate, card);
    const computedTotal = b.purchases - b.refunds;
    const override = overrideFor.get(statementDate);
    const total = override ? override.total : computedTotal;
    const billed = statementDate < today;
    // Statements that were already due before tracking started were paid outside the app: treat
    // them as settled (unless the bank's figure was entered), otherwise every new card starts
    // "overdue". A statement generated just before tracking but due later stays payable.
    const preTracking = trackingStart !== null && c.dueDate < trackingStart && !override;
    let paid = 0;
    if (billed && total > 0) {
      paid = preTracking ? total : Math.min(paymentPool, total);
      if (!preTracking) paymentPool -= paid;
    }
    const remaining = Math.max(total - paid, 0);
    let status: StatementStatus;
    if (!billed) status = 'unbilled';
    else if (total <= 0) status = 'nil';
    else if (remaining === 0) status = 'paid';
    else if (c.dueDate < today) status = 'overdue';
    else if (paid > 0) status = 'partly_paid';
    else status = 'due';
    return {
      ...c,
      purchases: b.purchases,
      refunds: b.refunds,
      total,
      computedTotal,
      minDue: override?.minDue ?? estimateMinDue(total),
      paid,
      remaining,
      status,
      overridden: Boolean(override),
      transactionIds: b.ids,
    };
  });

  // Any payment left over (advance payment / credit balance) reduces unbilled spend.
  const open = cycles.filter((c) => c.status === 'unbilled');
  for (const c of open) {
    const applied = Math.min(paymentPool, Math.max(c.total, 0));
    c.paid = applied;
    c.remaining = c.total - applied;
    paymentPool -= applied;
  }

  const current = cycles.find((c) => c.statementDate === currentCycle.statementDate)!;
  const billedCycles = cycles.filter((c) => c.status !== 'unbilled');
  const lastStatement = billedCycles.length ? billedCycles[billedCycles.length - 1] : null;
  const outstanding = cycles.reduce((a, c) => a + c.remaining, 0) - paymentPool;
  const nextUnpaid = billedCycles.find((c) => c.remaining > 0);

  return {
    cycles,
    current,
    lastStatement,
    outstanding,
    utilisation: card.creditLimit ? outstanding / card.creditLimit : null,
    daysToDue: nextUnpaid ? diffDays(nextUnpaid.dueDate, today) : null,
  };
}

export const STATUS_LABEL: Record<StatementStatus, string> = {
  unbilled: 'Unbilled',
  due: 'Due',
  paid: 'Paid',
  partly_paid: 'Partly paid',
  overdue: 'Overdue',
  nil: 'Nil statement',
};
