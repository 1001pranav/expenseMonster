import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { addMonths, todayYMD, type YMD } from '@/domain/dates';
import { amortization, calcEmi } from '@/domain/emi';
import { formatINR, type Paise } from '@/domain/money';
import type { InterestType, LoanDirection, LoanKind, Scope } from '@/domain/types';
import { insert, update } from '@/db/repo';
import { useMembers, useTable } from '@/data/hooks';
import { Button, Card, Chip, Row, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { AmountField, ChipSelect, DateField, Field, Segmented, SwitchRow, TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { space } from '@/ui/theme';

const KINDS: { value: LoanKind; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'car', label: 'Vehicle' },
  { value: 'personal', label: 'Personal' },
  { value: 'education', label: 'Education' },
  { value: 'gold', label: 'Gold' },
  { value: 'business', label: 'Business' },
  { value: 'informal', label: 'Friends / family' },
  { value: 'other', label: 'Other' },
];
const TENURES = [6, 12, 24, 36, 60, 84, 120, 180, 240];

export default function LoanForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useTable('loans').find((l) => l.id === id);
  const members = useMembers();

  const [name, setName] = useState(existing?.name ?? '');
  const [direction, setDirection] = useState<LoanDirection>(existing?.direction ?? 'borrowed');
  const [kind, setKind] = useState<LoanKind>(existing?.kind ?? 'home');
  const [lender, setLender] = useState(existing?.lender ?? '');
  const [memberId, setMemberId] = useState<string | null>(existing?.memberId ?? null);
  const [principal, setPrincipal] = useState<Paise | null>(existing?.principal ?? null);
  const [rate, setRate] = useState(existing ? String(existing.ratePa) : '');
  const [interestType, setInterestType] = useState<InterestType>(existing?.interestType ?? 'reducing');
  const [tenure, setTenure] = useState(existing?.tenureMonths ?? 60);
  const [tenureText, setTenureText] = useState(existing ? String(existing.tenureMonths) : '60');
  const [firstEmi, setFirstEmi] = useState<YMD>(existing?.firstEmiDate ?? addMonths(todayYMD(), 1));
  const [emiOverride, setEmiOverride] = useState<Paise | null>(existing?.emi ?? null);
  const [paidBefore, setPaidBefore] = useState<number | null>(existing?.paidBeforeTracking ?? null);
  const [upiId, setUpiId] = useState(existing?.upiId ?? '');
  const [scope, setScope] = useState<Scope>(existing?.scope ?? 'household');
  const [saving, setSaving] = useState(false);

  const ratePa = Number(rate) || 0;
  const computedEmi = principal ? calcEmi(principal, ratePa, tenure, interestType) : 0;
  const emi = emiOverride ?? computedEmi;
  const schedule = useMemo(() => (principal ? amortization(principal, ratePa, tenure, firstEmi, emi, interestType) : []), [principal, ratePa, tenure, firstEmi, emi, interestType]);
  const pastDue = schedule.filter((r) => r.date < todayYMD()).length;
  const totalInterest = schedule.reduce((a, r) => a + r.interest, 0);
  const paid = paidBefore ?? (existing ? existing.paidBeforeTracking : pastDue);

  const save = async () => {
    if (!name.trim()) return toast('Give the loan a name', { tone: 'error' });
    if (!principal) return toast('Enter the loan amount', { tone: 'error' });
    if (!tenure) return toast('Enter the tenure', { tone: 'error' });
    setSaving(true);
    const data = {
      name: name.trim(),
      direction,
      kind,
      lender: lender.trim() || null,
      memberId,
      principal,
      ratePa,
      interestType: ratePa ? interestType : ('none' as InterestType),
      tenureMonths: tenure,
      firstEmiDate: firstEmi,
      emi,
      paidBeforeTracking: paid,
      closed: 0 as const,
      upiId: upiId.trim() || null,
      note: null,
      scope,
    };
    try {
      if (existing) await update('loans', existing.id, data);
      else await insert('loans', data);
      toast(existing ? 'Loan updated' : 'Loan added — EMI reminders are on', { tone: 'success' });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title={existing ? 'Edit loan' : 'Add loan'} back footer={<Button title="Save loan" icon="checkmark" size="lg" onPress={save} loading={saving} />}>
      <Segmented
        value={direction}
        onChange={(v) => {
          setDirection(v);
          if (v === 'lent') setKind('informal');
        }}
        options={[
          { value: 'borrowed', label: 'I borrowed' },
          { value: 'lent', label: 'I lent' },
        ]}
      />
      <TextField label="Name" value={name} onChangeText={setName} placeholder={direction === 'lent' ? 'Loan to Ravi' : 'SBI Home Loan'} />
      <ChipSelect label="Type" value={kind} onChange={(v) => v && setKind(v)} options={KINDS} />
      {direction === 'lent' && members.length ? (
        <ChipSelect label="Lent to (member)" value={memberId} onChange={setMemberId} allowNone options={members.map((m) => ({ value: m.id, label: m.name, color: m.color }))} />
      ) : null}
      <TextField label={direction === 'lent' ? 'Borrower' : 'Lender'} value={lender} onChangeText={setLender} placeholder={direction === 'lent' ? 'Name' : 'Bank / NBFC / person'} />
      <AmountField label="Loan amount" value={principal} onChange={setPrincipal} />
      <Row gap={1.5} style={{ alignItems: 'flex-start' }}>
        <TextField label="Interest % per year" value={rate} onChangeText={(v) => setRate(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="8.5" />
      </Row>
      {ratePa > 0 ? (
        <ChipSelect
          label="Interest method"
          value={interestType}
          onChange={(v) => v && setInterestType(v)}
          options={[
            { value: 'reducing', label: 'Reducing balance (banks)' },
            { value: 'flat', label: 'Flat rate' },
          ]}
        />
      ) : null}
      <Field label="Tenure" hint={`${Math.floor(tenure / 12)}y ${tenure % 12}m`}>
        <Row gap={1} wrap>
          {TENURES.map((t) => (
            <Chip
              key={t}
              compact
              label={t < 12 ? `${t}m` : `${t / 12}y`}
              selected={tenure === t}
              onPress={() => {
                setTenure(t);
                setTenureText(String(t));
                setEmiOverride(null);
              }}
            />
          ))}
        </Row>
      </Field>
      <TextField
        label="Tenure in months"
        value={tenureText}
        keyboardType="number-pad"
        onChangeText={(v) => {
          setTenureText(v.replace(/\D/g, ''));
          setTenure(Math.min(Number(v.replace(/\D/g, '')) || 0, 480));
          setEmiOverride(null);
        }}
      />
      <DateField label="First EMI date" value={firstEmi} onChange={setFirstEmi} quick={false} />

      {principal ? (
        <Card tone="alt" style={{ gap: space(1) }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt tone="muted">EMI</Txt>
            <Txt variant="h3">{formatINR(emi)}</Txt>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt tone="muted">Total interest</Txt>
            <Txt variant="bodyStrong">{formatINR(totalInterest)}</Txt>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt tone="muted">Total payable</Txt>
            <Txt variant="bodyStrong">{formatINR(principal + totalInterest)}</Txt>
          </Row>
        </Card>
      ) : null}
      <AmountField label="EMI (if your bank's figure differs)" value={emiOverride} onChange={setEmiOverride} placeholder={computedEmi ? String(computedEmi / 100) : '0'} />
      {schedule.length ? (
        <Field label="EMIs already paid" hint={pastDue ? `${pastDue} were due before today` : undefined}>
          <TextField value={String(paid)} keyboardType="number-pad" onChangeText={(v) => setPaidBefore(Math.min(Number(v.replace(/\D/g, '')) || 0, schedule.length))} />
        </Field>
      ) : null}
      <TextField label="Lender UPI ID (optional)" value={upiId} onChangeText={setUpiId} placeholder="for one-tap EMI payment" autoCapitalize="none" icon="at" />
      <SwitchRow icon="lock-closed-outline" label="Keep private" description="Don't share this loan with family phones" value={scope === 'personal'} onChange={(v) => setScope(v ? 'personal' : 'household')} />
    </Screen>
  );
}
