import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { filterActivity, type Flow, type Kind, type Period } from '@/domain/activityFilter';
import { pickedRange, type DatePick } from '@/domain/datePick';
import { addDays, addMonths, diffDays, formatDay, formatMonth, monthKey, type YMD } from '@/domain/dates';
import { deleteTransaction, restoreTransaction } from '@/data/actions';
import { useCategoryMap, useTable, useToday } from '@/data/hooks';
import { Button, Chip, EmptyState, IconButton, Row, Txt, useMoneyText } from '@/ui/components/core';
import { Sheet, toast } from '@/ui/components/feedback';
import { Segmented, TextField } from '@/ui/components/forms';
import { RangeCalendar } from '@/ui/components/RangeCalendar';
import { TxnRow, groupByDay } from '@/ui/components/rows';
import { TAB_BAR_SPACE } from '@/ui/components/Screen';
import { SwipeRow } from '@/ui/components/SwipeRow';
import { useSmsRefresh } from '@/ui/hooks/useSmsRefresh';
import { fonts, space, useTheme } from '@/ui/theme';

/** "pick": a day or a range picked on one calendar (domain/datePick.ts). */
type PeriodKind = 'month' | 'pick' | 'last30' | 'all';
const PERIODS: { key: PeriodKind; label: string }[] = [
  { key: 'month', label: 'One month' },
  { key: 'pick', label: 'Pick dates' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
];
/** Categories shown before "Show all": the most used, plus any already picked. */
const FEW_CATEGORIES = 12;
const FLOWS: { value: Flow; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'expense', label: 'Spending' },
  { value: 'income', label: 'Money in' },
];
const KINDS: { key: Kind; label: string }[] = [
  { key: 'all', label: 'Any' },
  { key: 'card', label: 'Credit card' },
  { key: 'upi', label: 'UPI' },
  { key: 'pending', label: 'To check' },
  { key: 'shared', label: 'Shared with family' },
];

function toPeriod(kind: PeriodKind, month: string, from: YMD, to: YMD): Period {
  if (kind === 'month') return { kind, month };
  // The same date tapped twice (or only once so far) is one day; two dates are a range.
  if (kind === 'pick') return from === to ? { kind: 'day', day: from } : { kind: 'range', from, to };
  return { kind };
}

