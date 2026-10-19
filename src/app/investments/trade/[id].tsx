import { useLocalSearchParams } from 'expo-router';
import { useTable } from '@/data/hooks';
import { EmptyState } from '@/ui/components/core';
import { Screen } from '@/ui/components/Screen';
import { InvestmentForm } from '@/ui/forms/InvestmentForm';

export default function EditTrade() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trade = useTable('trades').find((t) => t.id === id);
  if (!trade) {
    return (
      <Screen title="Investment" back>
        <EmptyState icon="alert-circle-outline" title="Not found" body="It may have been deleted on this or another phone." />
      </Screen>
    );
  }
  return <InvestmentForm key={trade.id} tradeId={trade.id} />;
}
