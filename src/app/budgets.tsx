import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { budgetUsage, spendByCategory } from '@/domain/budget';
import { addMonths, daysInMonth, formatMonth, monthKey, parts } from '@/domain/dates';
import type { Paise } from '@/domain/money';
import { insert, remove, update } from '@/db/repo';
import { useConfirmed, useSortedCategories, useTable, useToday } from '@/data/hooks';
import { Button, Card, Chip, IconCircle, ListRow, Money, ProgressBar, Row, Txt, useMoneyText, type IconName } from '@/ui/components/core';
import { Sheet } from '@/ui/components/feedback';
import { AmountField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

export default function Budgets() {
  const { colors } = useTheme();
  const money = useMoneyText();
  const today = useToday();
  const month = monthKey(today);
  const cats = useSortedCategories('expense');
  const budgets = useTable('budgets');
  const txns = useConfirmed();
  const usage = useMemo(() => new Map(budgetUsage(budgets, txns, month).map((u) => [u.categoryId, u])), [budgets, txns, month]);
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState<Paise | null>(null);
  const [amountKey, setAmountKey] = useState(0);
  // Suggest limits from what was actually spent, rounded up to the next ₹500.
  const history = useMemo(() => [1, 2, 3].map((i) => spendByCategory(txns, monthKey(addMonths(today, -i)))), [txns, today]);
  const roundUp = (p: Paise) => Math.ceil(p / 500_00) * 500_00;
  const lastMonth = editing ? (history[0].get(editing) ?? 0) : 0;
  const avg3 = editing ? Math.round(history.reduce((a, h) => a + (h.get(editing) ?? 0), 0) / 3) : 0;
  const total = [...usage.values()].reduce((a, u) => a + u.limit, 0);
  const spent = [...usage.values()].reduce((a, u) => a + u.spent, 0);
  const over = [...usage.values()].filter((u) => u.level === 'over').length;
  const { y, m, d } = parts(today);
  const daysLeft = daysInMonth(y, m) - d + 1;
  const ratio = total ? spent / total : 0;

  const save = async () => {
    if (!editing) return;
    const existing = budgets.find((b) => b.categoryId === editing && b.month === '*');
    if (!amount && existing) await remove('budgets', existing.id);
    else if (amount && existing) await update('budgets', existing.id, { amount });
    else if (amount) await insert('budgets', { categoryId: editing, month: '*', amount, scope: 'household' });
    setEditing(null);
  };

  return (
    <Screen title="Monthly budgets" subtitle="Alerts at 80% and 100% of each budget" back>
      {total ? (
        <Card style={{ gap: space(1.25) }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="caption" tone="muted">
              {formatMonth(month).toUpperCase()} · BUDGETED CATEGORIES
            </Txt>
            <Txt variant="caption" tone={over ? 'expense' : 'muted'}>
              {over ? `${over} OVER` : `${daysLeft} DAYS LEFT`}
            </Txt>
          </Row>
          <Row gap={0.75} style={{ alignItems: 'baseline' }}>
            <Money value={spent} variant="h1" decimals="never" />
            <Txt tone="muted">of {money(total, { decimals: 'never' })}</Txt>
          </Row>
          <ProgressBar value={ratio} color={ratio >= 1 ? colors.expense : ratio >= 0.8 ? colors.warn : colors.income} />
          <Txt variant="small" tone="muted">
            {spent < total ? `${money(total - spent, { decimals: 'never' })} left · about ${money(Math.floor((total - spent) / daysLeft), { decimals: 'never' })} a day` : `Over by ${money(spent - total, { decimals: 'never' })} this month`}
          </Txt>
        </Card>
      ) : (
        <Card tone="alt" style={{ gap: 4 }}>
          <Txt variant="bodyStrong">Start with your top 3 categories</Txt>
          <Txt variant="small" tone="muted">
            Groceries, food delivery and shopping usually move the needle most. Tap one below to set a monthly limit — it repeats every month.
          </Txt>
        </Card>
      )}
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {cats.map((c) => {
          const u = usage.get(c.id);
          return (
            <ListRow
              key={c.id}
              leading={<IconCircle name={c.icon as IconName} color={c.color} />}
              title={c.name}
              subtitle={
                u ? (
                  <View style={{ gap: 4, marginTop: 4 }}>
                    <ProgressBar value={u.ratio} color={u.level === 'over' ? colors.expense : u.level === 'warn' ? colors.warn : colors.income} height={6} />
                    <Txt variant="small" tone="muted">
                      {money(u.spent, { compact: true })} of {money(u.limit, { compact: true })}
                    </Txt>
                  </View>
                ) : (
                  'No budget'
                )
              }
              onPress={() => {
                setEditing(c.id);
                setAmount(u?.limit ?? null);
              }}
              chevron
            />
          );
        })}
      </Card>
      <Sheet visible={Boolean(editing)} onClose={() => setEditing(null)} title={`Budget · ${cats.find((c) => c.id === editing)?.name ?? ''}`}>
        <AmountField key={`${editing}-${amountKey}`} label="Per month" value={amount} onChange={setAmount} autoFocus />
        {lastMonth || avg3 ? (
          <Row gap={1} wrap>
            {lastMonth ? <Chip compact label={`Last month ${money(lastMonth, { compact: true })}`} selected={amount === roundUp(lastMonth)} onPress={() => (setAmount(roundUp(lastMonth)), setAmountKey((k) => k + 1))} /> : null}
            {avg3 && avg3 !== lastMonth ? <Chip compact label={`3-month avg ${money(avg3, { compact: true })}`} selected={amount === roundUp(avg3)} onPress={() => (setAmount(roundUp(avg3)), setAmountKey((k) => k + 1))} /> : null}
          </Row>
        ) : null}
        <Txt variant="small" tone="muted">
          Leave empty to remove the budget.
        </Txt>
        <Button title="Save" onPress={save} />
        <View style={{ height: space(1) }} />
      </Sheet>
    </Screen>
  );
}
