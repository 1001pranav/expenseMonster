import { lastPayment, predictCategory } from '../quickAdd';
import type { Transaction } from '../types';

let n = 0;
const txn = (p: Partial<Transaction>): Transaction =>
  ({
    id: `t${++n}`,
    type: 'expense',
    status: 'confirmed',
    deletedAt: null,
    categoryId: null,
    method: 'upi',
    cardId: null,
    accountId: null,
    occurredAt: '2026-11-01T09:00:00',
    ...p,
  }) as Transaction;

/** Local time, so the tests don't depend on the machine's time zone. */
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).toISOString();
const now = new Date(2026, 10, 5, 9, 15);

describe('predictCategory', () => {
  it('picks the category usually logged around this time', () => {
    const txns = [
      txn({ categoryId: 'coffee', occurredAt: at(1, 9) }),
      txn({ categoryId: 'coffee', occurredAt: at(2, 8, 40) }),
      txn({ categoryId: 'coffee', occurredAt: at(3, 10) }),
      txn({ categoryId: 'food', occurredAt: at(3, 13) }),
      txn({ categoryId: 'food', occurredAt: at(4, 20) }),
    ];
    expect(predictCategory(txns, 'expense', now)).toBe('coffee');
  });

  it('offers nothing without a clear majority or enough history', () => {
    const split = [
      txn({ categoryId: 'coffee', occurredAt: at(1, 9) }),
      txn({ categoryId: 'coffee', occurredAt: at(2, 9) }),
      txn({ categoryId: 'coffee', occurredAt: at(3, 9) }),
      txn({ categoryId: 'travel', occurredAt: at(1, 9, 5) }),
      txn({ categoryId: 'travel', occurredAt: at(2, 9, 5) }),
      txn({ categoryId: 'travel', occurredAt: at(3, 9, 5) }),
    ];
    expect(predictCategory(split, 'expense', now)).toBeNull();
    expect(predictCategory(split.slice(0, 2), 'expense', now)).toBeNull();
  });

  it('ignores other types, pending, deleted and old entries', () => {
    const txns = [
      txn({ categoryId: 'salary', type: 'income', occurredAt: at(1, 9) }),
      txn({ categoryId: 'coffee', status: 'pending', occurredAt: at(2, 9) }),
      txn({ categoryId: 'coffee', deletedAt: 'x', occurredAt: at(3, 9) }),
      txn({ categoryId: 'coffee', occurredAt: new Date(2026, 6, 1, 9).toISOString() }),
    ];
    expect(predictCategory(txns, 'expense', now)).toBeNull();
  });

  it('wraps round midnight', () => {
    const late = new Date(2026, 10, 5, 0, 10);
    const txns = [1, 2, 3].map((d) => txn({ categoryId: 'food', occurredAt: at(d, 23, 40) }));
    expect(predictCategory(txns, 'expense', late)).toBe('food');
  });
});

describe('lastPayment', () => {
  it('returns how the newest confirmed entry was paid', () => {
    const txns = [
      txn({ method: 'cash', occurredAt: at(1, 9) }),
      txn({ method: 'card', cardId: 'c1', occurredAt: at(3, 9) }),
      txn({ method: 'upi', status: 'pending', occurredAt: at(4, 9) }),
    ];
    expect(lastPayment(txns, 'expense')).toEqual({ method: 'card', cardId: 'c1', accountId: null });
    expect(lastPayment([], 'expense')).toBeNull();
  });
});
