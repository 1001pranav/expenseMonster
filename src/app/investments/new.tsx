import { useLocalSearchParams } from 'expo-router';
import type { YMD } from '@/domain/dates';
import { InvestmentForm } from '@/ui/forms/InvestmentForm';

export default function NewInvestment() {
  const p = useLocalSearchParams<{ side?: 'buy' | 'sell'; holdingId?: string; fromTxn?: string; amount?: string; date?: YMD }>();
  return <InvestmentForm side={p.side} holdingId={p.holdingId} fromTxnId={p.fromTxn} prefill={{ amount: p.amount ? Number(p.amount) : undefined, date: p.date }} />;
}
