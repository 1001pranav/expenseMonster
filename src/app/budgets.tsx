import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { OVERALL_BUDGET, budgetLimit, cycleUsage, spendInRange } from '@/domain/budget';
import { cycleLabel, shiftCycle } from '@/domain/cycle';
import { diffDays } from '@/domain/dates';
import type { Paise } from '@/domain/money';
import { insert, remove, update } from '@/db/repo';
import { useConfirmed, useCycle, usePayday, useSortedCategories, useTable, useToday } from '@/data/hooks';
import { useStore } from '@/db/store';
import { Button, Chip, IconCircle, List, ListRow, Money, ProgressBar, Row, Txt, useMoneyText, type IconName } from '@/ui/components/core';
import { Sheet } from '@/ui/components/feedback';
import { AmountField } from '@/ui/components/forms';
import { PaydaySheet, paydayText } from '@/ui/components/PaydaySheet';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

/** The page body, also shown inside the Insights tab. */
export function BudgetsBody() {
  const { colors } = useTheme();
  const money = useMoneyText();
  const today = useToday();
  // Payday to payday, or the calendar month (Settings › Budget period).
  const cycle = useCycle();
  const payday = usePayday();
  const mode = useStore((s) => s.settings.budgetPeriod);
  const [paydaySheet, setPaydaySheet] = useState(false);
  const cats = useSortedCategories('expense');
  const budgets = useTable('budgets');
  const txns = useConfirmed();
  const usage = useMemo(() => new Map(cycleUsage(budgets, txns, cycle).map((u) => [u.categoryId, u])), [budgets, txns, cycle]);
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState<Paise | null>(null);
  const [amountKey, setAmountKey] = useState(0);
  // Suggest limits from what was actually spent, rounded up to the next ₹500.
  const history = useMemo(() => [1, 2, 3].map((i) => shiftCycle(today, payday, -i)).map((c) => spendInRange(txns, c.start, c.end)), [txns, today, payday]);
  const roundUp = (p: Paise) => Math.ceil(p / 500_00) * 500_00;
  // The whole-month budget is measured against all spending, so its history is the total.
  const spentIn = (h: Map<string, Paise>, id: string) => (id === OVERALL_BUDGET ? [...h.values()].reduce((a, v) => a + v, 0) : (h.get(id) ?? 0));
  const lastMonth = editing ? spentIn(history[0], editing) : 0;
  const avg3 = editing ? Math.round(history.reduce((a, h) => a + spentIn(h, editing), 0) / 3) : 0;
  const overall = usage.get(OVERALL_BUDGET);
  const total = budgetLimit([...usage.values()]);
  const spent = overall ? overall.spent : [...usage.values()].reduce((a, u) => a + u.spent, 0);
  const over = [...usage.values()].filter((u) => u.level === 'over').length;
  const daysLeft = diffDays(cycle.end, today) + 1;
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
    <>
      {total ? (
        <View style={{ gap: space(1.25), paddingHorizontal: 4 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="caption" tone="muted">
              {cycleLabel(cycle)}{overall ? '' : ', budgeted categories'}
            </Txt>
            <Txt variant="caption" tone={over ? 'expense' : 'muted'}>
              {over ? `${over} over budget` : `${daysLeft} days left`}
            </Txt>
          </Row>
          <Row gap={0.75} style={{ alignItems: 'baseline' }}>
            <Money value={spent} variant="h1" decimals="never" />
            <Txt tone="muted">of {money(total, { decimals: 'never' })}</Txt>
          </Row>
          <ProgressBar value={ratio} color={ratio >= 1 ? colors.expense : ratio >= 0.8 ? colors.warn : colors.primary} />
          <Txt variant="small" tone="muted">
            {spent < total ? `${money(total - spent, { decimals: 'never' })} left · about ${money(Math.floor((total - spent) / daysLeft), { decimals: 'never' })} a day` : `Over by ${money(spent - total, { decimals: 'never' })} this period`}
          </Txt>
        </View>
      ) : (
        <View style={{ gap: 4, paddingHorizontal: 4 }}>
          <Txt variant="bodyStrong">Start with your top 3 categories</Txt>
          <Txt variant="small" tone="muted">
            Groceries, food delivery and shopping usually move the needle most. Tap one below to set a monthly limit — it repeats every month.
          </Txt>
        </View>
      )}
      <ListRow icon="calendar-outline" title="Budget period" subtitle={paydayText(mode, payday)} chevron onPress={() => setPaydaySheet(true)} />
      <PaydaySheet visible={paydaySheet} onClose={() => setPaydaySheet(false)} />
      <List>
        <ListRow
          icon="wallet-outline"
          title="Whole month"
          subtitle={overall ? `${money(overall.spent, { compact: true })} of ${money(overall.limit, { compact: true })}, all spending` : 'One number for all spending (sets safe-to-spend on Home)'}
          onPress={() => {
            setEditing(OVERALL_BUDGET);
            setAmount(overall?.limit ?? null);
          }}
          chevron
        />
      </List>
      <List>
        {cats.map((c) => {
          const u = usage.get(c.id);
          return (
            <ListRow
              key={c.id}
              leading={<IconCircle name={c.icon as IconName} />}
              title={c.name}
              subtitle={
                u ? (
                  <View style={{ gap: 4, marginTop: 4 }}>
                    <ProgressBar value={u.ratio} color={u.level === 'over' ? colors.expense : u.level === 'warn' ? colors.warn : colors.primary} height={6} />
                    <Txt variant="small" tone={u.level === 'over' ? 'expense' : u.level === 'warn' ? 'warn' : 'muted'}>
                      {money(u.spent, { compact: true })} of {money(u.limit, { compact: true })}
                      {u.level === 'over' ? ' · Over' : u.level === 'warn' ? ' · Close to limit' : ''}
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
      </List>
      <Sheet visible={Boolean(editing)} onClose={() => setEditing(null)} title={`Budget · ${editing === OVERALL_BUDGET ? 'Whole month' : (cats.find((c) => c.id === editing)?.name ?? '')}`}>
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
    </>
  );
}

export default function Budgets() {
  return (
    <Screen title="Budgets" back>
      <BudgetsBody />
    </Screen>
  );
}