export default function Activity() {
  const { colors } = useTheme();
  const money = useMoneyText();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string; card?: string; day?: string }>();
  const today = useToday();
  const txns = useTable('transactions');
  const cats = useCategoryMap();
  const allCategories = useTable('categories');
  const cards = useTable('cards');
  const [periodKind, setPeriodKind] = useState<PeriodKind>(params.card ? 'all' : 'month');
  const [flow, setFlow] = useState<Flow>('all');
  const [kind, setKind] = useState<Kind>('all');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [filters, setFilters] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const sms = useSmsRefresh();
  const [monthOffset, setMonthOffset] = useState(0);
  const [pick, setPick] = useState<DatePick>({ start: today, end: today });
  const [allCats, setAllCats] = useState(false);
  const { from, to } = pickedRange(pick);
  const single = from === to;
  const shownMonth = monthKey(addMonths(today, -monthOffset));

  // Opened from Insights (a category) or Home's "Spent today" (a day): apply it, then drop the link's
  // parameter so it becomes an ordinary filter. The tab stays mounted, so this runs on every visit.
  useFocusEffect(
    useCallback(() => {
      if (!params.category && !params.day) return;
      if (params.category) {
        setCategoryIds([params.category]);
        setPeriodKind('month');
        setMonthOffset(0);
      }
      if (params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day)) {
        setPick({ start: params.day, end: params.day });
        setPeriodKind('pick');
      }
      router.setParams({ category: undefined, day: undefined });
    }, [params.category, params.day]),
  );
  const cardFilter = params.card ? cards.find((c) => c.id === params.card) : undefined;
  const filtered = useMemo(
    () => filterActivity(txns, { period: toPeriod(periodKind, shownMonth, from, to), flow, kind, categoryIds, cardId: params.card, query }, allCategories, today),
    [txns, periodKind, shownMonth, from, to, flow, kind, categoryIds, params.card, query, allCategories, today],
  );
  // Categories offered in the filter: the kind being shown, top-level first with their sub-categories after.
  const pickable = useMemo(() => {
    const kinds = flow === 'all' ? ['expense', 'income'] : [flow];
    const live = allCategories.filter((c) => kinds.includes(c.kind)).sort((a, b) => a.sortOrder - b.sortOrder);
    return live.filter((c) => !c.parentId).flatMap((p) => [p, ...live.filter((c) => c.parentId === p.id)]);
  }, [allCategories, flow]);
  // Until "Show all": the most used ones plus any already picked (so none hides), in their usual
  // order so chips don't jump around while tapping.
  const fewCategories = useMemo(() => {
    const uses = new Map<string, number>();
    for (const t of txns) if (t.categoryId) uses.set(t.categoryId, (uses.get(t.categoryId) ?? 0) + 1);
    const top = [...pickable].sort((x, y) => (uses.get(y.id) ?? 0) - (uses.get(x.id) ?? 0)).slice(0, FEW_CATEGORIES);
    return pickable.filter((c) => top.includes(c) || categoryIds.includes(c.id));
  }, [pickable, txns, categoryIds]);
  const shownCategories = allCats ? pickable : fewCategories;
  const toggleCategory = (id: string) => setCategoryIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

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
  const activeFilters = (periodKind !== 'month' ? 1 : 0) + (flow !== 'all' ? 1 : 0) + (kind !== 'all' ? 1 : 0) + categoryIds.length;
  const periodText =
    periodKind === 'month'
      ? `in ${formatMonth(shownMonth)}`
      : periodKind === 'pick' && single
        ? `on ${formatDay(from, { year: from.slice(0, 4) !== today.slice(0, 4) })}`
        : periodKind === 'pick'
          ? `from ${formatDay(from, { year: from.slice(0, 4) !== to.slice(0, 4) })} to ${formatDay(to, { year: to.slice(0, 4) !== today.slice(0, 4) })}`
          : periodKind === 'last30'
            ? 'in the last 30 days'
            : 'in all';
  const clearFilters = () => {
    setPeriodKind('month');
    setMonthOffset(0);
    setFlow('all');
    setKind('all');
    setCategoryIds([]);
  };
  // The arrows step through months, or day by day while one day is picked (never past today).
  const byDay = periodKind === 'pick' && single;
  const step = periodKind === 'month' || byDay;
  const moveDay = (n: number) => {
    const d = addDays(from, n);
    if (d <= today) setPick({ start: d, end: d });
  };
  const back = () => (periodKind === 'month' ? setMonthOffset((o) => o + 1) : moveDay(-1));
  const forward = () => (periodKind === 'month' ? setMonthOffset((o) => Math.max(0, o - 1)) : moveDay(1));
  const atLatest = periodKind === 'month' ? monthOffset === 0 : from >= today;

  const onDelete = async (id: string) => {
    await deleteTransaction(id);
    toast('Entry deleted', { actionLabel: 'Undo', onAction: () => restoreTransaction(id) });
  };
  const clearCard = () => router.setParams({ card: undefined });

  const periodLabel =
    periodKind === 'month'
      ? formatMonth(shownMonth)
      : periodKind === 'pick'
        ? single
          ? formatDay(from)
          : `${formatDay(from)} – ${formatDay(to)}`
        : PERIODS.find((p) => p.key === periodKind)!.label;
  const catLabel = categoryIds.length === 1 ? (cats.get(categoryIds[0])?.name ?? 'Category') : categoryIds.length ? `${categoryIds.length} categories` : 'Category';
  const dayLabel = (d: YMD) => {
    const n = diffDays(d, today);
    const day = formatDay(d, { year: d.slice(0, 4) !== today.slice(0, 4) });
    return (n === 0 ? `Today · ${day}` : n === -1 ? `Yesterday · ${day}` : day).toUpperCase();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <Row style={{ paddingHorizontal: space(2), paddingTop: space(1), minHeight: 52 }}>
        {searching ? (
          <>
            <View style={{ flex: 1 }}>
              <TextField value={query} onChangeText={setQuery} placeholder="Payee, note, category or amount" icon="search" autoFocus />
            </View>
            <Button
              title="Cancel"
              variant="ghost"
              size="sm"
              onPress={() => {
                setQuery('');
                setSearching(false);
              }}
            />
          </>
        ) : (
          <>
            <Txt variant="h1" style={{ flex: 1 }}>
              Activity
            </Txt>
            <IconButton name="search" label="Search" onPress={() => setSearching(true)} />
          </>
        )}
      </Row>

      {/* Each chip shows what's filtered and opens the filter sheet; the card chip clears itself. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space(1), paddingHorizontal: space(2), paddingVertical: space(1) }}>
        {cardFilter ? <Chip compact icon="close" label={cardFilter.name} selected onPress={clearCard} /> : null}
        <Chip compact icon="chevron-down" label={periodLabel} selected={periodKind !== 'month' || monthOffset > 0} onPress={() => setFilters(true)} />
        <Chip compact icon="chevron-down" label={flow === 'all' ? 'All types' : FLOWS.find((x) => x.value === flow)!.label} selected={flow !== 'all'} onPress={() => setFilters(true)} />
        <Chip compact icon="chevron-down" label={catLabel} selected={categoryIds.length > 0} onPress={() => setFilters(true)} />
        <Chip compact icon="chevron-down" label={kind === 'all' ? 'Paid by' : KINDS.find((k) => k.key === kind)!.label} selected={kind !== 'all'} onPress={() => setFilters(true)} />
        {activeFilters ? <Chip compact icon="close" label="Clear" onPress={clearFilters} /> : null}
      </ScrollView>

      <Row style={{ paddingHorizontal: space(1), paddingBottom: space(0.5) }}>
        {step ? <IconButton name="chevron-back" label={byDay ? 'Previous day' : 'Previous month'} onPress={back} /> : <View style={{ width: 44 }} />}
        <Txt variant="small" tone="muted" style={{ flex: 1, textAlign: 'center', fontVariant: ['tabular-nums'] }} numberOfLines={1}>
          {flow !== 'income' ? (
            <>
              Out <Txt variant="small" style={{ fontWeight: fonts.semibold }}>{money(totalOut, { decimals: 'never' })}</Txt>
            </>
          ) : null}
          {flow === 'all' ? ' · ' : null}
          {flow !== 'expense' ? (
            <>
              In <Txt variant="small" tone="income" style={{ fontWeight: fonts.semibold }}>{`+${money(totalIn, { decimals: 'never' })}`}</Txt>
            </>
          ) : null}
          {` ${periodText}`}
        </Txt>
        {step ? <IconButton name="chevron-forward" label={byDay ? 'Next day' : 'Next month'} disabled={atLatest} onPress={forward} /> : <View style={{ width: 44 }} />}
      </Row>

      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        stickySectionHeadersEnabled
        refreshControl={sms.onRefresh ? <RefreshControl refreshing={sms.refreshing} onRefresh={sms.onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
        initialNumToRender={20}
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + insets.bottom }}
        renderSectionHeader={({ section }) => (
          <Row style={{ justifyContent: 'space-between', paddingHorizontal: space(2), paddingTop: space(2), paddingBottom: space(0.75), backgroundColor: colors.bg }}>
            <Txt variant="caption" tone="faint" style={{ fontWeight: fonts.semibold, letterSpacing: 0.5 }}>
              {dayLabel(section.title)}
            </Txt>
            {flow === 'income' ? (
              section.in ? <Txt variant="caption" tone="income" style={{ fontWeight: fonts.semibold, fontVariant: ['tabular-nums'] }}>{`+${money(section.in, { decimals: 'auto' })}`}</Txt> : null
            ) : section.out ? (
              <Txt variant="caption" tone="faint" style={{ fontWeight: fonts.semibold, fontVariant: ['tabular-nums'] }}>{money(section.out, { decimals: 'auto' })}</Txt>
            ) : null}
          </Row>
        )}
        renderItem={({ item, index }) => (
          <View>
            {/* Hairline inset to the text, not a card per day. */}
            {index ? <View style={{ height: 1, backgroundColor: colors.border, marginLeft: space(2) + 40 + space(1.5) }} /> : null}
            <SwipeRow right={[{ label: 'Delete', icon: 'trash', color: colors.expenseText, onPress: () => onDelete(item.id) }]}>
              <View style={{ backgroundColor: colors.bg }}>
                <TxnRow t={item} cat={cats.get(item.categoryId ?? '')} card={cards.find((c) => c.id === item.cardId)} />
              </View>
            </SwipeRow>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            icon={query ? 'search' : 'receipt-outline'}
            title={query ? `Nothing matches "${query.trim()}"` : 'Nothing here yet'}
            body={query ? 'Try a payee, category, note or amount.' : activeFilters ? `No entries ${periodText} for this filter.` : `Nothing logged in ${formatMonth(shownMonth)} yet.`}
            action={query ? 'Clear search' : activeFilters ? 'Clear filters' : 'Log an expense'}
            onAction={query ? () => setQuery('') : activeFilters ? clearFilters : () => router.push('/quick-add')}
          />
        }
      />
      <Sheet
        visible={filters}
        onClose={() => setFilters(false)}
        title="Filter"
        footer={
          // Pinned under the scrolling filters, so it's always in reach however many are open.
          <Row gap={1}>
            {activeFilters ? <Button title="Clear all" variant="secondary" onPress={clearFilters} style={{ flex: 1 }} /> : null}
            <Button title={`Show ${filtered.length === 1 ? '1 entry' : `${filtered.length} entries`}`} onPress={() => setFilters(false)} style={{ flex: 1.5 }} />
          </Row>
        }
      >
        <View style={{ gap: space(1) }}>
          <Txt variant="small" tone="muted">
            Time
          </Txt>
          <Row gap={1} wrap>
            {PERIODS.map((p) => (
              <Chip key={p.key} label={p.label} selected={periodKind === p.key} onPress={() => (setPeriodKind(p.key), setMonthOffset(0))} />
            ))}
          </Row>
          {periodKind === 'pick' ? <RangeCalendar value={pick} onChange={setPick} max={today} /> : null}
        </View>
        <View style={{ gap: space(1) }}>
          <Txt variant="small" tone="muted">
            Show
          </Txt>
          <Segmented
            value={flow}
            onChange={(v) => {
              setFlow(v);
              // A spending category can't match money in (and the other way round): drop those picks.
              if (v !== 'all') setCategoryIds((ids) => ids.filter((id) => cats.get(id)?.kind === v));
            }}
            options={FLOWS}
          />
        </View>
        <View style={{ gap: space(1) }}>
          <Txt variant="small" tone="muted">
            Paid by
          </Txt>
          <Row gap={1} wrap>
            {KINDS.map((k) => (
              <Chip key={k.key} label={k.label} selected={kind === k.key} onPress={() => setKind(k.key)} />
            ))}
          </Row>
        </View>
        <View style={{ gap: space(1) }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="small" tone="muted">
              Categories{categoryIds.length ? `, ${categoryIds.length} picked` : ''}
            </Txt>
            {categoryIds.length ? <Button title="Clear" variant="ghost" size="sm" onPress={() => setCategoryIds([])} /> : null}
          </Row>
          <Row gap={1} wrap>
            {shownCategories.map((c) => (
              <Chip key={c.id} compact label={c.parentId ? `· ${c.name}` : c.name} selected={categoryIds.includes(c.id)} onPress={() => toggleCategory(c.id)} />
            ))}
          </Row>
          {pickable.length > fewCategories.length ? (
            <Button
              title={allCats ? 'Show fewer' : `Show all categories (${pickable.length})`}
              icon={allCats ? 'chevron-up' : 'chevron-down'}
              variant="ghost"
              size="sm"
              onPress={() => setAllCats((v) => !v)}
              style={{ alignSelf: 'flex-start' }}
            />
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}
