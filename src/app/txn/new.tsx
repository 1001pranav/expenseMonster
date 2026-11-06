import { useLocalSearchParams } from 'expo-router';
import type { TxnType } from '@/domain/types';
import { TxnForm } from '@/ui/forms/TxnForm';

export default function NewTxn() {
  const { type, amount, categoryId, payCard } = useLocalSearchParams<{ type?: TxnType; amount?: string; categoryId?: string; payCard?: string }>();
  const paise = amount ? Number(amount) : NaN;
  return (
    <TxnForm
      initialType={type ?? 'expense'}
      initialAmount={Number.isInteger(paise) && paise > 0 ? paise : undefined}
      initialCategoryId={categoryId || undefined}
      initialPayCardId={payCard || undefined}
    />
  );
}
