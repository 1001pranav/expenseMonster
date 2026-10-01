import { router } from 'expo-router';
import { formatDay } from '@/domain/dates';
import { FREQUENCY_LABEL } from '@/domain/recurrence';
import { useTable } from '@/data/hooks';
import { Button, Card, EmptyState, ListRow, Money } from '@/ui/components/core';
import { Screen } from '@/ui/components/Screen';
import { useTheme } from '@/ui/theme';

export default function Incomes() {
  const { colors } = useTheme();
  const incomes = useTable('incomes');
  return (
    <Screen title="Recurring income" back footer={<Button title="Add income" icon="add" onPress={() => router.push('/income/new')} />}>
      {incomes.length ? (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {incomes.map((i) => (
            <ListRow key={i.id} icon="wallet" iconColor={colors.income} title={i.name} subtitle={`${FREQUENCY_LABEL[i.frequency]} · next ${formatDay(i.nextDate)}`} right={<Money value={i.amount} tone="income" />} chevron onPress={() => router.push(`/income/${i.id}`)} />
          ))}
        </Card>
      ) : (
        <EmptyState icon="wallet-outline" title="No recurring income" body="Add salary or rent you receive to get a nudge on payday and see true monthly savings." />
      )}
    </Screen>
  );
}
