import { useLocalSearchParams } from 'expo-router';
import { IncomeForm } from '@/ui/forms/IncomeForm';

export default function EditIncome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <IncomeForm id={id} />;
}
