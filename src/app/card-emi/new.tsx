import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { emiQuote } from '@/domain/cardEmi';
import { statementDateFor } from '@/domain/creditCard';
import { isoToYMD, type YMD } from '@/domain/dates';
import { calcEmi } from '@/domain/emi';
import type { Paise } from '@/domain/money';
import { insert, update } from '@/db/repo';
import { useTable, useToday } from '@/data/hooks';
import { Button, Card, Chip, Money, Row, Txt, useMoneyText } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { AmountField, ChipSelect, DateField, Field, SwitchRow, TextField } from '@/ui/components/forms';
import { Screen, goBack } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

const TENURES = [3, 6, 9, 12, 18, 24];

/**
 * Turn a card purchase into EMIs (or add a plan that already exists). The purchase leaves its
 * statement and each instalment is billed on the card; there's no separate EMI reminder.
 */
export default function CardEmiForm() {
  const params = useLocalSearchParams<{ txn?: string; cardId?: string; id?: string }>();
  const { colors } = useTheme();
  const money = useMoneyText();
  const today = useToday();
  const cards = useTable('cards');
  const loans = useTable('loans');
  const txns = useTable('transactions');
  const existing = loans.find((l) => l.id === params.id);
  const source = txns.find((t) => t.id === (existing?.sourceTxnId ?? params.txn));

  const [cardId, setCardId] = useState<string | null>(existing?.cardId ?? source?.cardId ?? params.cardId ?? (cards.length === 1 ? cards[0].id : null));
  const card = cards.find((c) => c.id === cardId);
  const [name, setName] = useState(existing?.name ?? source?.payee ?? '');
  const [amount, setAmount] = useState<Paise | null>(existing?.principal ?? source?.amount ?? null);
  const [months, setMonths] = useState(existing?.tenureMonths ?? 6);
  const [noCost, setNoCost] = useState(existing ? existing.ratePa === 0 : true);
  const [rate, setRate] = useState(existing && existing.ratePa ? String(existing.ratePa) : '15');
  const [fee, setFee] = useState<Paise | null>(existing?.processingFee ?? 199_00);
  const purchaseDay = source ? isoToYMD(source.occurredAt) : today;
  const [first, setFirst] = useState<YMD>(existing?.firstEmiDate ?? (card ? statementDateFor(purchaseDay, card.statementDay) : today));
  const [saving, setSaving] = useState(false);

  const ratePa = noCost ? 0 : Number(rate) || 0;
  const quote = useMemo(() => emiQuote(amount ?? 0, ratePa, months, fee ?? 0), [amount, ratePa, months, fee]);

  const save = async () => {
    if (!card) return toast('Pick the card the EMI is on', { tone: 'error' });
    if (!amount) return toast('Enter the amount converted to EMI', { tone: 'error' });
    setSaving(true);
    const data = {
      name: name.trim() || `${card.name} EMI`,
      direction: 'borrowed' as const,
      kind: 'card_emi' as const,
      lender: card.name,
      memberId: null,
      principal: amount,
      ratePa,
      interestType: ratePa ? ('reducing' as const) : ('none' as const),
      tenureMonths: months,
      firstEmiDate: first,
      emi: calcEmi(amount, ratePa, months, ratePa ? 'reducing' : 'none'),
      paidBeforeTracking: 0,
      closed: 0 as const,
      upiId: null,
      note: null,
      cardId: card.id,
      sourceTxnId: existing?.sourceTxnId ?? source?.id ?? null,
      processingFee: fee ?? 0,
      scope: card.scope,
    };
    try {
      if (existing) await update('loans', existing.id, data);
      else await insert('loans', data);
      toast(existing ? 'EMI plan updated' : `${months} EMIs added to ${card.name}`, { tone: 'success' });
      goBack();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title={existing ? 'Edit EMI plan' : 'Pay in EMIs'} subtitle={source ? `${source.payee ?? 'Purchase'}, ${money(source.amount)}` : 'An EMI on a credit card'} back footer={<Button title={existing ? 'Save plan' : 'Convert to EMIs'} icon="checkmark" size="lg" onPress={save} loading={saving} />}>
      {!source ? (
        cards.length ? (
          <ChipSelect label="Card" value={cardId} onChange={setCardId} options={cards.map((c) => ({ value: c.id, label: `${c.name}${c.last4 ? ` ••${c.last4}` : ''}`, icon: 'card' }))} />
        ) : (
          <Button title="Add a credit card first" icon="add" variant="secondary" onPress={() => router.push('/card/new')} />
        )
      ) : null}
      <TextField label="What was bought" value={name} onChangeText={setName} placeholder="Phone from Croma" />
      <AmountField key={existing?.id ?? source?.id ?? 'new'} label="Amount on EMI" value={amount} onChange={setAmount} />
      <Field label="Number of months">
        <Row gap={1} wrap>
          {TENURES.map((m) => (
            <Chip key={m} label={`${m}`} selected={months === m} onPress={() => setMonths(m)} />
          ))}
        </Row>
      </Field>
      <SwitchRow icon="pricetag-outline" label="No-cost EMI" description="The shop or bank covers the interest" value={noCost} onChange={setNoCost} />
      {!noCost ? <TextField label="Interest, % a year" value={rate} onChangeText={(v) => setRate(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" /> : null}
      <AmountField label="Processing fee (one time)" value={fee} onChange={setFee} hint="Often ₹99 to ₹299" />
      <DateField label="First instalment on" value={first} onChange={setFirst} quick={false} />

      {amount ? (
        <Card style={{ gap: space(1) }}>
          <Txt variant="small" tone="muted">
            Each month on your {card?.name ?? 'card'} bill
          </Txt>
          <Money value={quote.monthly} variant="h1" decimals="never" />
          <Txt variant="small" tone="muted">
            for {months} months. The first bill also has the {money(quote.fee)} fee and GST on it.
          </Txt>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space(0.5) }} />
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="small" tone="muted">
              Costs you beyond the price
            </Txt>
            <Money value={quote.extra} variant="bodyStrong" tone={quote.extra ? 'expense' : 'default'} />
          </Row>
          <Txt variant="small" tone="muted">
            {noCost
              ? 'Banks usually still add 18% GST on the interest they discount on a no-cost EMI. If your statement shows it, enter the exact statement amount on the card screen.'
              : `Includes ${money(quote.interest)} interest and ${money(quote.gst)} GST.`}
          </Txt>
        </Card>
      ) : null}
      <Txt variant="small" tone="muted">
        The purchase moves off its statement and each instalment shows on the card's bill, so there is no separate EMI reminder. Your spending still counts in the month you bought it.
      </Txt>
    </Screen>
  );
}
