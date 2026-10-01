import { autopayMissing, billerMeta, nextExpectedBillDate, prepaidStatus, predictNextLpg, viewBill } from './bills';
import { buildCardLedger } from './creditCard';
import { addDays, diffDays, type YMD } from './dates';
import { loanProgress, scheduleFor } from './emi';
import { formatINR, type Paise } from './money';
import type { Bill, Biller, CardStatementOverride, CreditCard, Loan, Policy, RecurringIncome, Transaction } from './types';

export type DueKind = 'emi' | 'lent' | 'card' | 'bill' | 'enter_bill' | 'prepaid' | 'lpg' | 'policy' | 'income' | 'autopay_check';
export type DueState = 'overdue' | 'due' | 'upcoming';

export interface DueItem {
  key: string;
  kind: DueKind;
  title: string;
  subtitle: string;
  amount: Paise | null;
  date: YMD;
  state: DueState;
  /** Route to open for details. */
  href: string;
  /** Entity the "Mark paid" action links to. */
  link: { type: 'loan' | 'card' | 'bill' | 'policy' | 'income' | 'biller'; id: string } | null;
  upiId: string | null;
  icon: string;
  /** Money coming in rather than going out. */
  incoming: boolean;
}

export interface DuesInput {
  loans: Loan[];
  cards: CreditCard[];
  cardOverrides: CardStatementOverride[];
  billers: Biller[];
  bills: Bill[];
  policies: Policy[];
  incomes: RecurringIncome[];
  transactions: Transaction[];
}

const live = <T extends { deletedAt: string | null }>(rows: T[]) => rows.filter((r) => !r.deletedAt);

export function linkedCount(transactions: Transaction[], type: Transaction['linkType'], id: string): number {
  return transactions.filter((t) => !t.deletedAt && t.status === 'confirmed' && t.linkType === type && t.linkId === id).length;
}

export function linkedTotal(transactions: Transaction[], type: Transaction['linkType'], id: string): Paise {
  return transactions
    .filter((t) => !t.deletedAt && t.status === 'confirmed' && t.linkType === type && t.linkId === id)
    .reduce((a, t) => a + t.amount, 0);
}

function stateFor(date: YMD, today: YMD, soonDays = 7): DueState {
  if (date < today) return 'overdue';
  return diffDays(date, today) <= soonDays ? 'due' : 'upcoming';
}

export function loanEmisPaid(loan: Loan, transactions: Transaction[]): number {
  if (loan.interestType === 'none' && loan.direction === 'lent') return 0;
  const paidAmount = linkedTotal(transactions, 'loan', loan.id);
  const byAmount = loan.emi > 0 ? Math.floor((paidAmount + 99) / loan.emi) : 0;
  return loan.paidBeforeTracking + byAmount;
}

/**
 * Everything payable (or receivable) up to `today + horizonDays`, plus anything overdue.
 * This single list drives the Dues tab, the Home "due soon" strip and local notifications.
 */
