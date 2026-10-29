import type { DueItem } from '../dues';
import type { Budget } from '../types';
import { HIDDEN, widgetSnapshot } from '../widgets';
import { at, base, txn } from './fixtures';

const due = (over: Partial<DueItem>): DueItem => ({
  key: over.title ?? 'd',
  kind: 'bill',
  title: 'Electricity',
  subtitle: '',
  amount: 1_200_00,
  date: '2026-10-31',
  state: 'upcoming' as DueItem['state'],
  href: '/dues',
  link: null,
  upiId: null,
  icon: 'flash',
  incoming: false,
  ...over,
});

const input = {
  transactions: [
    txn({ amount: 300_00, occurredAt: at('2026-10-29') }),
    txn({ amount: 151_00, occurredAt: at('2026-10-29') }),
    txn({ amount: 999_00, occurredAt: at('2026-10-29'), status: 'pending' }),
    txn({ amount: 2_000_00, occurredAt: at('2026-10-02') }),
    txn({ type: 'income', amount: 50_000_00, method: 'bank', occurredAt: at('2026-10-01') }),
    txn({ amount: 5_000_00, occurredAt: at('2026-09-29') }),
  ],
  budgets: [{ ...base(), categoryId: 'cat_food', month: '*', amount: 10_000_00 } as Budget],
  dues: [
    due({ title: 'Salary', incoming: true, date: '2026-10-30' }),
    due({ title: 'Electricity', date: '2026-10-31' }),
    due({ title: 'Card bill', amount: null, date: '2026-11-02' }),
    due({ title: 'Rent', date: '2026-11-05' }),
    due({ title: 'Phone', date: '2026-11-06' }),
  ],
  today: '2026-10-29',
  hideAmounts: false,
  scheme: 'expensemonster',
};

describe('home-screen widget snapshot', () => {
  it('has today, the month and the next three payments out', () => {
    const s = widgetSnapshot(input);
    expect(s).toMatchObject({ date: '2026-10-29', month: '2026-10', hidden: false, zero: '₹0' });
    // The pending ₹999 capture doesn't count.
    expect(s.today).toEqual({ spent: '₹451', payments: 2 });
    expect(s.monthly).toEqual({ spent: '₹2,451', income: '₹50,000', net: '₹47,549', overspent: false, hasIncome: true });
    expect(s.dues.map((d) => d.title)).toEqual(['Electricity', 'Card bill', 'Rent']);
    expect(s.dues[1]).toEqual({ title: 'Card bill', amount: null, date: '2026-11-02' });
  });

  it('masks every amount when amounts are hidden', () => {
    const s = widgetSnapshot({ ...input, hideAmounts: true });
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/₹\d/);
    expect(s.today.spent).toBe(HIDDEN);
    expect(s.dues[0].amount).toBe(HIDDEN);
  });

  it('shows no budget line without a budget, and flags an overspent month', () => {
    const s = widgetSnapshot({ ...input, budgets: [], transactions: [txn({ amount: 500_00, occurredAt: at('2026-10-03') }), txn({ type: 'income', amount: 100_00, method: 'bank', occurredAt: at('2026-10-03') })] });
    expect(s.budget).toBeNull();
    expect(s.monthly).toMatchObject({ net: '₹400', overspent: true });
    expect(s.today).toEqual({ spent: '₹0', payments: 0 });
  });
});
