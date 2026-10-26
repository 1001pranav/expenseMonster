import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addDays, addMonths, formatDay, formatMonth, isoToYMD, monthKey, relativeDay } from '@/domain/dates';
import { restore } from '@/db/repo';
import { deleteTransaction } from '@/data/actions';
import { useCategoryMap, useTable, useToday } from '@/data/hooks';
import { Button, Chip, EmptyState, IconButton, Money, Row, Txt, useMoneyText } from '@/ui/components/core';
import { Sheet, toast } from '@/ui/components/feedback';
import { TextField } from '@/ui/components/forms';
import { TxnRow, groupByDay } from '@/ui/components/rows';
import { Header, TAB_BAR_SPACE } from '@/ui/components/Screen';
import { SwipeRow } from '@/ui/components/SwipeRow';
import { fonts, space, useTheme } from '@/ui/theme';
import { Backdrop } from '@/ui/components/Aurora';

type Period = 'month' | 'last30' | 'all';
type Kind = 'all' | 'card' | 'upi' | 'income' | 'pending' | 'shared';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'One month' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
];
const KINDS: { key: Kind; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'card', label: 'Credit card' },
  { key: 'upi', label: 'UPI' },
  { key: 'income', label: 'Money in' },
  { key: 'pending', label: 'To check' },
  { key: 'shared', label: 'Shared with family' },
];

