import { categoryHistory, payeeKeys } from '../transactions';
import type { Transaction } from '../types';

let n = 0;
const txn = (p: Partial<Transaction>): Transaction =>
  ({
    id: `t${++n}`,
    type: 'expense',
    status: 'confirmed',
    deletedAt: null,
    payee: null,
    vpa: null,
    categoryId: null,
    occurredAt: `2026-09-${String(10 + n).padStart(2, '0')}T12:00:00.000Z`,
    ...p,
  }) as Transaction;

describe('payeeKeys', () => {
  it('matches the same merchant across spellings and its UPI ID', () => {
    const a = payeeKeys('MC DONALDS', null);
    const b = payeeKeys("McDonald's", null);
    const c = payeeKeys(null, 'mcdonalds.27312402@hdfcbank');
    expect(a.some((k) => b.includes(k))).toBe(true);
    expect(a.some((k) => c.includes(k))).toBe(true);
  });

  it('does not use a wallet prefix or a phone number as a name', () => {
    expect(payeeKeys(null, 'paytm.s1e8kds@pty')).toEqual(['v:paytm.s1e8kds@pty']);
    expect(payeeKeys(null, '9876543210@ybl')).toEqual(['v:9876543210@ybl']);
  });
});

describe('categoryHistory', () => {
  it('suggests the category used before, across name variants', () => {
    const txns = [txn({ payee: 'Mc Donalds', categoryId: 'cat_food' }), txn({ vpa: 'mcdonalds.27312402@hdfcbank', categoryId: 'cat_food' })];
    expect(categoryHistory("McDonald's", null, 'expense', txns)).toEqual([expect.objectContaining({ categoryId: 'cat_food', count: 2 })]);
  });

  it('offers both categories when the payee was filed two ways, most used first', () => {
    const txns = [
      txn({ payee: 'Amazon', categoryId: 'cat_shopping' }),
      txn({ payee: 'AMAZON', categoryId: 'cat_groceries' }),
      txn({ payee: 'Amazon', categoryId: 'cat_shopping' }),
    ];
    expect(categoryHistory('Amazon', null, 'expense', txns).map((c) => [c.categoryId, c.count])).toEqual([
      ['cat_shopping', 2],
      ['cat_groceries', 1],
    ]);
  });

  it('breaks a tie by the most recent choice', () => {
    const txns = [txn({ payee: 'Amazon', categoryId: 'cat_shopping' }), txn({ payee: 'Amazon', categoryId: 'cat_groceries' })];
    expect(categoryHistory('Amazon', null, 'expense', txns)[0].categoryId).toBe('cat_groceries');
  });

  it('ignores pending, rejected, deleted, other-type and the transaction itself', () => {
    const self = txn({ payee: 'Amazon', categoryId: 'cat_x', status: 'pending' });
    const txns = [
      self,
      txn({ payee: 'Amazon', categoryId: 'cat_x', status: 'rejected' }),
      txn({ payee: 'Amazon', categoryId: 'cat_x', deletedAt: '2026-09-01' }),
      txn({ payee: 'Amazon', categoryId: 'cat_salary', type: 'income' }),
      txn({ payee: 'Someone Else', categoryId: 'cat_x' }),
    ];
    expect(categoryHistory('Amazon', null, 'expense', txns, self.id)).toEqual([]);
  });
});
