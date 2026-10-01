import { budgetUsage } from '../budget';
import { findDuplicate } from '../dedupe';
import { computeDues, computeReminders } from '../dues';
import { memberBalances, simplifyDebts } from '../settle';
import { monthTotals, ruleKey, suggestCategory } from '../transactions';
import { at, base, bill, biller, card, txn } from './fixtures';

describe('dedupe', () => {
  const existing = [txn({ id: 'e1', amount: 250_00, occurredAt: '2026-09-12T10:00:00Z', sourceRef: '425612345678' })];
  it('matches on UPI ref', () => {
    expect(findDuplicate({ ...existing[0], occurredAt: '2026-09-13T10:00:00Z', sourceRef: 'UPI 425612345678' }, existing)?.kind).toBe('exact');
  });
  it('matches same amount within 10 minutes', () => {
    expect(findDuplicate({ ...existing[0], sourceRef: null, occurredAt: '2026-09-12T10:08:00Z' }, existing)?.kind).toBe('likely');
    expect(findDuplicate({ ...existing[0], sourceRef: null, occurredAt: '2026-09-12T10:20:00Z' }, existing)).toBeNull();
    expect(findDuplicate({ ...existing[0], sourceRef: null, amount: 251_00 }, existing)).toBeNull();
  });
});

describe('settle up', () => {
  it('computes balances and minimal transfers', () => {
    const t = [
      txn({ memberId: 'me', splitWith: JSON.stringify(['me', 'priya', 'amma']), amount: 3_000_00 }),
      txn({ memberId: 'priya', splitWith: JSON.stringify(['me', 'priya']), amount: 1_000_00 }),
      txn({ type: 'settlement', memberId: 'amma', toMemberId: 'me', amount: 500_00 }),
    ];
    const bal = memberBalances(t);
    expect(bal).toEqual({ me: 1_000_00, priya: -500_00, amma: -500_00 });
    expect(simplifyDebts(bal)).toEqual([
      { from: 'priya', to: 'me', amount: 500_00 },
      { from: 'amma', to: 'me', amount: 500_00 },
    ]);
  });
});

describe('totals', () => {
  it('excludes card bill payments and settlements, nets card refunds', () => {
    const t = [
      txn({ amount: 1_000_00, method: 'card', cardId: 'c', occurredAt: at('2026-09-05') }),
      txn({ amount: 500_00, occurredAt: at('2026-09-06') }),
      txn({ type: 'income', amount: 50_000_00, method: 'bank', occurredAt: at('2026-09-01') }),
      txn({ type: 'income', amount: 200_00, method: 'card', cardId: 'c', occurredAt: at('2026-09-07') }),
      txn({ type: 'transfer', linkType: 'card', cardId: 'c', amount: 1_000_00, occurredAt: at('2026-09-20') }),
      txn({ type: 'settlement', amount: 300_00, occurredAt: at('2026-09-20') }),
      txn({ amount: 999_00, status: 'pending', occurredAt: at('2026-09-20') }),
    ];
    expect(monthTotals(t, '2026-09')).toEqual({ income: 50_000_00, expense: 1_300_00, net: 48_700_00, cardSpend: 1_000_00 });
  });

  it('can total a month only up to a given day (for fair comparisons)', () => {
    const t = [txn({ amount: 100_00, occurredAt: at('2026-09-03') }), txn({ amount: 900_00, occurredAt: at('2026-09-25') })];
    expect(monthTotals(t, '2026-09', 10).expense).toBe(100_00);
    expect(monthTotals(t, '2026-09').expense).toBe(1_000_00);
  });

  it('learns categories from merchants', () => {
    expect(ruleKey('Swiggy', 'swiggy.stores@axb')).toBe('swiggy');
    expect(ruleKey(null, 'paytm-12345@paytm')).toBeNull();
    const rules = [{ ...base(), pattern: 'swiggy', categoryId: 'food' }, { ...base(), pattern: 'swiggy instamart', categoryId: 'groceries' }];
    expect(suggestCategory('SWIGGY INSTAMART', rules)).toBe('groceries');
    expect(suggestCategory('Swiggy order', rules)).toBe('food');
  });

  it('flags budgets at 80% and 100%', () => {
    const budgets = [{ ...base(), categoryId: 'food', month: '*', amount: 1_000_00 }, { ...base(), categoryId: 'fuel', month: '2026-09', amount: 1_000_00 }];
    const t = [txn({ categoryId: 'food', amount: 850_00, occurredAt: at('2026-09-02') }), txn({ categoryId: 'fuel', amount: 1_200_00, occurredAt: at('2026-09-02') })];
    const u = budgetUsage(budgets, t, '2026-09');
    expect(u.map((x) => [x.categoryId, x.level])).toEqual([
      ['fuel', 'over'],
      ['food', 'warn'],
    ]);
  });
});

describe('dues and reminders', () => {
  it('collects card, bill and policy dues and schedules reminders', () => {
    const c = card();
    const t = [txn({ cardId: c.id, method: 'card', amount: 5_000_00, occurredAt: at('2026-09-10') })];
    const dues = computeDues(
      {
        loans: [],
        cards: [c],
        cardOverrides: [],
        billers: [biller()],
        bills: [bill({ dueDate: '2026-09-25' })],
        policies: [{ ...base({ id: 'p1' }), type: 'health', insurer: 'Star Health', policyNo: null, name: 'Family floater', sumAssured: null, premium: 24_000_00, frequency: 'yearly', nextDueDate: '2026-10-15', endDate: null, coveredMemberIds: null, nominee: null, autopay: 0, active: 1 }],
        incomes: [],
        transactions: t,
      },
      '2026-09-20',
    );
    expect(dues.map((d) => d.kind)).toEqual(['bill', 'card', 'policy']);
    expect(dues[1]).toMatchObject({ amount: 5_000_00, date: '2026-10-05' });
    const reminders = computeReminders(dues, '2026-09-20', 8);
    expect(reminders.find((r) => r.id.startsWith('card:') && r.date === '2026-09-30')).toBeTruthy();
    expect(reminders.find((r) => r.id.startsWith('policy:') && r.date === '2026-10-08')).toBeTruthy();
    expect(reminders.every((r) => r.date >= '2026-09-20')).toBe(true);
  });
  it('shows one due per card even with several unpaid statements', () => {
    const c = card();
    const t = [
      txn({ cardId: c.id, method: 'card', amount: 1_000_00, occurredAt: at('2026-07-10') }),
      txn({ cardId: c.id, method: 'card', amount: 2_000_00, occurredAt: at('2026-08-10') }),
    ];
    const dues = computeDues({ loans: [], cards: [c], cardOverrides: [], billers: [], bills: [], policies: [], incomes: [], transactions: t }, '2026-09-20');
    expect(dues).toHaveLength(1);
    expect(dues[0]).toMatchObject({ amount: 3_000_00, date: '2026-08-05', state: 'overdue' });
    expect(dues[0].subtitle).toContain('2 statements unpaid');
  });
});
