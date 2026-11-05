import { cycleUsage } from '../budget';
import { clampPayday, cycleFor, cycleForMonth, cycleLabel, effectivePayday, shiftCycle, suggestPayday } from '../cycle';
import { rangeTotals } from '../transactions';
import type { Budget, RecurringIncome, Transaction } from '../types';

describe('cycleFor', () => {
  it('is the calendar month when payday is the 1st', () => {
    expect(cycleFor('2026-11-05', 1)).toEqual({ start: '2026-11-01', end: '2026-11-30', key: '2026-11', days: 30 });
    expect(cycleLabel(cycleFor('2026-11-05', 1))).toBe('Nov 2026');
  });

  it('runs payday to the day before next payday, named for the month it mostly covers', () => {
    const before = cycleFor('2026-11-05', 25);
    expect(before).toEqual({ start: '2026-10-25', end: '2026-11-24', key: '2026-11', days: 31 });
    expect(cycleFor('2026-11-25', 25).start).toBe('2026-11-25');
    expect(cycleFor('2026-11-24', 25).end).toBe('2026-11-24');
    expect(cycleLabel(before)).toBe('25 Oct – 24 Nov');
  });

  it('names an early-month payday period after its start month', () => {
    expect(cycleFor('2026-11-12', 7).key).toBe('2026-11');
  });

  it('crosses the year and shows the years', () => {
    const c = cycleFor('2027-01-03', 25);
    expect(c).toMatchObject({ start: '2026-12-25', end: '2027-01-24', key: '2027-01' });
    expect(cycleLabel(c)).toBe('25 Dec 2026 – 24 Jan 2027');
  });

  it('handles February', () => {
    expect(cycleFor('2027-02-10', 28)).toMatchObject({ start: '2027-01-28', end: '2027-02-27', days: 31 });
    expect(cycleFor('2027-03-01', 28)).toMatchObject({ start: '2027-02-28', end: '2027-03-27', days: 28 });
  });

  it('steps back and forward whole periods', () => {
    expect(shiftCycle('2026-11-05', 25, -1)).toMatchObject({ start: '2026-09-25', end: '2026-10-24' });
    expect(shiftCycle('2026-11-05', 25, 1)).toMatchObject({ start: '2026-11-25', end: '2026-12-24' });
  });

  it('keeps paydays to 1–28', () => {
    expect([clampPayday(0), clampPayday(31), clampPayday(15.4), clampPayday(NaN)]).toEqual([1, 28, 15, 1]);
  });
});

describe('spend over a payday period', () => {
  const t = (day: string, amount: number, categoryId = 'food'): Transaction =>
    ({ id: day + amount, type: 'expense', status: 'confirmed', deletedAt: null, categoryId, amount, splits: null, occurredAt: `${day}T12:00:00`, method: 'upi' }) as Transaction;
  const txns = [t('2026-10-24', 100), t('2026-10-25', 200), t('2026-11-24', 300), t('2026-11-25', 400)];
  const cycle = cycleFor('2026-11-05', 25);

  it('counts only days inside the period', () => {
    expect(rangeTotals(txns, cycle.start, cycle.end).expense).toBe(500);
  });

  it("measures the period against the budget for the month it's named after", () => {
    const budgets = [{ categoryId: 'food', month: '2026-11', amount: 1000, deletedAt: null }] as Budget[];
    expect(cycleUsage(budgets, txns, cycle)).toEqual([{ categoryId: 'food', limit: 1000, spent: 500, ratio: 0.5, level: 'ok' }]);
  });
});

describe('budget period setting', () => {
  it('uses the payday only in payday mode', () => {
    expect(effectivePayday('calendar', 25)).toBe(1);
    expect(effectivePayday(undefined, 25)).toBe(1);
    expect(effectivePayday('payday', 25)).toBe(25);
    expect(effectivePayday('payday', 31)).toBe(28);
  });

  it("finds the period a month's budgets are measured over", () => {
    expect(cycleForMonth('2026-11', 25)).toMatchObject({ start: '2026-10-25', end: '2026-11-24', key: '2026-11' });
    expect(cycleForMonth('2026-11', 7)).toMatchObject({ start: '2026-11-07', end: '2026-12-06', key: '2026-11' });
    expect(cycleForMonth('2026-11', 1)).toMatchObject({ start: '2026-11-01', end: '2026-11-30' });
  });

  it('suggests the day the biggest monthly income arrives', () => {
    const inc = (p: Partial<RecurringIncome>) => ({ active: 1, deletedAt: null, frequency: 'monthly', amount: 0, nextDate: '2026-11-01', name: 'x', ...p }) as RecurringIncome;
    expect(suggestPayday([inc({ name: 'Rent in', amount: 20_000_00, nextDate: '2026-11-05' }), inc({ name: 'Salary', amount: 85_000_00, nextDate: '2026-11-30' })])).toEqual({ day: 28, name: 'Salary' });
    expect(suggestPayday([inc({ amount: 1, nextDate: '2026-12-01' })])).toBeNull();
    expect(suggestPayday([inc({ amount: 1, nextDate: '2026-12-25', active: 0 })])).toBeNull();
    expect(suggestPayday([])).toBeNull();
  });
});
