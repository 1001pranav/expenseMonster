import { emiQuote, instalments } from '../cardEmi';
import { buildCardLedger } from '../creditCard';
import { computeDues, loanEmisPaid } from '../dues';
import { calcEmi } from '../emi';
import { monthTotals } from '../transactions';
import type { Loan } from '../types';
import { at, base, card, txn } from './fixtures';

// HDFC-style card: statement on the 15th, due on the 5th.
const c = card();
const phone = txn({ id: 'phone', cardId: c.id, method: 'card', amount: 60_000_00, occurredAt: at('2026-08-20'), payee: 'Croma' });

const plan = (over: Partial<Loan> = {}): Loan => ({
  ...base({ id: 'emi-1' }),
  name: 'Croma phone',
  direction: 'borrowed',
  kind: 'card_emi',
  lender: c.name,
  memberId: null,
  principal: 60_000_00,
  ratePa: 0,
  interestType: 'none',
  tenureMonths: 6,
  firstEmiDate: '2026-09-10',
  emi: calcEmi(60_000_00, 0, 6, 'none'),
  paidBeforeTracking: 0,
  closed: 0,
  upiId: null,
  note: null,
  cardId: c.id,
  sourceTxnId: 'phone',
  processingFee: 199_00,
  ...over,
});

describe('card EMI instalments', () => {
  it('no-cost: principal split evenly, fee and its GST on the first instalment only', () => {
    const list = instalments(plan());
    expect(list).toHaveLength(6);
    expect(list[0].amount).toBe(10_000_00 + 199_00 + 35_82);
    expect(list[1].amount).toBe(10_000_00);
    expect(list.reduce((a, i) => a + i.principal, 0)).toBe(60_000_00);
  });

  it('with interest: 18% GST is added on each month’s interest', () => {
    const p = plan({ ratePa: 15, interestType: 'reducing', emi: calcEmi(60_000_00, 15, 6), processingFee: 0 });
    const [first] = instalments(p);
    expect(first.interest).toBe(75_000);
    expect(first.gst).toBe(13_500);
    expect(first.amount).toBe(p.emi + 13_500);
  });

  it('quotes the extra cost of a plan', () => {
    const q = emiQuote(60_000_00, 0, 6, 199_00);
    expect(q.monthly).toBe(10_000_00);
    expect(q.extra).toBe(199_00 + 35_82);
  });
});

describe('card ledger with an EMI', () => {
  const today = '2026-10-20';

  it('takes the converted purchase off its statement and bills one instalment per cycle', () => {
    const ledger = buildCardLedger(c, [phone], [], today, null, [plan()]);
    const aug = ledger.cycles.find((x) => x.statementDate === '2026-09-15')!;
    expect(aug.purchases).toBe(0);
    expect(aug.emi).toBe(10_000_00 + 199_00 + 35_82);
    expect(aug.emiLines[0]).toMatchObject({ n: 1, of: 6, name: 'Croma phone' });
    const oct = ledger.cycles.find((x) => x.statementDate === '2026-10-15')!;
    expect(oct.emi).toBe(10_000_00);
    // Instalment 3 (10 Nov) sits in the open cycle and counts in outstanding; 3 × ₹10,000 stay blocked.
    expect(ledger.current.emi).toBe(10_000_00);
    expect(ledger.emiPrincipalLeft).toBe(30_000_00);
    expect(ledger.utilisation).toBeCloseTo((ledger.outstanding + 30_000_00) / c.creditLimit!);
  });

  it('without the plan the purchase stays on its statement (existing data unchanged)', () => {
    const ledger = buildCardLedger(c, [phone], [], today, null);
    expect(ledger.cycles.find((x) => x.statementDate === '2026-09-15')!.purchases).toBe(60_000_00);
    expect(ledger.emiPrincipalLeft).toBe(0);
  });

  it('still counts the whole purchase as spending in the month it was bought', () => {
    expect(monthTotals([phone], '2026-08').expense).toBe(60_000_00);
  });

  it('a closed plan stops billing after it was closed', () => {
    const closed = plan({ closed: 1, updatedAt: '2026-09-30T10:00:00.000Z' });
    const ledger = buildCardLedger(c, [phone], [], today, null, [closed]);
    expect(ledger.cycles.find((x) => x.statementDate === '2026-10-15')?.emi ?? 0).toBe(0);
    expect(ledger.emiPrincipalLeft).toBe(0);
  });
});

describe('card EMI dues', () => {
  const input = { loans: [plan()], cards: [c], cardOverrides: [], billers: [], bills: [], policies: [], incomes: [], transactions: [phone] };

  it('never raises its own EMI reminder; the card bill carries it', () => {
    const dues = computeDues(input, '2026-09-20');
    expect(dues.some((d) => d.kind === 'emi')).toBe(false);
    const bill = dues.find((d) => d.kind === 'card')!;
    expect(bill.amount).toBe(10_000_00 + 199_00 + 35_82);
    expect(bill.subtitle).toContain('includes EMI');
  });

  it('counts instalments as paid once they are billed', () => {
    expect(loanEmisPaid(plan(), [], '2026-10-20')).toBe(2);
  });
});
