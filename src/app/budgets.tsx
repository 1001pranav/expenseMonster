import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { budgetUsage } from '@/domain/budget';
import { monthKey } from '@/domain/dates';
import { formatINR, type Paise } from '@/domain/money';
import { insert, remove, update } from '@/db/repo';
import { useConfirmed, useSortedCategories, useTable, useToday } from '@/data/hooks';
import { Button, Card, IconCircle, ListRow, ProgressBar, Txt, type IconName } from '@/ui/components/core';
import { Sheet } from '@/ui/components/feedback';
import { AmountField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

export default function Budgets() {
  const { colors } = useTheme();
  const today = useToday();
  const month = monthKey(today);
  const cats = useSortedCategories('expense');
  const budgets = useTable('budgets');
  const txns = useConfirmed();
  const usage = useMemo(() => new Map(budgetUsage(budgets, txns, month).map((u) => [u.categoryId, u])), [budgets, txns, month]);
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState<Paise | null>(null);
  const total = [...usage.values()].reduce((a, u) => a + u.limit, 0);

  const save = async () => {
    if (!editing) return;
    const existing = budgets.find((b) => b.categoryId === editing && b.month === '*');
    if (!amount && existing) await remove('budgets', existing.id);
    else if (amount && existing) await update('budgets', existing.id, { amount });
    else if (amount) await insert('budgets', { categoryId: editing, month: '*', amount, scope: 'household' });
    setEditing(null);
  };

  return (
    <Screen title="Monthly budgets" subtitle={total ? `${formatINR(total)} across categories` : 'Alerts at 80% and 100%'} back>
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
                      {formatINR(u.spent, { compact: true })} of {formatINR(u.limit, { compact: true })}
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
        <AmountField key={editing ?? ''} label="Per month" value={amount} onChange={setAmount} autoFocus />
        <Txt variant="small" tone="muted">
          Leave empty to remove the budget.
        </Txt>
        <Button title="Save" onPress={save} />
        <View style={{ height: space(1) }} />
      </Sheet>
    </Screen>
  );
}
