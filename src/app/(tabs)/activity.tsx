import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addDays, addMonths, formatDay, formatMonth, isoToYMD, monthKey, relativeDay } from '@/domain/dates';
import { restore } from '@/db/repo';
import { deleteTransaction } from '@/data/actions';
import { useCategoryMap, useTable, useToday } from '@/data/hooks';
import { Card, Chip, EmptyState, IconButton, Money, Row, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { TextField } from '@/ui/components/forms';
import { TxnRow, groupByDay } from '@/ui/components/rows';
import { Header, TAB_BAR_SPACE } from '@/ui/components/Screen';
import { SwipeRow } from '@/ui/components/SwipeRow';
import { radius, space, useTheme } from '@/ui/theme';

type Filter = 'month' | 'last30' | 'card' | 'upi' | 'income' | 'pending' | 'shared' | 'all';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'card', label: 'Card' },
  { key: 'upi', label: 'UPI' },
  { key: 'income', label: 'Income' },
  { key: 'pending', label: 'To review' },
  { key: 'shared', label: 'Household' },
  { key: 'all', label: 'All time' },
];

export default function Activity() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string; card?: string }>();
  const today = useToday();
  const txns = useTable('transactions');
  const cats = useCategoryMap();
  const cards = useTable('cards');
  const [filter, setFilter] = useState<Filter>(params.card ? 'all' : 'month');
  const [query, setQuery] = useState('');
  const [monthOffset, setMonthOffset] = useState(0);
  const shownMonth = monthKey(addMonths(today, -monthOffset));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const since30 = addDays(today, -30);
    return txns.filter((t) => {
      if (t.status === 'rejected') return false;
      if (params.category && t.categoryId !== params.category) return false;
      if (params.card && t.cardId !== params.card) return false;
      const d = isoToYMD(t.occurredAt);
      if (filter === 'month' && monthKey(d) !== shownMonth) return false;
      if (filter === 'last30' && d < since30) return false;
      if (filter === 'card' && t.method !== 'card') return false;
      if (filter === 'upi' && t.method !== 'upi') return false;
      if (filter === 'income' && t.type !== 'income') return false;
      if (filter === 'pending' && t.status !== 'pending') return false;
      if (filter === 'shared' && t.scope !== 'household') return false;
      if (q) {
        const hay = `${t.payee ?? ''} ${t.note ?? ''} ${t.vpa ?? ''} ${cats.get(t.categoryId ?? '')?.name ?? ''} ${(t.amount / 100).toFixed(0)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [txns, filter, query, today, cats, params.category, params.card, shownMonth]);

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

  const onDelete = async (id: string) => {
    await deleteTransaction(id);
    toast('Transaction deleted', { actionLabel: 'Undo', onAction: () => restore('transactions', id) });
  };

  const title = params.category ? (cats.get(params.category)?.name ?? 'Activity') : params.card ? (cards.find((c) => c.id === params.card)?.name ?? 'Activity') : 'Activity';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <Header title={title} large back={Boolean(params.category || params.card)} />
      <View style={{ paddingHorizontal: space(2), gap: space(1.25), paddingBottom: space(1) }}>
        <TextField value={query} onChangeText={setQuery} placeholder="Search payee, note, amount…" icon="search" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              selected={filter === f.key}
              onPress={() => {
                setFilter(f.key);
                setMonthOffset(0);
              }}
              compact
            />
          ))}
        </ScrollView>
        <Card padded={false} style={{ paddingVertical: space(1), paddingHorizontal: space(1.5), borderRadius: radius.md }}>
          <Row gap={1}>
            {filter === 'month' ? (
              <Row gap={0} style={{ marginLeft: -space(1) }}>
                <IconButton name="chevron-back" label="Previous month" size={18} onPress={() => setMonthOffset((o) => o + 1)} />
                <Txt variant="bodyStrong" style={{ minWidth: 72, textAlign: 'center' }}>
                  {monthOffset === 0 ? 'This month' : formatMonth(shownMonth)}
                </Txt>
                <IconButton name="chevron-forward" label="Next month" size={18} disabled={monthOffset === 0} onPress={() => setMonthOffset((o) => Math.max(0, o - 1))} />
              </Row>
            ) : (
              <Txt variant="small" tone="muted" style={{ flex: 1 }}>
                {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
              </Txt>
            )}
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Row gap={0.5}>
                <Txt variant="caption" tone="muted">
                  OUT
                </Txt>
                <Money value={totalOut} variant="bodyStrong" decimals="never" />
              </Row>
              <Row gap={0.5}>
                <Txt variant="caption" tone="muted">
                  IN
                </Txt>
                <Money value={totalIn} variant="small" tone="income" decimals="never" />
              </Row>
            </View>
          </Row>
        </Card>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        stickySectionHeadersEnabled
        initialNumToRender={20}
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + insets.bottom }}
        renderSectionHeader={({ section }) => (
          <Row style={{ justifyContent: 'space-between', paddingHorizontal: space(2), paddingVertical: 8, backgroundColor: colors.bg }}>
            <Txt variant="small" tone="muted">
              {relativeDay(section.title, today)} · {formatDay(section.title)}
            </Txt>
            {section.out ? <Money value={-section.out} variant="small" tone="muted" /> : null}
          </Row>
        )}
        renderItem={({ item }) => (
          <SwipeRow right={[{ label: 'Delete', icon: 'trash', color: colors.expense, onPress: () => onDelete(item.id) }]}>
            <TxnRow t={item} cat={cats.get(item.categoryId ?? '')} card={cards.find((c) => c.id === item.cardId)} />
          </SwipeRow>
        )}
        ListEmptyComponent={
          <EmptyState
            icon={query ? 'search' : 'receipt-outline'}
            title={query ? `No results for "${query.trim()}"` : 'Nothing here yet'}
            body={query ? 'Try a payee, category, note or amount.' : filter === 'month' ? `No entries in ${formatMonth(shownMonth)}.` : 'No transactions for this filter yet.'}
            action={query ? 'Clear search' : undefined}
            onAction={query ? () => setQuery('') : undefined}
          />
        }
      />
    </View>
  );
}
