import { OVERALL_BUDGET, budgetLimit, committedDues, cycleUsage, safeToSpend } from '../budget';
import { cycleFor } from '../cycle';
import type { Budget, Transaction } from '../types';

describe('safeToSpend', () => {
  const base = { budget: 45_000_00, spentBeforeToday: 30_000_00, committed: 5_000_00, daysLeft: 10 };

  it('splits what is left after commitments over the days left, today included', () => {
    const s = safeToSpend({ ...base, spentToday: 0 });
    expect(s.allowance).toBe(1_000_00);
    expect(s.left).toBe(1_000_00);
    expect(s.state).toBe('ok');
  });

  it("doesn't move the allowance as today's spending grows", () => {
    expect(safeToSpend({ ...base, spentToday: 400_00 }).allowance).toBe(1_000_00);
    expect(safeToSpend({ ...base, spentToday: 400_00 }).left).toBe(600_00);
  });

  it('warns at 85% and flags going over, with tomorrow adjusted', () => {
    expect(safeToSpend({ ...base, spentToday: 850_00 }).state).toBe('close');
    const over = safeToSpend({ ...base, spentToday: 1_450_00 });
    expect(over.state).toBe('over');
    expect(over.left).toBe(-450_00);
    expect(over.tomorrow).toBe(950_00);
  });

  it('is over with nothing left when the month is already spent', () => {
    const s = safeToSpend({ ...base, spentBeforeToday: 44_000_00, spentToday: 0 });
    expect(s.allowance).toBe(0);
    expect(s.state).toBe('over');
  });

  it('has no tomorrow on the last day', () => {
    expect(safeToSpend({ ...base, daysLeft: 1, spentToday: 0 }).tomorrow).toBeNull();
  });
});

describe('committedDues', () => {
  it('counts outgoing non-card dues up to month end', () => {
    const dues = [
      { kind: 'emi', amount: 13_400_00, date: '2026-11-11', incoming: false },
      { kind: 'bill', amount: 1_860_00, date: '2026-11-03', incoming: false },
      { kind: 'card', amount: 12_300_00, date: '2026-11-20', incoming: false },
      { kind: 'income', amount: 85_000_00, date: '2026-11-30', incoming: true },
      { kind: 'enter_bill', amount: null, date: '2026-11-15', incoming: false },
      { kind: 'policy', amount: 9_000_00, date: '2026-12-02', incoming: false },
    ];
    expect(committedDues(dues, '2026-11-30')).toBe(15_260_00);
  });
});

describe('whole-month budget', () => {
  const t = (categoryId: string, amount: number) =>
    ({ id: categoryId + amount, type: 'expense', status: 'confirmed', deletedAt: null, categoryId, amount, splits: null, occurredAt: '2026-11-03T12:00:00', method: 'upi' }) as Transaction;
  const b = (categoryId: string, amount: number) => ({ categoryId, month: '*', amount, deletedAt: null }) as Budget;
  const cycle = cycleFor('2026-11-05', 1);
  const txns = [t('food', 300), t('fuel', 200)];

  it('is measured against all spending and wins over the categories sum', () => {
    const usage = cycleUsage([b(OVERALL_BUDGET, 1000), b('food', 400)], txns, cycle);
    expect(usage.find((u) => u.categoryId === OVERALL_BUDGET)?.spent).toBe(500);
    expect(budgetLimit(usage)).toBe(1000);
  });

  it('falls back to the sum of category budgets', () => {
    expect(budgetLimit(cycleUsage([b('food', 400), b('fuel', 300)], txns, cycle))).toBe(700);
  });
});
