import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { addDays, todayYMD, type YMD } from '@/domain/dates';
import type { Paise } from '@/domain/money';
import { remove } from '@/db/repo';
import { saveBill } from '@/data/actions';
import { useTable } from '@/data/hooks';
import { Button, EmptyState } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { AmountField, DateField, TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';

/** Enter (or correct) one cycle's bill: amount, due date and meter usage. */
export default function BillEntry() {
  const { billerId, id } = useLocalSearchParams<{ billerId?: string; id?: string }>();
  const existing = useTable('bills').find((b) => b.id === id);
  const biller = useTable('billers').find((b) => b.id === (existing?.billerId ?? billerId));
  const [amount, setAmount] = useState<Paise | null>(existing?.amount ?? null);
  const [billDate, setBillDate] = useState<YMD>(existing?.billDate ?? todayYMD());
  const [dueDate, setDueDate] = useState<YMD>(existing?.dueDate ?? addDays(todayYMD(), biller?.dueOffsetDays ?? 15));
  const [usage, setUsage] = useState(existing?.usage ? String(existing.usage) : '');
  const [lateFee, setLateFee] = useState<Paise | null>(existing?.lateFee || null);
  const [saving, setSaving] = useState(false);

  if (!biller) {
    return (
      <Screen title="Bill" back>
        <EmptyState icon="alert-circle-outline" title="Biller not found" />
      </Screen>
    );
  }

  const save = async () => {
    if (!amount) return toast('Enter the bill amount', { tone: 'error' });
    setSaving(true);
    try {
      await saveBill(
        { billerId: biller.id, billDate, dueDate, amount, usage: usage ? Number(usage) : null, lateFee: lateFee ?? 0, status: 'open', scope: biller.scope },
        existing?.id,
      );
      toast('Bill saved — reminder set for the due date', { tone: 'success' });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title={existing ? 'Edit bill' : `${biller.name} bill`}
      subtitle={biller.consumerNo ? `Consumer no. ${biller.consumerNo}` : undefined}
      back
      right={existing ? <Button title="Delete" variant="ghost" size="sm" onPress={() => remove('bills', existing.id).then(() => router.back())} /> : null}
      footer={<Button title="Save bill" icon="checkmark" size="lg" onPress={save} loading={saving} />}
    >
      <AmountField label="Bill amount" value={amount} onChange={setAmount} autoFocus={!existing} />
      <DateField label="Due date" value={dueDate} onChange={setDueDate} quick={false} />
      <DateField label="Bill date" value={billDate} onChange={setBillDate} />
      {biller.usageUnit ? <TextField label={`Units used (${biller.usageUnit})`} value={usage} onChangeText={(v) => setUsage(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" hint="For usage trends" /> : null}
      <AmountField label="Late fee / penalty (if any)" value={lateFee} onChange={setLateFee} />
      {!existing ? <Button title="Scan the bill instead" icon="scan-outline" variant="secondary" onPress={() => router.replace('/scan')} /> : null}
    </Screen>
  );
}
