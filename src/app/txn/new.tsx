import { useLocalSearchParams } from 'expo-router';
import type { TxnType } from '@/domain/types';
import { TxnForm } from '@/ui/forms/TxnForm';

export default function NewTxn() {
  const { type } = useLocalSearchParams<{ type?: TxnType }>();
  return <TxnForm initialType={type ?? 'expense'} />;
}
