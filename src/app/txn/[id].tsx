import { useLocalSearchParams } from 'expo-router';
import { useTable } from '@/data/hooks';
import { EmptyState } from '@/ui/components/core';
import { Screen } from '@/ui/components/Screen';
import { InvestmentForm } from '@/ui/forms/InvestmentForm';
import { TxnForm } from '@/ui/forms/TxnForm';

export default function EditTxn() {
  const { id, ocr } = useLocalSearchParams<{ id: string; ocr?: string }>();
  const txn = useTable('transactions').find((t) => t.id === id);
  const trades = useTable('trades');
  if (!txn) {
    return (
      <Screen title="Transaction" back>
        <EmptyState icon="alert-circle-outline" title="Not found" body="It may have been deleted on this or another phone." />
      </Screen>
    );
  }
  // An investment is edited with its trade, so the money and what it bought stay in step.
  if (txn.linkType === 'investment' && txn.linkId && trades.some((t) => t.id === txn.linkId)) return <InvestmentForm key={txn.linkId} tradeId={txn.linkId} />;
  return <TxnForm key={txn.id} existing={txn} ocrText={ocr} />;
}
