import { filterActivity, inPeriod, type ActivityFilter } from '../activityFilter';
import type { Category } from '../types';
import { at, base, txn } from './fixtures';

const cat = (id: string, parentId: string | null = null): Category => ({ ...base({ id }), name: id, icon: 'pricetag', color: '#000', kind: 'expense', parentId, sortOrder: 0 });
const categories = [cat('food'), cat('food-out', 'food'), cat('travel'), cat('salary')];
const T = '2026-10-29';

const list = [
  txn({ id: 'lunch', categoryId: 'food-out', occurredAt: at('2026-10-27'), payee: 'Cafe' }),
  txn({ id: 'veg', categoryId: 'food', occurredAt: at('2026-10-20'), method: 'card' }),
  txn({ id: 'cab', categoryId: 'travel', occurredAt: at('2026-10-27') }),
  txn({ id: 'mixed', categoryId: null, splits: JSON.stringify([{ categoryId: 'travel', amount: 50_00 }, { categoryId: 'food', amount: 50_00 }]), occurredAt: at('2026-09-30') }),
  txn({ id: 'pay', type: 'income', categoryId: 'salary', method: 'bank', occurredAt: at('2026-10-01') }),
  txn({ id: 'card-bill', type: 'transfer', linkType: 'card', occurredAt: at('2026-10-05') }),
  txn({ id: 'no', status: 'rejected', occurredAt: at('2026-10-27') }),
];
const run = (f: Partial<ActivityFilter>) =>
  filterActivity(list, { period: { kind: 'all' }, flow: 'all', kind: 'all', categoryIds: [], ...f }, categories, T)
    .map((t) => t.id)
    .sort();

describe('Spending filters', () => {
  it('one day, or a range in either order', () => {
    expect(run({ period: { kind: 'day', day: '2026-10-27' } })).toEqual(['cab', 'lunch']);
    expect(run({ period: { kind: 'range', from: '2026-09-30', to: '2026-10-05' } })).toEqual(['card-bill', 'mixed', 'pay']);
    expect(run({ period: { kind: 'range', from: '2026-10-05', to: '2026-09-30' } })).toEqual(['card-bill', 'mixed', 'pay']);
    expect(inPeriod('2026-09-29', { kind: 'last30' }, T)).toBe(true);
    expect(inPeriod('2026-09-28', { kind: 'last30' }, T)).toBe(false);
  });

  it('spending only or money in only; transfers only under everything', () => {
    expect(run({ flow: 'expense' })).toEqual(['cab', 'lunch', 'mixed', 'veg']);
    expect(run({ flow: 'income' })).toEqual(['pay']);
    expect(run({})).toContain('card-bill');
  });

  it('picked categories, with sub-categories and split entries', () => {
    expect(run({ categoryIds: ['food'] })).toEqual(['lunch', 'mixed', 'veg']);
    expect(run({ categoryIds: ['food-out'] })).toEqual(['lunch']);
    expect(run({ categoryIds: ['travel', 'salary'] })).toEqual(['cab', 'mixed', 'pay']);
  });

  it('combines with how it was paid and the search', () => {
    expect(run({ categoryIds: ['food'], kind: 'card' })).toEqual(['veg']);
    expect(run({ flow: 'expense', query: 'cafe' })).toEqual(['lunch']);
    expect(run({ period: { kind: 'month', month: '2026-10' }, flow: 'expense' })).toEqual(['cab', 'lunch', 'veg']);
  });
});