export default function Spending() {
  const { colors } = useTheme();
  const money = useMoneyText();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string; card?: string }>();
  const today = useToday();
  const txns = useTable('transactions');
  const cats = useCategoryMap();
  const cards = useTable('cards');
  const [period, setPeriod] = useState<Period>(params.card ? 'all' : 'month');
  const [kind, setKind] = useState<Kind>('all');
  const [filters, setFilters] = useState(false);
  const [query, setQuery] = useState('');
  const [monthOffset, setMonthOffset] = useState(0);
  const shownMonth = monthKey(addMonths(today, -monthOffset));
  const category = params.category ? cats.get(params.category) : undefined;
  const cardFilter = params.card ? cards.find((c) => c.id === params.card) : undefined;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const since30 = addDays(today, -30);
    return txns.filter((t) => {
      if (t.status === 'rejected') return false;
      if (params.category && t.categoryId !== params.category) return false;
      if (params.card && t.cardId !== params.card) return false;
      const d = isoToYMD(t.occurredAt);
      if (period === 'month' && monthKey(d) !== shownMonth) return false;
      if (period === 'last30' && d < since30) return false;
      if (kind === 'card' && t.method !== 'card') return false;
      if (kind === 'upi' && t.method !== 'upi') return false;
      if (kind === 'income' && t.type !== 'income') return false;
      if (kind === 'pending' && t.status !== 'pending') return false;
      if (kind === 'shared' && t.scope !== 'household') return false;
      if (q) {
        const hay = `${t.payee ?? ''} ${t.note ?? ''} ${t.vpa ?? ''} ${cats.get(t.categoryId ?? '')?.name ?? ''} ${(t.amount / 100).toFixed(0)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [txns, period, kind, query, today, cats, params.category, params.card, shownMonth]);

  const sections = useMemo(
    () =>
      groupByDay([...filtered].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))).map((g) => ({
        title: g.date,
        out: g.out,
        in: g.in,
        data: g.items,
      })),
    [filtered],
  );
  const totalOut = sections.reduce((a, s) => a + s.out, 0);
  const totalIn = sections.reduce((a, s) => a + s.in, 0);
  const activeFilters = (period !== 'month' ? 1 : 0) + (kind !== 'all' ? 1 : 0);
  const periodText = period === 'month' ? `in ${formatMonth(shownMonth)}` : period === 'last30' ? 'in the last 30 days' : 'in all';

  const onDelete = async (id: string) => {
    await deleteTransaction(id);
    toast('Entry deleted', { actionLabel: 'Undo', onAction: () => restore('transactions', id) });
  };
  const clearParam = () => router.setParams({ category: undefined, card: undefined });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <Backdrop />
      <Header title="Spending" large />
      <View style={{ paddingHorizontal: space(2), gap: space(1.5), paddingBottom: space(1) }}>
        <Row gap={1}>
          <View style={{ flex: 1 }}>
            <TextField value={query} onChangeText={setQuery} placeholder="Search payee, note or amount" icon="search" />
          </View>
          <Button title={activeFilters ? `Filter, ${activeFilters}` : 'Filter'} icon="options-outline" variant="secondary" onPress={() => setFilters(true)} style={{ height: 52 }} />
        </Row>
        {category || cardFilter || kind !== 'all' ? (
          <Row gap={1} wrap>
            {category ? <Chip compact icon="close" label={category.name} selected onPress={clearParam} /> : null}
            {cardFilter ? <Chip compact icon="close" label={cardFilter.name} selected onPress={clearParam} /> : null}
            {kind !== 'all' ? <Chip compact icon="close" label={KINDS.find((k) => k.key === kind)!.label} selected onPress={() => setKind('all')} /> : null}
          </Row>
        ) : null}
        <Row style={{ justifyContent: 'space-between' }}>
          {period === 'month' ? <IconButton name="chevron-back" label="Previous month" onPress={() => setMonthOffset((o) => o + 1)} /> : <View style={{ width: 44 }} />}
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Money value={totalOut} variant="h1" decimals="never" fit="narrow" />
            <Txt variant="small" tone="muted" style={{ textAlign: 'center' }}>
              spent {periodText}
              {totalIn ? `, ${money(totalIn, { decimals: 'never' })} came in` : ''}
            </Txt>
          </View>
          {period === 'month' ? <IconButton name="chevron-forward" label="Next month" disabled={monthOffset === 0} onPress={() => setMonthOffset((o) => Math.max(0, o - 1))} /> : <View style={{ width: 44 }} />}
        </Row>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        stickySectionHeadersEnabled={false}
        initialNumToRender={20}
        contentContainerStyle={{ paddingHorizontal: space(2), paddingBottom: TAB_BAR_SPACE + insets.bottom }}
        renderSectionHeader={({ section }) => (
          <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: space(2), paddingBottom: space(1) }}>
            <Txt variant="small" style={{ fontFamily: fonts.bold, color: colors.textMuted }}>
              {relativeDay(section.title, today)}, {formatDay(section.title)}
            </Txt>
            {section.out ? <Money value={section.out} variant="small" tone="muted" /> : null}
          </Row>
        )}
        renderItem={({ item, index, section }) => {
          const first = index === 0;
          const last = index === section.data.length - 1;
          return (
            <View
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderTopWidth: first ? 1 : 0,
                borderBottomWidth: last ? 1 : 0,
                borderTopLeftRadius: first ? 20 : 0,
                borderTopRightRadius: first ? 20 : 0,
                borderBottomLeftRadius: last ? 20 : 0,
                borderBottomRightRadius: last ? 20 : 0,
                overflow: 'hidden',
              }}
            >
              {first ? null : <View style={{ height: 1, backgroundColor: colors.surfaceAlt, marginLeft: space(8.5) }} />}
              <SwipeRow right={[{ label: 'Delete', icon: 'trash', color: colors.expenseText, onPress: () => onDelete(item.id) }]}>
                <TxnRow t={item} cat={cats.get(item.categoryId ?? '')} card={cards.find((c) => c.id === item.cardId)} />
              </SwipeRow>
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon={query ? 'search' : 'receipt-outline'}
            title={query ? `Nothing matches "${query.trim()}"` : 'Nothing here yet'}
            body={query ? 'Try a payee, category, note or amount.' : period === 'month' ? `No entries in ${formatMonth(shownMonth)}. Tap + to add one.` : 'No entries for this filter.'}
            action={query ? 'Clear search' : activeFilters ? 'Clear filters' : undefined}
            onAction={query ? () => setQuery('') : activeFilters ? () => (setPeriod('month'), setKind('all')) : undefined}
          />
        }
      />
      <Sheet visible={filters} onClose={() => setFilters(false)} title="Filter">
        <View style={{ gap: space(1) }}>
          <Txt variant="small" tone="muted">
            Time
          </Txt>
          <Row gap={1} wrap>
            {PERIODS.map((p) => (
              <Chip key={p.key} label={p.label} selected={period === p.key} onPress={() => (setPeriod(p.key), setMonthOffset(0))} />
            ))}
          </Row>
        </View>
        <View style={{ gap: space(1) }}>
          <Txt variant="small" tone="muted">
            Show
          </Txt>
          <Row gap={1} wrap>
            {KINDS.map((k) => (
              <Chip key={k.key} label={k.label} selected={kind === k.key} onPress={() => setKind(k.key)} />
            ))}
          </Row>
        </View>
        <Button title="Show results" onPress={() => setFilters(false)} />
      </Sheet>
    </View>
  );
}
