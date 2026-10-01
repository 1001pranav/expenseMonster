import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { formatINR, type Paise } from '@/domain/money';
import type { PayMethod } from '@/domain/types';
import { recordSettlement } from '@/data/actions';
import { useMembers, useSelfId } from '@/data/hooks';
import { isValidUpiId, openUpi } from '@/services/upi';
import { Button, Card, Txt } from '@/ui/components/core';
import { Sheet, toast } from '@/ui/components/feedback';
import { AmountField, ChipSelect } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { space } from '@/ui/theme';

/** Record money moving between household members (no money moves through this app). */
export default function Settle() {
  const params = useLocalSearchParams<{ from?: string; to?: string; amount?: string }>();
  const members = useMembers();
  const selfId = useSelfId();
  const [from, setFrom] = useState<string | null>(params.from ?? selfId ?? null);
  const [to, setTo] = useState<string | null>(params.to ?? null);
  const [amount, setAmount] = useState<Paise | null>(params.amount ? Number(params.amount) : null);
  const [method, setMethod] = useState<PayMethod>('upi');
  const [confirm, setConfirm] = useState(false);
  const waiting = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && waiting.current) {
        waiting.current = false;
        setConfirm(true);
      }
    });
    return () => sub.remove();
  }, []);

  const receiver = members.find((m) => m.id === to);
  const options = members.map((m) => ({ value: m.id, label: m.id === selfId ? 'You' : m.name, color: m.color }));

  const save = async () => {
    if (!from || !to || from === to) return toast('Pick two different people', { tone: 'error' });
    if (!amount) return toast('Enter an amount', { tone: 'error' });
    await recordSettlement(from, to, amount, method);
    toast(`Settlement of ${formatINR(amount)} recorded`, { tone: 'success' });
    router.back();
  };

  const payUpi = async () => {
    if (!receiver?.upiId || !isValidUpiId(receiver.upiId)) return toast(`Add ${receiver?.name ?? 'their'} UPI ID on their member page first`, { tone: 'error' });
    if (await openUpi({ upiId: receiver.upiId, name: receiver.name, amount, note: 'Settle up' })) waiting.current = true;
    else toast('No UPI app found', { tone: 'error' });
  };

  if (members.length < 2) {
    return (
      <Screen title="Settle up" back>
        <Card style={{ gap: space(1) }}>
          <Txt>Add family members first, then split expenses with them.</Txt>
          <Button title="Add member" icon="person-add" onPress={() => router.replace('/member/new')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      title="Settle up"
      back
      footer={
        <>
          {from === selfId && receiver?.upiId ? <Button title={`Pay ${receiver.name} via UPI`} icon="open-outline" size="lg" onPress={payUpi} style={{ marginBottom: space(1) }} /> : null}
          <Button title="Record settlement" icon="checkmark" variant={from === selfId && receiver?.upiId ? 'secondary' : 'primary'} size="lg" onPress={save} />
        </>
      }
    >
      <ChipSelect label="Who paid" value={from} onChange={setFrom} options={options} />
      <ChipSelect label="To whom" value={to} onChange={setTo} options={options.filter((o) => o.value !== from)} />
      <AmountField label="Amount" value={amount} onChange={setAmount} />
      <ChipSelect
        label="How"
        value={method}
        onChange={(v) => v && setMethod(v)}
        options={[
          { value: 'upi', label: 'UPI' },
          { value: 'cash', label: 'Cash' },
          { value: 'bank', label: 'Bank transfer' },
        ]}
      />
      <Sheet visible={confirm} onClose={() => setConfirm(false)} title="Did the UPI payment succeed?">
        <Button
          title="Yes, record it"
          variant="success"
          onPress={() => {
            setConfirm(false);
            save();
          }}
        />
        <Button title="No" variant="secondary" onPress={() => setConfirm(false)} />
      </Sheet>
    </Screen>
  );
}
