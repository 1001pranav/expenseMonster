import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { budgetUsage, spendByCategory } from '@/domain/budget';
import { buildCardLedger } from '@/domain/creditCard';
import { addMonths, daysInMonth, formatMonth, fromParts, isoToYMD, monthKey, parts, shortMonth } from '@/domain/dates';
import { loanEmisPaid } from '@/domain/dues';
import { scheduleFor } from '@/domain/emi';
import type { Paise } from '@/domain/money';
import { financialHealth } from '@/domain/health';
import { comparableChange, monthTotals, monthlySeries } from '@/domain/transactions';
import { useCategoryMap, useConfirmed, useTable, useToday } from '@/data/hooks';
import { Bars, HeatCalendar, LineChart, RankedBars, type Slice } from '@/ui/components/charts';
import { Card, IconButton, Money, ProgressBar, Row, Section, Txt, useMoneyText } from '@/ui/components/core';
import { Segmented } from '@/ui/components/forms';
import { BudgetsBody } from '../budgets';
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
  const [view, setView] = useState<'overview' | 'budgets' | 'tax'>('overview');

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

  const budget = useMemo(() => budgetUsage(budgets, txns, month), [budgets, txns, month]);

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
          { value: 'budgets', label: 'Budgets' },
          { value: 'tax', label: 'Tax' },
        ]}
      />
      {view === 'budgets' ? <BudgetsBody /> : view === 'tax' ? <TaxBody /> : (
        <>
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

          {mom.length ? (
            <Section title="Month on month">
              <Card style={{ gap: space(1.5) }}>
                <Bars
                  data={mom.map((s) => ({ key: s.month, label: shortMonth(s.month), tooltip: s.month === currentMonth ? `${formatMonth(s.month)} so far` : formatMonth(s.month), values: [s.expense] }))}
                  colors={[colors.expense]}
                  height={150}
                  highlightLast
                />
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
                            <Txt variant="small" tone={flat ? 'muted' : r.change > 0 ? 'expense' : 'income'}>
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

          <Section title="Spending by category">
            <Card style={{ gap: space(1.5) }}>
              <Txt variant="small" tone="muted">
                {takeaway}
              </Txt>
              {slices.length ? <RankedBars slices={slices} onSelect={(k) => router.push({ pathname: '/activity', params: { category: k } })} /> : null}
            </Card>
          </Section>

          <Section title="Savings trend">
            <Card>
              <LineChart points={savings} labels={mom.map((s) => formatMonth(s.month))} color={colors.good} />
            </Card>
          </Section>

          <Section title={`Daily spending · ${formatMonth(month)}`}>
            <Card>
              <HeatCalendar days={heat} />
            </Card>
          </Section>

          {budget.length ? (
            <Section title="Budgets" action="Change" onAction={() => setView('budgets')}>
              <Card style={{ gap: space(1.5) }}>
                {budget.map((b) => (
                  <View key={b.categoryId} style={{ gap: 6 }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Txt variant="bodyStrong">{cats.get(b.categoryId)?.name ?? 'Category'}</Txt>
                      <Txt variant="small" tone={b.level === 'over' ? 'expense' : b.level === 'warn' ? 'warn' : 'muted'}>
                        {money(b.spent, { compact: true })} / {money(b.limit, { compact: true })}
                      </Txt>
                    </Row>
                    <ProgressBar value={b.ratio} color={b.level === 'over' ? colors.expense : b.level === 'warn' ? colors.warn : colors.good} />
                  </View>
                ))}
              </Card>
            </Section>
          ) : null}

          {cardSpend.some((c) => c.spend) ? (
            <Section title="Credit card spend">
              <Card>
                <Bars data={cardSpend.map((c) => ({ key: c.card.id, label: c.card.name.split(' ')[0], values: [c.spend] }))} colors={[colors.primary]} height={130} />
              </Card>
            </Section>
          ) : null}

          {debt ? (
            <Section title="Debt payoff projection">
              <Card style={{ gap: space(1) }}>
                <Txt variant="small" tone="muted">
                  Outstanding loan principal over the next 5 years if you pay every EMI on time.
                </Txt>
                <LineChart points={debt.points} labels={debt.labels} color={colors.expense} />
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}
