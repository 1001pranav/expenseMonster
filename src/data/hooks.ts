import { useMemo } from 'react';
import { buildCardLedger } from '@/domain/creditCard';
import { todayYMD } from '@/domain/dates';
import { computeDues } from '@/domain/dues';
import type { Category, TableMap, TableName } from '@/domain/types';
import { useStore } from '@/db/store';

export const useTable = <K extends TableName>(name: K): TableMap[K][] => useStore((s) => s.tables[name] as TableMap[K][]);

/** Recomputed when the app comes back to the foreground on a new day (see root layout). */
export const useToday = () => {
  useStore((s) => s.version);
  return todayYMD();
};

export function useCategoryMap(): Map<string, Category> {
  const cats = useTable('categories');
  return useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
}

export function useSortedCategories(kind: Category['kind']) {
  const cats = useTable('categories');
  const txns = useTable('transactions');
  return useMemo(() => {
    // Most-used first: fewer scrolls on the quick-add screen.
    const usage = new Map<string, number>();
    for (const t of txns.slice(0, 400)) if (t.categoryId) usage.set(t.categoryId, (usage.get(t.categoryId) ?? 0) + 1);
    return cats.filter((c) => c.kind === kind).sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.sortOrder - b.sortOrder);
  }, [cats, txns, kind]);
}

export function useConfirmed() {
  const txns = useTable('transactions');
  return useMemo(() => txns.filter((t) => t.status === 'confirmed'), [txns]);
}

export function usePending() {
  const txns = useTable('transactions');
  const bills = useTable('bills');
  return useMemo(() => ({ transactions: txns.filter((t) => t.status === 'pending'), bills: bills.filter((b) => b.status === 'draft') }), [txns, bills]);
}

export function useDues(horizonDays = 45) {
  const tables = useStore((s) => s.tables);
  const today = useToday();
  return useMemo(
    () =>
      computeDues(
        {
          loans: tables.loans,
          cards: tables.cards,
          cardOverrides: tables.card_overrides,
          billers: tables.billers,
          bills: tables.bills,
          policies: tables.policies,
          incomes: tables.incomes,
          transactions: tables.transactions,
        },
        today,
        horizonDays,
      ),
    [tables, today, horizonDays],
  );
}

export function useCardLedger(cardId: string | undefined) {
  const cards = useTable('cards');
  const txns = useTable('transactions');
  const overrides = useTable('card_overrides');
  const today = useToday();
  return useMemo(() => {
    const card = cards.find((c) => c.id === cardId);
    return card ? { card, ledger: buildCardLedger(card, txns, overrides, today) } : null;
  }, [cards, txns, overrides, today, cardId]);
}

export const useMembers = () => useTable('members');
export const useSelfId = () => useStore((s) => s.identity.selfMemberId);
