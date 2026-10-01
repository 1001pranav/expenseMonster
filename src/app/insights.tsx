import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { budgetUsage, spendByCategory } from '@/domain/budget';
import { buildCardLedger } from '@/domain/creditCard';
import { addMonths, daysInMonth, formatMonth, fromParts, isoToYMD, monthKey, parts, shortMonth } from '@/domain/dates';
import { loanEmisPaid } from '@/domain/dues';
import { scheduleFor } from '@/domain/emi';
import { formatINR, type Paise } from '@/domain/money';
import { monthlySeries } from '@/domain/transactions';
import { useCategoryMap, useConfirmed, useTable, useToday } from '@/data/hooks';
import { Bars, Donut, HeatCalendar, LineChart, type Slice } from '@/ui/components/charts';
import { Card, Chip, IconButton, ProgressBar, Row, Section, Txt } from '@/ui/components/core';
import { Segmented } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

type Range = 'month' | 'quarter' | 'year';

export default function Insights() {
  const { colors } = useTheme();
  const today = useToday();
  const txns = useConfirmed();
  const cats = useCategoryMap();
  const budgets = useTable('budgets');
  const cards = useTable('cards');
  const overrides = useTable('card_overrides');
  const loans = useTable('loans');
  const allTxns = useTable('transactions');
  const [range, setRange] = useState<Range>('month');
  const [month, setMonth] = useState(monthKey(today));

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

  const series = useMemo(() => monthlySeries(txns, month, 12), [txns, month]);
  const thisMonth = series[series.length - 1];
  const lastMonth = series[series.length - 2];

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
        const l = buildCardLedger(c, allTxns, overrides, today);
        return { card: c, spend: l.cycles.slice(-months).reduce((a, x) => a + x.purchases - x.refunds, 0) };
      }),
    [cards, allTxns, overrides, today, months],
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
        const paid = loanEmisPaid(l, allTxns);
        const idx = Math.max(paid, s.filter((r) => r.date <= at).length) - 1;
        total += idx < 0 ? l.principal : (s[idx]?.balance ?? 0);
      }
      points.push(total);
      labels.push(i === 0 ? 'Now' : `${shortMonth(monthKey(at))} ${at.slice(2, 4)}`);
    }
    return { points, labels };
  }, [loans, allTxns, today]);

  const savings = series.map((s) => s.net);
  const topCat = slices[0];
  const prevCatSpend = topCat && range === 'month' ? (spendByCategory(txns, monthKey(addMonths(`${month}-01`, -1))).get(topCat.key) ?? 0) : 0;
  const takeaway = (() => {
    if (!topCat) return 'No spending recorded for this period yet.';
    if (range === 'month' && prevCatSpend) {
      const ch = (topCat.value - prevCatSpend) / prevCatSpend;
      return `${topCat.label} is your biggest spend: ${formatINR(topCat.value, { compact: true })}, ${ch >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(ch * 100))}% vs last month.`;
    }
    return `${topCat.label} is your biggest spend at ${formatINR(topCat.value, { compact: true })}.`;
  })();

  return (
    <Screen title="Insights" back>
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
        <IconButton name="chevron-back" label="Previous month" onPress={() => setMonth(monthKey(addMonths(`${month}-01`, -1)))} />
        <Txt variant="h3">{range === 'month' ? formatMonth(month) : `${formatMonth(monthList[monthList.length - 1])} – ${formatMonth(month)}`}</Txt>
        <IconButton name="chevron-forward" label="Next month" onPress={() => month < monthKey(today) && setMonth(monthKey(addMonths(`${month}-01`, 1)))} />
      </Row>

      <Section title="Spending by category">
        <Card style={{ gap: space(1.5) }}>
          <Txt variant="small" tone="muted">
            {takeaway}
          </Txt>
          {slices.length ? <Donut slices={slices.slice(0, 6)} onSelect={(k) => k !== 'others' && router.push({ pathname: '/activity', params: { category: k } })} /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {slices.slice(6).map((s) => (
              <Chip key={s.key} compact label={`${s.label} ${formatINR(s.value, { compact: true })}`} onPress={() => router.push({ pathname: '/activity', params: { category: s.key } })} />
            ))}
          </View>
        </Card>
      </Section>

      <Section title="Income vs expense · 12 months">
        <Card style={{ gap: space(1) }}>
          {thisMonth && lastMonth && lastMonth.expense ? (
            <Txt variant="small" tone="muted">
              Spending {thisMonth.expense >= lastMonth.expense ? 'up' : 'down'} {Math.abs(Math.round(((thisMonth.expense - lastMonth.expense) / lastMonth.expense) * 100))}% vs last month.
            </Txt>
          ) : null}
          <Bars data={series.map((s) => ({ key: s.month, label: shortMonth(s.month).slice(0, 1), values: [s.income, s.expense] }))} colors={[colors.income, colors.expense]} legend={['Income', 'Expense']} height={170} />
        </Card>
      </Section>

      <Section title="Savings trend">
        <Card>
          <LineChart points={savings} labels={series.map((s) => formatMonth(s.month))} color={colors.income} />
        </Card>
      </Section>

      <Section title={`Daily spending · ${formatMonth(month)}`}>
        <Card>
          <HeatCalendar days={heat} />
        </Card>
      </Section>

      {budget.length ? (
        <Section title="Budgets" action="Edit" onAction={() => router.push('/budgets')}>
          <Card style={{ gap: space(1.5) }}>
            {budget.map((b) => (
              <View key={b.categoryId} style={{ gap: 6 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt variant="bodyStrong">{cats.get(b.categoryId)?.name ?? 'Category'}</Txt>
                  <Txt variant="small" tone={b.level === 'over' ? 'expense' : b.level === 'warn' ? 'warn' : 'muted'}>
                    {formatINR(b.spent, { compact: true })} / {formatINR(b.limit, { compact: true })}
                  </Txt>
                </Row>
                <ProgressBar value={b.ratio} color={b.level === 'over' ? colors.expense : b.level === 'warn' ? colors.warn : colors.income} />
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
    </Screen>
  );
}
