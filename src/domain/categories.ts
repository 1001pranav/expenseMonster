import { parseSplits } from './transactions';
import type { Biller, Budget, Category, CategoryRule, RecurringIncome, Transaction } from './types';

/** How Quick Add and the forms order category chips (Settings: Categories). */
export type CategoryOrder = 'usage' | 'manual';

const live = (c: Category) => !c.deletedAt;

/** Top-level categories by their order, each followed by its sub-categories. */
export function categoryTree(cats: readonly Category[], kind: Category['kind']): Category[] {
  const mine = cats.filter((c) => live(c) && c.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const ids = new Set(mine.map((c) => c.id));
  // A sub-category whose parent is gone is shown as top-level rather than lost.
  const top = mine.filter((c) => !c.parentId || !ids.has(c.parentId));
  return top.flatMap((p) => [p, ...mine.filter((c) => c.parentId === p.id)]);
}

/**
 * Categories offered in pickers: hidden ones left out (unless it's the one already picked, so an
 * entry filed under a hidden category still shows it), ordered by use or by the user's order.
 */
export function pickerCategories(
  cats: readonly Category[],
  kind: Category['kind'],
  order: CategoryOrder,
  usage: ReadonlyMap<string, number>,
  include?: string | null,
): Category[] {
  const shown = categoryTree(cats, kind).filter((c) => !c.hidden || c.id === include);
  if (order === 'manual') return shown;
  // Stable: equal use keeps the user's order.
  return shown.map((c, i) => ({ c, i })).sort((a, b) => (usage.get(b.c.id) ?? 0) - (usage.get(a.c.id) ?? 0) || a.i - b.i).map((x) => x.c);
}

/**
 * Move a category one place up (-1) or down (+1) among its siblings (same kind and parent).
 * Returns the new sortOrder of every sibling whose order changed, renumbered in steps of 10.
 */
export function moveCategory(cats: readonly Category[], id: string, dir: -1 | 1): { id: string; sortOrder: number }[] {
  const me = cats.find((c) => c.id === id);
  if (!me) return [];
  const siblings = categoryTree(cats, me.kind).filter((c) => (c.parentId ?? null) === (me.parentId ?? null) || (!me.parentId && !cats.some((p) => p.id === c.parentId && live(p))));
  const i = siblings.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= siblings.length) return [];
  const next = [...siblings];
  [next[i], next[j]] = [next[j], next[i]];
  return next.map((c, k) => ({ id: c.id, sortOrder: (k + 1) * 10 })).filter((x) => cats.find((c) => c.id === x.id)?.sortOrder !== x.sortOrder);
}

export interface CategoryRefs {
  transactions: number;
  budgets: number;
  rules: number;
  incomes: number;
  billers: number;
  children: number;
}

/** What points at a category: deleting it would leave these filed under nothing. */
export function categoryRefs(
  id: string,
  t: { transactions: readonly Transaction[]; budgets: readonly Budget[]; rules: readonly CategoryRule[]; incomes: readonly RecurringIncome[]; billers: readonly Biller[]; categories: readonly Category[] },
): CategoryRefs {
  const count = <T extends { deletedAt: string | null }>(rows: readonly T[], hit: (r: T) => boolean) => rows.filter((r) => !r.deletedAt && hit(r)).length;
  return {
    transactions: count(t.transactions, (x) => x.categoryId === id || parseSplits(x.splits).some((s) => s.categoryId === id)),
    budgets: count(t.budgets, (x) => x.categoryId === id),
    rules: count(t.rules, (x) => x.categoryId === id),
    incomes: count(t.incomes, (x) => x.categoryId === id),
    billers: count(t.billers, (x) => x.categoryId === id),
    children: count(t.categories, (x) => x.parentId === id),
  };
}

export const isEmpty = (r: CategoryRefs) => Object.values(r).every((n) => n === 0);

/** A transaction's splits with one category replaced by another (null if nothing changed). */
export function resplit(json: string | null, from: string, to: string): string | null {
  const splits = parseSplits(json);
  if (!splits.some((s) => s.categoryId === from)) return null;
  // Two parts that end up in the same category become one.
  const merged = new Map<string, number>();
  for (const s of splits) {
    const k = s.categoryId === from ? to : s.categoryId;
    merged.set(k, (merged.get(k) ?? 0) + s.amount);
  }
  return JSON.stringify([...merged].map(([categoryId, amount]) => ({ categoryId, amount })));
}
