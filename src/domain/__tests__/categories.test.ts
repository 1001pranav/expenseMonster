import { categoryRefs, categoryTree, isEmpty, moveCategory, pickerCategories, resplit } from '../categories';
import type { Category, Transaction } from '../types';

const cat = (id: string, sortOrder: number, p: Partial<Category> = {}): Category =>
  ({ id, name: id, icon: 'x', color: '#000', kind: 'expense', parentId: null, sortOrder, hidden: 0, deletedAt: null, ...p }) as Category;

const cats = [cat('food', 10), cat('fuel', 20), cat('swiggy', 5, { parentId: 'food' }), cat('travel', 30), cat('old', 40, { hidden: 1 }), cat('salary', 10, { kind: 'income' }), cat('gone', 50, { deletedAt: 'x' })];

describe('categoryTree', () => {
  it('orders top level by sortOrder with sub-categories under their parent', () => {
    expect(categoryTree(cats, 'expense').map((c) => c.id)).toEqual(['food', 'swiggy', 'fuel', 'travel', 'old']);
  });
});

describe('pickerCategories', () => {
  const usage = new Map([['travel', 9], ['fuel', 3]]);

  it('leaves out hidden ones and sorts by use, keeping your order for ties', () => {
    expect(pickerCategories(cats, 'expense', 'usage', usage).map((c) => c.id)).toEqual(['travel', 'fuel', 'food', 'swiggy']);
  });

  it('keeps your order when you chose it', () => {
    expect(pickerCategories(cats, 'expense', 'manual', usage).map((c) => c.id)).toEqual(['food', 'swiggy', 'fuel', 'travel']);
  });

  it("still shows a hidden category an entry is already filed under", () => {
    expect(pickerCategories(cats, 'expense', 'manual', usage, 'old').map((c) => c.id)).toContain('old');
  });
});

describe('moveCategory', () => {
  it('swaps with the sibling above and renumbers', () => {
    expect(moveCategory(cats, 'fuel', -1)).toEqual([
      { id: 'fuel', sortOrder: 10 },
      { id: 'food', sortOrder: 20 },
    ]);
  });

  it("moves a sub-category only among its parent's children, and not past the ends", () => {
    expect(moveCategory(cats, 'swiggy', -1)).toEqual([]);
    expect(moveCategory(cats, 'food', -1)).toEqual([]);
  });
});

describe('categoryRefs and resplit', () => {
  const t = (p: Partial<Transaction>) => ({ deletedAt: null, categoryId: null, splits: null, ...p }) as Transaction;

  it('counts entries filed under it, including in splits, and what else points at it', () => {
    const refs = categoryRefs('food', {
      transactions: [t({ categoryId: 'food' }), t({ splits: JSON.stringify([{ categoryId: 'food', amount: 5 }, { categoryId: 'fuel', amount: 5 }]) }), t({ categoryId: 'food', deletedAt: 'x' })],
      budgets: [],
      rules: [],
      incomes: [],
      billers: [],
      categories: cats,
    });
    expect(refs).toMatchObject({ transactions: 2, children: 1 });
    expect(isEmpty(refs)).toBe(false);
  });

  it('moves split parts and merges parts that land in the same category', () => {
    const json = JSON.stringify([{ categoryId: 'swiggy', amount: 300 }, { categoryId: 'food', amount: 200 }]);
    expect(JSON.parse(resplit(json, 'swiggy', 'food')!)).toEqual([{ categoryId: 'food', amount: 500 }]);
    expect(resplit(json, 'fuel', 'food')).toBeNull();
  });
});
