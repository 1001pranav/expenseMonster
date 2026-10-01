import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { cycleFor } from '@/domain/creditCard';
import { formatDay, todayYMD } from '@/domain/dates';
import type { Paise } from '@/domain/money';
import type { Scope } from '@/domain/types';
import { insert, update } from '@/db/repo';
import { CARD_COLORS } from '@/db/seed';
import { useTable } from '@/data/hooks';
import { Button, Card, Txt } from '@/ui/components/core';
import { CardFace } from '@/ui/components/CardFace';
import { toast } from '@/ui/components/feedback';
import { AmountField, DayOfMonthField, Field, SwitchRow, TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { space } from '@/ui/theme';

export default function CardForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useTable('cards').find((c) => c.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [last4, setLast4] = useState(existing?.last4 ?? '');
  const [statementDay, setStatementDay] = useState(existing?.statementDay ?? 15);
  const [dueDay, setDueDay] = useState(existing?.dueDay ?? 5);
  const [limit, setLimit] = useState<Paise | null>(existing?.creditLimit ?? null);
  const [color, setColor] = useState(existing?.color ?? CARD_COLORS[0]);
  const [scope, setScope] = useState<Scope>(existing?.scope ?? 'personal');
  const [saving, setSaving] = useState(false);

  const preview = cycleFor(todayYMD(), { statementDay, dueDay });

  const save = async () => {
    if (!name.trim()) return toast('Give the card a name, e.g. "HDFC Millennia"', { tone: 'error' });
    if (last4 && !/^\d{4}$/.test(last4)) return toast('Last 4 digits only — never the full number', { tone: 'error' });
    setSaving(true);
    const data = { name: name.trim(), last4: last4 || null, statementDay, dueDay, creditLimit: limit, color, scope };
    try {
      if (existing) await update('cards', existing.id, data);
      else await insert('cards', data);
      toast(existing ? 'Card updated' : 'Card added — purchases will be grouped by bill cycle', { tone: 'success' });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title={existing ? 'Edit card' : 'Add credit card'} back footer={<Button title="Save card" icon="checkmark" size="lg" onPress={save} loading={saving} />}>
      <CardFace name={name || 'Card name'} last4={last4 || null} color={color}>
        <Txt variant="small" style={{ color: 'rgba(255,255,255,0.8)' }}>
          This cycle: {formatDay(preview.start)} – {formatDay(preview.statementDate)} · pay by {formatDay(preview.dueDate)}
        </Txt>
      </CardFace>
      <TextField label="Card name" value={name} onChangeText={setName} placeholder="HDFC Millennia, SBI SimplyCLICK…" />
      <TextField label="Last 4 digits (optional)" hint="Matches bank SMS automatically" value={last4} onChangeText={(v) => setLast4(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" maxLength={4} />
      <DayOfMonthField label="Statement (bill generation) day" value={statementDay} onChange={setStatementDay} />
      <DayOfMonthField label="Payment due day" value={dueDay} onChange={setDueDay} />
      <Card tone="alt">
        <Txt variant="small" tone="muted">
          Purchases up to the {statementDay}
          {suffix(statementDay)} go on this month's bill. Anything after goes on the next one. Find both days on your card statement.
        </Txt>
      </Card>
      <AmountField label="Credit limit (optional)" value={limit} onChange={setLimit} hint="For utilisation %" />
      <Field label="Colour">
        <View style={{ flexDirection: 'row', gap: space(1.25) }}>
          {CARD_COLORS.map((c) => (
            <Pressable key={c} onPress={() => setColor(c)} accessibilityRole="button" accessibilityLabel={`Colour ${c}`} accessibilityState={{ selected: color === c }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: '#A5B4FC' }} />
          ))}
        </View>
      </Field>
      <SwitchRow icon="people-outline" label="Share with family" description="Card bills show on family phones when synced" value={scope === 'household'} onChange={(v) => setScope(v ? 'household' : 'personal')} />
    </Screen>
  );
}

const suffix = (d: number) => (d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th');
