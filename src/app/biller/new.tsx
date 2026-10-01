import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BILLER_TYPES, billerMeta } from '@/domain/bills';
import { FREQUENCY_LABEL } from '@/domain/recurrence';
import type { BillerType, Frequency, PayMethod, Scope } from '@/domain/types';
import type { Paise } from '@/domain/money';
import { insert, update } from '@/db/repo';
import { categoryForBiller, generateFixedBills } from '@/data/actions';
import { useTable } from '@/data/hooks';
import { Button, Card, Chip, Txt, type IconName } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { AmountField, ChipSelect, DayOfMonthField, Field, SwitchRow, TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';

export default function BillerForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useTable('billers').find((b) => b.id === id);
  const cards = useTable('cards');
  const [type, setType] = useState<BillerType | null>(existing?.type ?? null);
  const [name, setName] = useState(existing?.name ?? '');
  const [provider, setProvider] = useState(existing?.provider ?? '');
  const [consumerNo, setConsumerNo] = useState(existing?.consumerNo ?? '');
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? 'monthly');
  const [amount, setAmount] = useState<Paise | null>(existing?.fixedAmount ?? null);
  const [billDay, setBillDay] = useState(existing?.billDay ?? 1);
  const [dueOffset, setDueOffset] = useState(String(existing?.dueOffsetDays ?? 15));
  const [validity, setValidity] = useState(String(existing?.validityDays ?? 28));
  const [autopay, setAutopay] = useState(Boolean(existing?.autopay));
  const [method, setMethod] = useState<PayMethod | null>(existing?.defaultMethod ?? null);
  const [cardId, setCardId] = useState<string | null>(existing?.defaultCardId ?? null);
  const [upiId, setUpiId] = useState(existing?.upiId ?? '');
  const [scope, setScope] = useState<Scope>(existing?.scope ?? 'household');
  const [saving, setSaving] = useState(false);

  const meta = type ? billerMeta(type) : null;
  const mode = meta?.mode ?? 'variable';

  if (!type) {
    return (
      <Screen title="What kind of bill?" back>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {BILLER_TYPES.map((b) => (
            <Chip
              key={b.type}
              label={b.label}
              icon={b.icon as IconName}
              onPress={() => {
                setType(b.type);
                if (!name) setName(b.label);
                if (b.type === 'rent' || b.type === 'maintenance') setDueOffset('5');
                if (b.type === 'school') setFrequency('quarterly');
              }}
            />
          ))}
        </View>
      </Screen>
    );
  }

  const save = async () => {
    if (!name.trim()) return toast('Name this bill', { tone: 'error' });
    if (mode === 'fixed' && !amount) return toast('Enter the monthly amount', { tone: 'error' });
    setSaving(true);
    const data = {
      name: name.trim(),
      type,
      provider: provider.trim() || null,
      consumerNo: consumerNo.trim() || null,
      frequency,
      amountMode: mode,
      fixedAmount: amount,
      billDay,
      dueOffsetDays: Math.max(0, Number(dueOffset) || 0),
      autopay: autopay ? (1 as const) : (0 as const),
      defaultMethod: method,
      defaultCardId: method === 'card' ? cardId : null,
      upiId: upiId.trim() || null,
      validityDays: mode === 'prepaid' ? Number(validity) || 28 : null,
      categoryId: existing?.categoryId ?? categoryForBiller(type),
      usageUnit: meta?.unit ?? null,
      active: 1 as const,
      scope,
    };
    try {
      const saved = existing ? await update('billers', existing.id, data) : await insert('billers', data);
      await generateFixedBills();
      toast(existing ? 'Bill updated' : mode === 'variable' ? "Added — you'll be asked for the amount each cycle" : 'Added — reminders are on', { tone: 'success' });
      if (!existing && mode === 'variable') router.replace({ pathname: '/bill/new', params: { billerId: saved.id } });
      else router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title={existing ? 'Edit bill' : `Add ${meta?.label.toLowerCase()}`} back footer={<Button title="Save" icon="checkmark" size="lg" onPress={save} loading={saving} />}>
      <TextField label="Name" value={name} onChangeText={setName} placeholder="BESCOM – Home" />
      <TextField label="Provider" value={provider} onChangeText={setProvider} placeholder="BESCOM, Airtel, Jio, ACT…" hint="Helps match bank SMS" />
      {mode !== 'on_demand' ? <TextField label={type === 'rent' ? 'Landlord / reference' : 'Consumer / account no.'} value={consumerNo} onChangeText={setConsumerNo} placeholder="Shown when you pay" autoCapitalize="characters" /> : null}

      {mode === 'prepaid' ? (
        <>
          <AmountField label="Usual recharge amount" value={amount} onChange={setAmount} />
          <TextField label="Plan validity (days)" value={validity} onChangeText={(v) => setValidity(v.replace(/\D/g, ''))} keyboardType="number-pad" />
          <Card tone="alt">
            <Txt variant="small" tone="muted">
              No bills for prepaid. Record each recharge and we'll remind you before the plan expires.
            </Txt>
          </Card>
        </>
      ) : mode === 'on_demand' ? (
        <>
          <AmountField label="Usual cylinder price" value={amount} onChange={setAmount} />
          <Card tone="alt">
            <Txt variant="small" tone="muted">
              Log each booking. After two bookings we'll predict when to book the next one.
            </Txt>
          </Card>
        </>
      ) : (
        <>
          <ChipSelect label="Billing cycle" value={frequency} onChange={(v) => v && setFrequency(v)} options={(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => ({ value: f, label: FREQUENCY_LABEL[f] }))} />
          {mode === 'fixed' ? <AmountField label="Amount per cycle" value={amount} onChange={setAmount} /> : null}
          <DayOfMonthField label={mode === 'fixed' ? 'Due day of month' : 'Bill usually arrives on'} value={billDay} onChange={setBillDay} />
          <Field label="Pay within (days after bill)">
            <TextField value={dueOffset} onChangeText={(v) => setDueOffset(v.replace(/\D/g, ''))} keyboardType="number-pad" />
          </Field>
          <SwitchRow icon="repeat" label="Autopay / standing instruction" description="No pay reminders; we warn if the debit doesn't show up" value={autopay} onChange={setAutopay} />
        </>
      )}

      <ChipSelect
        label="Usually paid with"
        value={method}
        allowNone
        onChange={setMethod}
        options={[
          { value: 'upi', label: 'UPI' },
          { value: 'card', label: 'Credit card' },
          { value: 'bank', label: 'Net banking' },
          { value: 'cash', label: 'Cash' },
        ]}
      />
      {method === 'card' && cards.length ? <ChipSelect label="Card" value={cardId} onChange={setCardId} options={cards.map((c) => ({ value: c.id, label: c.name }))} /> : null}
      <TextField label="Payee UPI ID (optional)" value={upiId} onChangeText={setUpiId} placeholder="landlord@okicici" autoCapitalize="none" icon="at" />
      <SwitchRow icon="lock-closed-outline" label="Keep private" description="Don't share this bill with family phones" value={scope === 'personal'} onChange={(v) => setScope(v ? 'personal' : 'household')} />
    </Screen>
  );
}
