import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { spendByCategory } from '@/domain/budget';
import { buildCardLedger } from '@/domain/creditCard';
import { addMonths, daysInMonth, formatDay, formatMonth, fromParts, isoToYMD, monthKey, parts, shortMonth } from '@/domain/dates';
import { loanEmisPaid } from '@/domain/dues';
import { scheduleFor } from '@/domain/emi';
import type { Paise } from '@/domain/money';
import { financialHealth } from '@/domain/health';
import { comparableChange, monthTotals, monthlySeries } from '@/domain/transactions';
import { useCategoryMap, useConfirmed, useTable, useToday } from '@/data/hooks';
import { Bars, HeatCalendar, LineChart, RankedBars, type Slice } from '@/ui/components/charts';
import { Card, IconButton, Money, Row, Section, Txt, useMoneyText } from '@/ui/components/core';
import { Segmented } from '@/ui/components/forms';
import { TaxBody } from '../tax';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

type Range = 'month' | 'quarter' | 'year';

export default function Insights() {
  const { colors } = useTheme();
  const money = useMoneyText();
  const today = useToday();
  const txns = useConfirmed();
  const cats = useCategoryMap();
  const budgets = useTable('budgets');
  const cards = useTable('cards');
  const overrides = useTable('card_overrides');
  const loans = useTable('loans');
  const allTxns = useTable('transactions');
  const health = useMemo(() => financialHealth({ transactions: allTxns, loans, cards, cardOverrides: overrides, budgets }, today, money), [allTxns, loans, cards, overrides, budgets, today, money]);
  const [range, setRange] = useState<Range>('month');
  const [month, setMonth] = useState(monthKey(today));
  const [view, setView] = useState<'overview' | 'tax'>('overview');

  const months = range === 'month' ? 1 : range === 'quarter' ? 3 : 12;
  const monthList = Array.from({ length: months }, (_, i) => monthKey(addMonths(`${month}-01`, -i)));

  const fallbackColor = colors.textFaint;
  const slices: Slice[] = useMemo(() => {
    const total = new Map<string, Paise>();
    for (let i = 0; i < months; i++) {
      const m = monthKey(addMonths(`${month}-01`, -i));
      for (const [k, v] of spendByCategory(txns, m)) total.set(k, (total.get(k) ?? 0) + v);
    }
    return [...total.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, value]) => ({ key: id, label: cats.get(id)?.name ?? 'Uncategorised', value, color: cats.get(id)?.color ?? fallbackColor }));
  }, [txns, month, months, cats, fallbackColor]);

  // Month on month always ends at the current month, so tapping a row doesn't shift the list.
  const currentMonth = monthKey(today);
  const todayDay = Number(today.slice(8));
  const [allMonths, setAllMonths] = useState(false);
  const mom = useMemo(() => {
    const s = monthlySeries(txns, currentMonth, 12);
    // Skip the empty months before the first entry instead of drawing blank bars.
    const first = s.findIndex((x) => x.income || x.expense);
    if (first < 0) return [];
    return s
      .map((x, i) => {
        const prev = s[i - 1];
        // The month in progress is compared with the same days of the month before.
        const prevSpend = !prev ? 0 : x.month === currentMonth ? monthTotals(txns, prev.month, todayDay).expense : prev.expense;
        return { ...x, change: comparableChange(x.expense, prevSpend) };
      })
      .slice(first);
  }, [txns, currentMonth, todayDay]);
  const momRows = [...mom].reverse();
  // A month in progress is compared with the same days of the previous month.
  const inProgress = month === currentMonth;
  const uptoDay = inProgress ? todayDay : 31;
  const prevMonth = monthKey(addMonths(`${month}-01`, -1));
  const sameDays = inProgress ? ` (${uptoDay === 1 ? '' : '1–'}${uptoDay} ${shortMonth(prevMonth)})` : '';
  const changeText = (ch: number) => (Math.abs(ch) < 0.005 ? 'same as' : `${ch > 0 ? 'up' : 'down'} ${Math.abs(Math.round(ch * 100))}% vs`);

  const heat = useMemo(() => {
    const { y, m } = parts(`${month}-01`);
    const days = Array.from({ length: daysInMonth(y, m) }, (_, i) => ({ date: fromParts(y, m, i + 1), amount: 0 }));
    for (const t of txns) {
      if (t.type !== 'expense') continue;
      const d = isoToYMD(t.occurredAt);
      if (monthKey(d) === month) days[Number(d.slice(8)) - 1].amount += t.amount;
    }
    return days;
  }, [txns, month]);

  const cardSpend = useMemo(
    () =>
      cards.map((c) => {
        const l = buildCardLedger(c, allTxns, overrides, today, undefined, loans);
        return { card: c, spend: l.cycles.slice(-months).reduce((a, x) => a + x.purchases - x.refunds, 0) };
      }),
    [cards, allTxns, overrides, loans, today, months],
  );

  const debt = useMemo(() => {
    const borrowed = loans.filter((l) => l.direction === 'borrowed' && !l.closed);
    if (!borrowed.length) return null;
    const points: number[] = [];
    const labels: string[] = [];
    for (let i = 0; i <= 60; i += 6) {
      const at = addMonths(today, i);
      let total = 0;
      for (const l of borrowed) {
        const s = scheduleFor(l);
        const paid = loanEmisPaid(l, allTxns, today);
        const idx = Math.max(paid, s.filter((r) => r.date <= at).length) - 1;
        total += idx < 0 ? l.principal : (s[idx]?.balance ?? 0);
      }
      points.push(total);
      labels.push(i === 0 ? 'Now' : `${shortMonth(monthKey(at))} ${at.slice(2, 4)}`);
    }
    return { points, labels };
  }, [loans, allTxns, today]);

  const savings = mom.map((s) => s.net);
  const opts = { compact: true } as const;
  // One plain sentence per chart: on a glance people read the sentence, not the chart.
  const momLine = (() => {
    const cur = mom[mom.length - 1];
    if (!cur || cur.change === null) return null;
    const prev = shortMonth(monthKey(addMonths(`${cur.month}-01`, -1)));
    const head = cur.month === currentMonth ? `So far in ${formatMonth(cur.month)}: ${money(cur.expense, opts)}` : `${formatMonth(cur.month)}: ${money(cur.expense, opts)}`;
    return `${head}, ${changeText(cur.change)} ${cur.month === currentMonth ? `the same days of ${prev}` : prev}.`;
  })();
  const savingsLine = (() => {
    const full = mom.filter((s) => s.month !== currentMonth && s.income);
    const last = full[full.length - 1];
    if (!last) return 'Add your income to see what you keep each month.';
    return last.net >= 0 ? `You kept ${money(last.net, opts)} in ${formatMonth(last.month)}.` : `You spent ${money(-last.net, opts)} more than came in during ${formatMonth(last.month)}.`;
  })();
  const topDay = heat.reduce<(typeof heat)[number] | null>((a, d) => (d.amount > (a?.amount ?? 0) ? d : a), null);
  const topCard = [...cardSpend].sort((a, b) => b.spend - a.spend)[0];
  const debtFree = debt ? debt.points.findIndex((p) => p <= 0) : -1;
  const topCat = slices[0];
  const prevCatSpend = topCat && range === 'month' ? (spendByCategory(txns, prevMonth, uptoDay).get(topCat.key) ?? 0) : 0;
  const takeaway = (() => {
    if (!topCat) return 'No spending recorded for this period yet.';
    if (range === 'month' && prevCatSpend) {
      const ch = (topCat.value - prevCatSpend) / prevCatSpend;
      return `${topCat.label} is your biggest spend: ${money(topCat.value, { compact: true })}, ${changeText(ch)} last month${sameDays}.`;
    }
    return `${topCat.label} is your biggest spend at ${money(topCat.value, { compact: true })}.`;
  })();

  return (
    <Screen title="Insights" large tabBar right={<IconButton name="sparkles" label="Ask the assistant" onPress={() => router.push('/assistant')} />}>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'tax', label: 'Tax' },
        ]}
      />
      {view === 'tax' ? <TaxBody /> : (
        <>
          <Section title="Am I in good shape?">
          <Card style={{ gap: space(1.5) }}>
            {health.map((m) => (
              <Row key={m.key} gap={1.25} style={{ alignItems: 'flex-start' }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: { good: colors.good, watch: colors.warn, risk: colors.expense, unknown: colors.border }[m.status] }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="bodyStrong">
                    {m.label}
                    {m.status === 'unknown' ? '' : `: ${m.value}`}
                  </Txt>
                  <Txt variant="small" tone="muted">
                    {m.reason}
                  </Txt>
                </View>
              </Row>
            ))}
          </Card>
          </Section>

          {mom.length ? (
            <Section title="Am I spending more than before?">
              <Card style={{ gap: space(1.5) }}>
                {momLine ? <Txt variant="small" tone="muted">{momLine}</Txt> : null}
                {/* Invested (net of sales) as a second bar once there is any: money set aside, not spent. */}
                {mom.some((s) => s.invested > 0) ? (
                  <Bars
                    data={mom.map((s) => ({ key: s.month, label: shortMonth(s.month), tooltip: s.month === currentMonth ? `${formatMonth(s.month)} so far` : formatMonth(s.month), values: [s.expense, Math.max(0, s.invested)] }))}
                    colors={[colors.primary, colors.textFaint]}
                    legend={['Spent', 'Invested']}
                    height={150}
                    highlightLast
                  />
                ) : (
                  <Bars
                    data={mom.map((s) => ({ key: s.month, label: shortMonth(s.month), tooltip: s.month === currentMonth ? `${formatMonth(s.month)} so far` : formatMonth(s.month), values: [s.expense] }))}
                    colors={[colors.primary]}
                    height={150}
                    highlightLast
                  />
                )}
                <View>
                  {(allMonths ? momRows : momRows.slice(0, 6)).map((r, i) => {
                    const selected = range === 'month' && month === r.month;
                    const flat = r.change !== null && Math.abs(r.change) < 0.005;
                    return (
                      <Pressable
                        key={r.month}
                        onPress={() => {
                          setRange('month');
                          setMonth(r.month);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityHint="Shows this month's categories below"
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: space(1),
                          paddingVertical: space(1.25),
                          paddingHorizontal: space(1),
                          marginHorizontal: -space(1),
                          borderRadius: 12,
                          borderTopWidth: i ? StyleSheet.hairlineWidth : 0,
                          borderTopColor: colors.border,
                          backgroundColor: selected ? colors.primarySoft : pressed ? colors.surfaceAlt : 'transparent',
                        })}
                      >
                        <View style={{ flex: 1, gap: 2 }}>
                          <Txt variant="bodyStrong">
                            {formatMonth(r.month)}
                            {r.month === currentMonth ? ' · so far' : ''}
                          </Txt>
                          <Txt variant="small" tone="muted" numberOfLines={1}>
                            {r.income ? `In ${money(r.income, { compact: true })} · ${r.net < 0 ? 'Overspent' : 'Saved'} ${money(Math.abs(r.net), { compact: true })}` : 'No income recorded'}
                          </Txt>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                          <Money value={r.expense} variant="bodyStrong" decimals="never" />
                          {r.change !== null ? (
                            <Txt variant="small" tone={flat || r.change < 0 ? 'muted' : 'warn'}>
                              {flat ? 'Same as before' : `${r.change > 0 ? '↑' : '↓'} ${Math.min(999, Math.abs(Math.round(r.change * 100)))}%`}
                            </Txt>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                {momRows.length > 6 ? (
                  <Pressable onPress={() => setAllMonths((v) => !v)} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start' }}>
                    <Txt variant="small" tone="primary">
                      {allMonths ? 'Show fewer' : `Show all ${momRows.length} months`}
                    </Txt>
                  </Pressable>
                ) : null}
                <Txt variant="small" tone="muted">
                  Change is against the month before; the current month is compared with the same days of last month.
                </Txt>
              </Card>
            </Section>
          ) : null}

          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'quarter', label: 'Quarter' },
              { value: 'year', label: 'Year' },
            ]}
          />
          <Row style={{ justifyContent: 'space-between' }}>
            <IconButton name="chevron-back" label={range === 'month' ? 'Previous month' : 'Earlier'} onPress={() => setMonth(monthKey(addMonths(`${month}-01`, -1)))} />
            <Txt variant="h3">{range === 'month' ? formatMonth(month) : `${formatMonth(monthList[monthList.length - 1])} – ${formatMonth(month)}`}</Txt>
            <IconButton name="chevron-forward" label="Next month" disabled={month >= monthKey(today)} onPress={() => setMonth(monthKey(addMonths(`${month}-01`, 1)))} />
          </Row>

          <Section title={range === 'month' ? `Where did my money go in ${formatMonth(month)}?` : 'Where did my money go?'}>
            <Card style={{ gap: space(1.5) }}>
              <Txt variant="small" tone="muted">
                {takeaway}
              </Txt>
              {slices.length ? <RankedBars slices={slices} onSelect={(k) => router.push({ pathname: '/activity', params: { category: k } })} /> : null}
            </Card>
          </Section>

          <Section title="Am I keeping more each month?">
            <Card style={{ gap: space(1) }}>
              <Txt variant="small" tone="muted">
                {savingsLine}
              </Txt>
              <LineChart points={savings} labels={mom.map((s) => formatMonth(s.month))} color={colors.good} />
            </Card>
          </Section>

          <Section title={`Which days cost the most in ${formatMonth(month)}?`}>
            <Card style={{ gap: space(1) }}>
              {topDay ? (
                <Txt variant="small" tone="muted">
                  {`Your biggest day was ${formatDay(topDay.date)}: ${money(topDay.amount, opts)}.`}
                </Txt>
              ) : null}
              <HeatCalendar days={heat} />
            </Card>
          </Section>

          {cardSpend.some((c) => c.spend) ? (
            <Section title="Which card do I use most?">
              <Card style={{ gap: space(1) }}>
                {topCard?.spend ? (
                  <Txt variant="small" tone="muted">
                    {`${topCard.card.name}: ${money(topCard.spend, opts)} in ${range === 'month' ? 'the last statement cycle' : `the last ${months} cycles`}.`}
                  </Txt>
                ) : null}
                <Bars data={cardSpend.map((c) => ({ key: c.card.id, label: c.card.name.split(' ')[0], values: [c.spend] }))} colors={[colors.primary]} height={130} />
              </Card>
            </Section>
          ) : null}

          {debt ? (
            <Section title="When will my loans be paid off?">
              <Card style={{ gap: space(1) }}>
                <Txt variant="small" tone="muted">
                  {debtFree >= 0
                    ? `Debt-free around ${debt.labels[debtFree]} if you pay every EMI on time.`
                    : `${money(debt.points[debt.points.length - 1], opts)} still owed in 5 years if you pay every EMI on time.`}
                </Txt>
                <LineChart points={debt.points} labels={debt.labels} color={colors.primary} />
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}
