import { buildCardLedger, cycleFor, dueDateFor, statementDateFor } from '../creditCard';
import { at, card, txn } from './fixtures';

describe('credit card cycle', () => {
  it('puts purchases on/before the statement day in this cycle, after it in the next', () => {
    expect(statementDateFor('2026-09-15', 15)).toBe('2026-09-15');
    expect(statementDateFor('2026-09-14', 15)).toBe('2026-09-15');
    expect(statementDateFor('2026-09-16', 15)).toBe('2026-10-15');
    expect(statementDateFor('2026-12-20', 15)).toBe('2027-01-15');
  });

  it('clamps statement day 31 in February', () => {
    expect(statementDateFor('2026-02-10', 31)).toBe('2026-02-28');
    expect(statementDateFor('2026-03-01', 31)).toBe('2026-03-31');
    const c = cycleFor('2026-03-10', { statementDay: 31, dueDay: 20 });
    expect(c.start).toBe('2026-03-01');
    expect(c.statementDate).toBe('2026-03-31');
    expect(c.dueDate).toBe('2026-04-20');
  });

  it('due date is the next due day after the statement', () => {
    expect(dueDateFor('2026-09-15', 5)).toBe('2026-10-05');
    expect(dueDateFor('2026-09-01', 20)).toBe('2026-09-20');
  });

  it('builds statements, applies refunds and payments without double counting', () => {
    const c = card();
    const txns = [
      txn({ cardId: c.id, method: 'card', amount: 5_000_00, occurredAt: at('2026-08-20') }),
      txn({ cardId: c.id, method: 'card', amount: 3_000_00, occurredAt: at('2026-09-15') }),
      txn({ cardId: c.id, method: 'card', type: 'income', amount: 1_000_00, occurredAt: at('2026-09-01') }), // refund
      txn({ cardId: c.id, method: 'card', amount: 2_000_00, occurredAt: at('2026-09-16') }), // next cycle
      txn({ cardId: c.id, type: 'transfer', linkType: 'card', method: 'bank', amount: 4_000_00, occurredAt: at('2026-09-25') }),
    ];
    const ledger = buildCardLedger(c, txns, [], '2026-09-28');
    const sep = ledger.cycles.find((x) => x.statementDate === '2026-09-15')!;
    expect(sep.purchases).toBe(8_000_00);
    expect(sep.refunds).toBe(1_000_00);
    expect(sep.total).toBe(7_000_00);
    expect(sep.dueDate).toBe('2026-10-05');
    expect(sep.paid).toBe(4_000_00);
    expect(sep.remaining).toBe(3_000_00);
    expect(sep.status).toBe('partly_paid');
    expect(ledger.current.statementDate).toBe('2026-10-15');
    expect(ledger.current.total).toBe(2_000_00);
    expect(ledger.outstanding).toBe(5_000_00);
    expect(ledger.utilisation).toBeCloseTo(0.05);
  });

  it('treats statements already due before the card was added as paid', () => {
    const c = card({ createdAt: '2026-09-20T10:00:00.000Z' });
    const txns = [
      txn({ cardId: c.id, method: 'card', amount: 2_000_00, occurredAt: at('2026-08-01') }),
      txn({ cardId: c.id, method: 'card', amount: 1_000_00, occurredAt: at('2026-09-01') }),
      txn({ cardId: c.id, method: 'card', amount: 500_00, occurredAt: at('2026-09-21') }),
    ];
    const ledger = buildCardLedger(c, txns, [], '2026-10-20');
    expect(ledger.cycles.find((x) => x.statementDate === '2026-08-15')!.status).toBe('paid');
    // Generated before the card was added but due after: still payable.
    expect(ledger.cycles.find((x) => x.statementDate === '2026-09-15')!.status).toBe('overdue');
    const oct = ledger.cycles.find((x) => x.statementDate === '2026-10-15')!;
    expect(oct.status).toBe('due');
    expect(ledger.outstanding).toBe(1_500_00);
  });

  it('uses the bank statement amount when overridden and flags overdue', () => {
    const c = card();
    const txns = [txn({ cardId: c.id, method: 'card', amount: 1_000_00, occurredAt: at('2026-09-01') })];
    const ledger = buildCardLedger(
      c,
      txns,
      [{ ...txns[0], id: 'o1', cardId: c.id, statementDate: '2026-09-15', total: 1_050_00, minDue: 200_00 }],
      '2026-10-07',
    );
    const sep = ledger.cycles.find((x) => x.statementDate === '2026-09-15')!;
    expect(sep.total).toBe(1_050_00);
    expect(sep.overridden).toBe(true);
    expect(sep.status).toBe('overdue');
  });
});
