import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { billerMeta } from '@/domain/bills';
import { buildCardLedger } from '@/domain/creditCard';
import type { DueItem } from '@/domain/dues';
import { formatDay, relativeDay, todayYMD, type YMD } from '@/domain/dates';
import { formatINR, type Paise } from '@/domain/money';
import type { PayMethod } from '@/domain/types';
import { markDuePaid } from '@/data/actions';
import { useDues, useTable, useToday } from '@/data/hooks';
import { isValidUpiId, openUpi } from '@/services/upi';
import { Button, Card, Chip, EmptyState, IconCircle, Money, Row, Txt, type IconName } from '@/ui/components/core';
import { Sheet, toast } from '@/ui/components/feedback';
import { AmountField, ChipSelect, DateField, TextField } from '@/ui/components/forms';
import { stateTone } from '@/ui/components/rows';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

export default function Pay() {
  const { colors } = useTheme();
  const { due: dueKey, upi } = useLocalSearchParams<{ due: string; upi?: string }>();
  const dues = useDues(400);
  const today = useToday();
  const accounts = useTable('accounts');
  const cards = useTable('cards');
  const txns = useTable('transactions');
  const overrides = useTable('card_overrides');
  const billers = useTable('billers');
  const due = useMemo<DueItem | undefined>(() => {
    const found = dues.find((d) => d.key === dueKey);
    if (found || !dueKey?.startsWith('biller:')) return found;
    // Ad-hoc prepaid recharge / LPG booking that isn't due yet.
    const b = billers.find((x) => x.id === dueKey.slice(7));
    if (!b) return undefined;
    const meta = billerMeta(b.type);
    return {
      key: dueKey,
      kind: b.amountMode === 'prepaid' ? 'prepaid' : 'lpg',
      title: `${b.name} ${b.amountMode === 'prepaid' ? 'recharge' : 'booking'}`,
      subtitle: b.amountMode === 'prepaid' && b.validityDays ? `Adds ${b.validityDays} days of validity` : meta.label,
      amount: b.fixedAmount,
      date: today,
      state: 'due',
      href: `/biller/${b.id}`,
      link: { type: 'biller', id: b.id },
      upiId: b.upiId,
      icon: meta.icon,
      incoming: false,
    };
  }, [dues, dueKey, billers, today]);

  const cardOptions = useMemo(() => {
    if (due?.link?.type !== 'card') return null;
    const card = cards.find((c) => c.id === due.link!.id);
    if (!card) return null;
    const unpaid = buildCardLedger(card, txns, overrides, today).cycles.filter((c) => c.status !== 'unbilled' && c.remaining > 0);
    if (!unpaid.length) return null;
    return { total: unpaid.reduce((a, c) => a + c.remaining, 0), min: unpaid.reduce((a, c) => a + Math.min(c.minDue, c.remaining), 0) };
  }, [due, cards, txns, overrides, today]);

  const [amount, setAmount] = useState<Paise | null>(due?.amount ?? null);
  const [method, setMethod] = useState<PayMethod>(due?.link?.type === 'card' ? 'bank' : 'upi');
  const [accountId, setAccountId] = useState<string | null>(accounts.length === 1 ? accounts[0].id : null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [date, setDate] = useState<YMD>(today);
  const [upiId, setUpiId] = useState(due?.upiId ?? '');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const awaitingUpi = useRef(false);
  const [amountKey, setAmountKey] = useState(0);

  // UPI apps don't reliably report success back, so ask when the user returns.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && awaitingUpi.current) {
        awaitingUpi.current = false;
        setConfirming(true);
      }
    });
    return () => sub.remove();
  }, []);

  if (!due) {
    return (
      <Screen title="Pay" back>
        <EmptyState icon="checkmark-circle-outline" title="Nothing to pay" body="This due was already paid or no longer exists." action="Go to Dues" onAction={() => router.replace('/dues')} />
      </Screen>
    );
  }

  const record = async () => {
    if (!amount) return toast('Enter the amount paid', { tone: 'error' });
    setSaving(true);
    try {
      await markDuePaid(due, { amount, date, method, accountId, cardId, sourceRef: null });
      toast(`${due.incoming ? 'Received' : 'Paid'} ${formatINR(amount)} · ${due.title}`, { tone: 'success' });
      router.back();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const payUpi = async () => {
    if (!isValidUpiId(upiId)) return toast('Enter a valid UPI ID like name@okbank', { tone: 'error' });
    const ok = await openUpi({ upiId, name: due.title, amount, note: due.title });
    if (!ok) return toast('No UPI app found on this phone', { tone: 'error' });
    awaitingUpi.current = true;
    setMethod('upi');
  };

  const canUpi = !due.incoming && due.link?.type !== 'card';

  return (
    <Screen
      title={due.incoming ? 'Mark received' : 'Pay'}
      back
      footer={
        <View style={{ gap: space(1) }}>
          {canUpi ? <Button title={`Pay ${amount ? formatINR(amount) : ''} via UPI app`} icon="open-outline" size="lg" onPress={payUpi} /> : null}
          <Button title={due.incoming ? 'Mark as received' : 'Already paid — record it'} icon="checkmark" variant={canUpi ? 'secondary' : 'primary'} size="lg" onPress={record} loading={saving} />
        </View>
      }
    >
      <Card style={{ gap: space(1.25) }}>
        <Row gap={1.5}>
          <IconCircle name={due.icon as IconName} color={due.state === 'overdue' ? colors.expense : colors.primary} />
          <View style={{ flex: 1 }}>
            <Txt variant="h3">{due.title}</Txt>
            <Txt variant="small" tone={stateTone(due)}>
              {due.state === 'overdue' ? 'Overdue since' : 'Due'} {formatDay(due.date, { year: true })} · {relativeDay(due.date, todayYMD())}
            </Txt>
          </View>
        </Row>
        {due.amount ? <Money value={due.amount} variant="h1" /> : null}
        <Txt variant="small" tone="muted">
          {due.subtitle}
        </Txt>
      </Card>

      {cardOptions ? (
        <Row gap={1} wrap>
          <Chip label={`Total ${formatINR(cardOptions.total)}`} selected={amount === cardOptions.total} onPress={() => (setAmount(cardOptions.total), setAmountKey((k) => k + 1))} />
          <Chip label={`Minimum ${formatINR(cardOptions.min)}`} selected={amount === cardOptions.min} onPress={() => (setAmount(cardOptions.min), setAmountKey((k) => k + 1))} />
        </Row>
      ) : null}
      {cardOptions && amount !== null && amount < cardOptions.total ? (
        <Txt variant="small" tone="warn">
          Paying less than the total means interest (often 36–42% a year) on the whole balance, including new purchases.
        </Txt>
      ) : null}

      <AmountField key={amountKey} label={due.incoming ? 'Amount received' : 'Amount paid'} value={amount} onChange={setAmount} />
      <ChipSelect
        label="Paid with"
        value={method}
        onChange={(v) => v && setMethod(v)}
        options={(
          [
            { value: 'upi', label: 'UPI' },
            { value: 'bank', label: 'Net banking' },
            { value: 'card', label: 'Credit card' },
            { value: 'cash', label: 'Cash' },
            { value: 'wallet', label: 'Wallet' },
          ] as { value: PayMethod; label: string }[]
        ).filter((m) => !(due.link?.type === 'card' && m.value === 'card'))}
      />
      {method === 'card' && cards.length ? <ChipSelect label="Which card?" value={cardId} onChange={setCardId} options={cards.map((c) => ({ value: c.id, label: c.name }))} /> : null}
      {method !== 'card' && accounts.length ? <ChipSelect label="From account" value={accountId} onChange={setAccountId} allowNone options={accounts.map((a) => ({ value: a.id, label: a.name }))} /> : null}
      <DateField label="Paid on" value={date} onChange={setDate} />
      {canUpi ? <TextField label="Payee UPI ID" value={upiId} onChangeText={setUpiId} placeholder="biller@okhdfc" autoCapitalize="none" icon="at" hint="Saved on the bill / loan" /> : null}

      <Sheet visible={confirming} onClose={() => setConfirming(false)} title="Did the payment go through?">
        <Txt tone="muted">UPI apps don't tell us the result. Check your UPI app or bank SMS.</Txt>
        <Button
          title={`Yes, record ${amount ? formatINR(amount) : 'payment'}`}
          variant="success"
          icon="checkmark"
          onPress={() => {
            setConfirming(false);
            record();
          }}
        />
        <Button title="No, it failed" variant="secondary" onPress={() => setConfirming(false)} />
      </Sheet>
      {upi ? <Txt variant="small" tone="faint">Opened from reminder</Txt> : null}
    </Screen>
  );
}
