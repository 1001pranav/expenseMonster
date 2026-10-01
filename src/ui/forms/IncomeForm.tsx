import { router } from 'expo-router';
import { useState } from 'react';
import { addMonths, todayYMD, type YMD } from '@/domain/dates';
import type { Paise } from '@/domain/money';
import { FREQUENCY_LABEL } from '@/domain/recurrence';
import type { Frequency, Scope } from '@/domain/types';
import { insert, remove, update } from '@/db/repo';
import { useSortedCategories, useTable } from '@/data/hooks';
import { Button } from '../components/core';
import { toast } from '../components/feedback';
import { AmountField, ChipSelect, DateField, SwitchRow, TextField } from '../components/forms';
import { Screen } from '../components/Screen';

export function IncomeForm({ id }: { id?: string }) {
  const existing = useTable('incomes').find((i) => i.id === id);
  const accounts = useTable('accounts');
  const cats = useSortedCategories('income');
  const [name, setName] = useState(existing?.name ?? 'Salary');
  const [amount, setAmount] = useState<Paise | null>(existing?.amount ?? null);
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? 'monthly');
  const [nextDate, setNextDate] = useState<YMD>(existing?.nextDate ?? addMonths(todayYMD(), 1, 1));
  const [accountId, setAccountId] = useState<string | null>(existing?.accountId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? 'cat_salary');
  const [scope, setScope] = useState<Scope>(existing?.scope ?? 'household');

  const save = async () => {
    if (!name.trim() || !amount) return toast('Name and amount are needed', { tone: 'error' });
    const data = { name: name.trim(), amount, frequency, nextDate, accountId, categoryId, active: 1 as const, scope };
    if (existing) await update('incomes', existing.id, data);
    else await insert('incomes', data);
    toast('Saved — we will remind you to mark it received', { tone: 'success' });
    router.back();
  };

  return (
    <Screen
      title={existing ? 'Edit income' : 'Recurring income'}
      back
      right={existing ? <Button title="Delete" variant="ghost" size="sm" onPress={() => remove('incomes', existing.id).then(() => router.back())} /> : null}
      footer={<Button title="Save" icon="checkmark" size="lg" onPress={save} />}
    >
      <TextField label="Name" value={name} onChangeText={setName} placeholder="Salary, rent from flat…" />
      <AmountField label="Expected amount" value={amount} onChange={setAmount} />
      <ChipSelect label="How often" value={frequency} onChange={(v) => v && setFrequency(v)} options={(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => ({ value: f, label: FREQUENCY_LABEL[f] }))} />
      <DateField label="Next expected on" value={nextDate} onChange={setNextDate} quick={false} />
      <ChipSelect label="Category" value={categoryId} onChange={setCategoryId} options={cats.map((c) => ({ value: c.id, label: c.name, color: c.color }))} />
      {accounts.length ? <ChipSelect label="Credited to" value={accountId} onChange={setAccountId} allowNone options={accounts.map((a) => ({ value: a.id, label: a.name }))} /> : null}
      <SwitchRow icon="lock-closed-outline" label="Keep private" value={scope === 'personal'} onChange={(v) => setScope(v ? 'personal' : 'household')} />
    </Screen>
  );
}
