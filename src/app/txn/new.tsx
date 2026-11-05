import { useLocalSearchParams } from 'expo-router';
import type { TxnType } from '@/domain/types';
import { TxnForm } from '@/ui/forms/TxnForm';

export default function NewTxn() {
  const { type, amount, categoryId } = useLocalSearchParams<{ type?: TxnType; amount?: string; categoryId?: string }>();
  const paise = amount ? Number(amount) : NaN;
  return (
    <TxnForm
      initialType={type ?? 'expense'}
      initialAmount={Number.isInteger(paise) && paise > 0 ? paise : undefined}
      initialCategoryId={categoryId || undefined}
    />
  );
}
