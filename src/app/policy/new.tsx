import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { addMonths, todayYMD, type YMD } from '@/domain/dates';
import type { Paise } from '@/domain/money';
import { FREQUENCY_LABEL } from '@/domain/recurrence';
import { parseIds } from '@/domain/settle';
import type { Frequency, PolicyType, Scope } from '@/domain/types';
import { insert, update } from '@/db/repo';
import { useMembers, useTable } from '@/data/hooks';
import { Button, Chip } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { AmountField, ChipSelect, DateField, Field, SwitchRow, TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';

const TYPES: { value: PolicyType; label: string }[] = [
  { value: 'health', label: 'Health' },
  { value: 'term', label: 'Term life' },
  { value: 'life', label: 'Life / endowment' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'home', label: 'Home' },
  { value: 'other', label: 'Other' },
];

export default function PolicyForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useTable('policies').find((p) => p.id === id);
  const members = useMembers();
  const [type, setType] = useState<PolicyType>(existing?.type ?? 'health');
  const [name, setName] = useState(existing?.name ?? '');
  const [insurer, setInsurer] = useState(existing?.insurer ?? '');
  const [policyNo, setPolicyNo] = useState(existing?.policyNo ?? '');
  const [sumAssured, setSumAssured] = useState<Paise | null>(existing?.sumAssured ?? null);
  const [premium, setPremium] = useState<Paise | null>(existing?.premium ?? null);
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? 'yearly');
  const [nextDue, setNextDue] = useState<YMD>(existing?.nextDueDate ?? addMonths(todayYMD(), 1));
  const [covered, setCovered] = useState<string[]>(parseIds(existing?.coveredMemberIds ?? null));
  const [nominee, setNominee] = useState(existing?.nominee ?? '');
  const [autopay, setAutopay] = useState(Boolean(existing?.autopay));
  const [scope, setScope] = useState<Scope>(existing?.scope ?? 'household');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!insurer.trim()) return toast('Enter the insurer', { tone: 'error' });
    if (!premium) return toast('Enter the premium', { tone: 'error' });
    setSaving(true);
    const data = {
      type,
      name: name.trim() || `${TYPES.find((t) => t.value === type)?.label} – ${insurer.trim()}`,
      insurer: insurer.trim(),
      policyNo: policyNo.trim() || null,
      sumAssured,
      premium,
      frequency,
      nextDueDate: nextDue,
      endDate: null,
      coveredMemberIds: covered.length ? JSON.stringify(covered) : null,
      nominee: nominee.trim() || null,
      autopay: autopay ? (1 as const) : (0 as const),
      active: 1 as const,
      scope,
    };
    try {
      if (existing) await update('policies', existing.id, data);
      else await insert('policies', data);
      toast('Policy saved — renewal alerts 30, 7 and 1 day before', { tone: 'success' });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title={existing ? 'Edit policy' : 'Add insurance'} back footer={<Button title="Save policy" icon="checkmark" size="lg" onPress={save} loading={saving} />}>
      <ChipSelect label="Type" value={type} onChange={(v) => v && setType(v)} options={TYPES} wrap />
      <TextField label="Insurer" value={insurer} onChangeText={setInsurer} placeholder="LIC, Star Health, HDFC Ergo…" />
      <TextField label="Name (optional)" value={name} onChangeText={setName} placeholder="Family floater" />
      <TextField label="Policy number" value={policyNo} onChangeText={setPolicyNo} autoCapitalize="characters" />
      <AmountField label="Premium" value={premium} onChange={setPremium} />
      <ChipSelect label="Premium frequency" value={frequency} onChange={(v) => v && setFrequency(v)} options={(Object.keys(FREQUENCY_LABEL) as Frequency[]).filter((f) => f !== 'bimonthly').map((f) => ({ value: f, label: FREQUENCY_LABEL[f] }))} />
      <DateField label="Next premium / renewal date" value={nextDue} onChange={setNextDue} quick={false} />
      <AmountField label={type === 'health' ? 'Sum insured' : 'Sum assured'} value={sumAssured} onChange={setSumAssured} />
      {members.length ? (
        <Field label="Covers">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {members.map((m) => (
              <Chip key={m.id} label={m.name} color={m.color} selected={covered.includes(m.id)} onPress={() => setCovered((c) => (c.includes(m.id) ? c.filter((x) => x !== m.id) : [...c, m.id]))} />
            ))}
          </View>
        </Field>
      ) : null}
      <TextField label="Nominee" value={nominee} onChangeText={setNominee} />
      <SwitchRow icon="repeat" label="Auto-debit" value={autopay} onChange={setAutopay} />
      <SwitchRow icon="lock-closed-outline" label="Keep private" value={scope === 'personal'} onChange={(v) => setScope(v ? 'personal' : 'household')} />
    </Screen>
  );
}
