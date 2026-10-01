import { useLocalSearchParams } from 'expo-router';
import { useTable } from '@/data/hooks';
import { EmptyState } from '@/ui/components/core';
import { Screen } from '@/ui/components/Screen';
import { TxnForm } from '@/ui/forms/TxnForm';

export default function EditTxn() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const txn = useTable('transactions').find((t) => t.id === id);
  if (!txn) {
    return (
      <Screen title="Transaction" back>
        <EmptyState icon="alert-circle-outline" title="Not found" body="It may have been deleted on this or another phone." />
      </Screen>
    );
  }
  return <TxnForm key={txn.id} existing={txn} />;
}