export function computeDues(input: DuesInput, today: YMD, horizonDays = 45): DueItem[] {
  const horizon = addDays(today, horizonDays);
  const tx = live(input.transactions);
  const items: DueItem[] = [];

  for (const loan of live(input.loans)) {
    if (loan.closed) continue;
    const schedule = scheduleFor(loan);
    const progress = loanProgress(schedule, loanEmisPaid(loan, tx), today);
    const next = progress.nextDue;
    if (!next || next.date > horizon) continue;
    const borrowed = loan.direction === 'borrowed';
    items.push({
      key: `loan:${loan.id}:${next.n}`,
      kind: borrowed ? 'emi' : 'lent',
      title: borrowed ? `${loan.name} EMI` : `${loan.name} repayment`,
      subtitle: `${next.n}/${schedule.length}${progress.overdueCount > 1 ? ` · ${progress.overdueCount} overdue` : ''}`,
      amount: next.emi,
      date: next.date,
      state: stateFor(next.date, today),
      href: `/loan/${loan.id}`,
      link: { type: 'loan', id: loan.id },
      upiId: loan.upiId,
      icon: borrowed ? 'trending-down' : 'trending-up',
      incoming: !borrowed,
    });
  }

  for (const card of live(input.cards)) {
    const ledger = buildCardLedger(card, tx, input.cardOverrides, today);
    for (const c of ledger.cycles) {
      if (c.status === 'unbilled' || c.remaining <= 0) continue;
      items.push({
        key: `card:${card.id}:${c.statementDate}`,
        kind: 'card',
        title: `${card.name} bill`,
        subtitle: c.status === 'partly_paid' ? `Part paid · min ${formatINR(c.minDue)}` : `Min due ${formatINR(c.minDue)}`,
        amount: c.remaining,
        date: c.dueDate,
        state: stateFor(c.dueDate, today),
        href: `/card/${card.id}`,
        link: { type: 'card', id: card.id },
        upiId: null,
        icon: 'card',
        incoming: false,
      });
    }
  }

  const bills = live(input.bills);
  for (const biller of live(input.billers)) {
    if (!biller.active) continue;
    const meta = billerMeta(biller.type);
    const mine = bills.filter((b) => b.billerId === biller.id);

    if (biller.amountMode === 'prepaid') {
      const st = prepaidStatus(mine, biller.id, today);
      if (st.validUntil && st.validUntil <= horizon) {
        items.push({
          key: `prepaid:${biller.id}:${st.validUntil}`,
          kind: 'prepaid',
          title: `${biller.name} recharge`,
          subtitle: st.state === 'expired' ? 'Plan expired' : `Plan expires ${st.daysLeft === 0 ? 'today' : `in ${st.daysLeft} days`}`,
          amount: biller.fixedAmount,
          date: st.validUntil,
          state: stateFor(st.validUntil, today, 5),
          href: `/biller/${biller.id}`,
          link: { type: 'biller', id: biller.id },
          upiId: biller.upiId,
          icon: meta.icon,
          incoming: false,
        });
      }
      continue;
    }

    if (biller.amountMode === 'on_demand') {
      const p = predictNextLpg(mine.map((b) => b.billDate));
      if (p && p.nextDate <= horizon) {
        items.push({
          key: `lpg:${biller.id}:${p.nextDate}`,
          kind: 'lpg',
          title: `Book ${biller.name}`,
          subtitle: `Usually lasts ${p.averageDays} days`,
          amount: biller.fixedAmount,
          date: p.nextDate,
          state: stateFor(p.nextDate, today, 3),
          href: `/biller/${biller.id}`,
          link: { type: 'biller', id: biller.id },
          upiId: biller.upiId,
          icon: meta.icon,
          incoming: false,
        });
      }
      continue;
    }

    for (const bill of mine) {
      if (bill.status === 'draft' || bill.status === 'skipped') continue;
      const view = viewBill(bill, tx, today);
      if (view.state === 'paid' || bill.dueDate > horizon) continue;
      if (biller.autopay && !autopayMissing(biller, view, today)) {
        if (view.daysToDue < 0) continue;
      }
      const missing = autopayMissing(biller, view, today);
      items.push({
        key: `bill:${bill.id}`,
        kind: missing ? 'autopay_check' : 'bill',
        title: biller.name,
        subtitle: missing
          ? 'Autopay debit not seen — check'
          : biller.autopay
            ? 'Autopay'
            : view.paid > 0
              ? `Part paid ${formatINR(view.paid)}`
              : meta.label,
        amount: view.remaining,
        date: bill.dueDate,
        state: stateFor(bill.dueDate, today),
        href: `/biller/${biller.id}`,
        link: { type: 'bill', id: bill.id },
        upiId: biller.upiId,
        icon: meta.icon,
        incoming: false,
      });
    }

    if (biller.amountMode === 'variable') {
      const expected = nextExpectedBillDate(biller, mine, today);
      const hasOpen = mine.some((b) => b.billDate >= addDays(expected, -10));
      if (!hasOpen && expected <= addDays(today, 3)) {
        items.push({
          key: `enter:${biller.id}:${expected}`,
          kind: 'enter_bill',
          title: `Enter ${biller.name} bill`,
          subtitle: 'New bill expected',
          amount: null,
          date: expected,
          state: expected < today ? 'due' : 'upcoming',
          href: `/bill/new?billerId=${biller.id}`,
          link: { type: 'biller', id: biller.id },
          upiId: null,
          icon: meta.icon,
          incoming: false,
        });
      }
    }
  }

  for (const p of live(input.policies)) {
    if (!p.active || p.nextDueDate > horizon) continue;
    items.push({
      key: `policy:${p.id}:${p.nextDueDate}`,
      kind: 'policy',
      title: `${p.name} premium`,
      subtitle: p.autopay ? `${p.insurer} · autopay` : p.insurer,
      amount: p.premium,
      date: p.nextDueDate,
      state: stateFor(p.nextDueDate, today, 30),
      href: `/policy/${p.id}`,
      link: { type: 'policy', id: p.id },
      upiId: null,
      icon: 'shield-checkmark',
      incoming: false,
    });
  }

  for (const inc of live(input.incomes)) {
    if (!inc.active || inc.nextDate > horizon) continue;
    items.push({
      key: `income:${inc.id}:${inc.nextDate}`,
      kind: 'income',
      title: inc.name,
      subtitle: 'Expected income',
      amount: inc.amount,
      date: inc.nextDate,
      state: stateFor(inc.nextDate, today, 3),
      href: `/income/${inc.id}`,
      link: { type: 'income', id: inc.id },
      upiId: null,
      icon: 'wallet',
      incoming: true,
    });
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export interface Reminder {
  id: string;
  title: string;
  body: string;
  /** Local date + hour to fire. */
  date: YMD;
  hour: number;
  href: string;
  dueKey: string;
}

/** Reminder offsets (days before due) per kind. */
const OFFSETS: Record<DueKind, number[]> = {
  emi: [3, 0],
  lent: [0],
  card: [5, 1, 0],
  bill: [3, 0],
  enter_bill: [0],
  prepaid: [3, 0],
  lpg: [0],
  policy: [30, 7, 1],
  income: [0],
  autopay_check: [0],
};

/** Turn dues into dated notifications, skipping any whose time has passed. Overdue items get one reminder today. */
export function computeReminders(dues: DueItem[], today: YMD, nowHour: number, max = 60): Reminder[] {
  const out: Reminder[] = [];
  for (const d of dues) {
    const amount = d.amount ? formatINR(d.amount) : '';
    if (d.state === 'overdue') {
      if (nowHour < 19) out.push({ id: `${d.key}:overdue`, title: `Overdue: ${d.title}`, body: `${amount || 'Payment'} was due ${d.date}`, date: today, hour: 19, href: d.href, dueKey: d.key });
      continue;
    }
    for (const offset of OFFSETS[d.kind]) {
      const date = addDays(d.date, -offset);
      const hour = 9;
      if (date < today || (date === today && nowHour >= hour)) continue;
      const when = offset === 0 ? 'today' : offset === 1 ? 'tomorrow' : `in ${offset} days`;
      out.push({
        id: `${d.key}:${offset}`,
        title: d.incoming ? `${d.title} expected ${when}` : `${d.title} due ${when}`,
        body: `${amount ? `${amount} · ` : ''}${d.subtitle}`,
        date,
        hour,
        href: d.href,
        dueKey: d.key,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, max);
}
