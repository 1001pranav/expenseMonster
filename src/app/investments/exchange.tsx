import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { ASSET_CLASSES, defaultHoldingName, formatQuantity, parseQuantity, summarizeHoldings } from '@/domain/investments';
import { formatINR, parseAmount, type Paise } from '@/domain/money';
import type { PayMethod, Scope } from '@/domain/types';
import { saveExchange } from '@/data/investments';
import { useMembers, useSelfId, useTable, useToday } from '@/data/hooks';
import { Button, Card, Row, Txt, type IconName } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { ChipSelect, DateField, SwitchRow, TextField } from '@/ui/components/forms';
import { Screen, goBack } from '@/ui/components/Screen';
import { space } from '@/ui/theme';

const money = (text: string): Paise => (text.trim() ? parseAmount(text) : 0) ?? 0;
/** Null when not entered: unknown, not zero. */
const entered = (text: string): Paise | null => (text.trim() ? parseAmount(text) || null : null);
/** Grams; more than 3 decimals rounded. Null when not entered. */
const grams3 = (text: string): number | null => {
  const t = text.trim().replace(/,/g, '');
  return t && Number.isFinite(Number(t)) ? (parseQuantity(t) ?? Math.round(Number(t) * 1000)) || null : null;
};

/**
 * Old gold or silver traded in for a new piece (docs/INVESTMENTS_PLAN.md §3a): the old piece is
 * sold for the value the jeweller gave, the new one bought at its full price, and only the
 * difference is paid (or received).
 */
export default function Exchange() {
  const params = useLocalSearchParams<{ holdingId?: string }>();
  const today = useToday();
  const holdings = useTable('holdings');
  const trades = useTable('trades');
  const txns = useTable('transactions');
  const accounts = useTable('accounts');
  const cards = useTable('cards');
  const members = useMembers();
  const selfId = useSelfId();

  const tradeable = useMemo(
    () => summarizeHoldings(holdings, trades, txns).filter((s) => !s.soldOut && (s.holding.assetClass === 'gold' || s.holding.assetClass === 'silver') && s.holding.unit === 'g' && s.holding.form !== 'sgb'),
    [holdings, trades, txns],
  );
  const [oldId, setOldId] = useState<string | null>(params.holdingId ?? tradeable[0]?.holding.id ?? null);
  const old = tradeable.find((s) => s.holding.id === oldId);
  const [all, setAll] = useState(true);
  const [oldGrams, setOldGrams] = useState('');
  const [oldValue, setOldValue] = useState('');
  const [deductions, setDeductions] = useState('');

  const metal = old?.holding.assetClass ?? 'gold';
  const meta = ASSET_CLASSES[metal];
  const [purity, setPurity] = useState<string | null>(old?.holding.purity ?? meta.purities[0]?.value ?? null);
  const [name, setName] = useState('');
  const [owner, setOwner] = useState<string>(old?.holding.memberId ?? '');
  const [grams, setGrams] = useState('');
  const [newTotal, setNewTotal] = useState('');
  const [making, setMaking] = useState('');
  const [gst, setGst] = useState('');

  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<PayMethod>('upi');
  const [accountId, setAccountId] = useState<string | null>(accounts.length === 1 ? accounts[0].id : null);
  const [cardId, setCardId] = useState<string | null>(cards.length === 1 ? cards[0].id : null);
  const [note, setNote] = useState('');
  const [scope, setScope] = useState<Scope>(old?.holding.scope ?? 'household');
  const [saving, setSaving] = useState(false);

  // Known only when both figures were entered.
  const difference = entered(newTotal) !== null && entered(oldValue) !== null ? money(newTotal) - money(oldValue) : null;

  const save = async () => {
    if (!old) return toast('Pick the piece you traded in', { tone: 'error' });
    // Nothing else is mandatory. Grams of the old piece left blank: all of it.
    const oldQty = all ? null : grams3(oldGrams);
    const newQty = grams3(grams);
    setSaving(true);
    try {
      await saveExchange({
        date,
        old: { holdingId: old.holding.id, quantity: oldQty, value: entered(oldValue), deductions: money(deductions) },
        buy: {
          holding: { assetClass: metal, form: 'jewellery', fundType: null, name: name.trim() || defaultHoldingName(metal, 'jewellery', purity), symbol: null, unit: 'g', purity, memberId: owner || null },
          amount: entered(newTotal),
          quantity: newQty,
          unitPrice: null,
          charges: money(making),
          taxes: money(gst),
          refRate: null,
        },
        pay: { method, accountId, cardId },
        note: note.trim() || null,
        scope,
      });
      toast(
        difference === null
          ? 'Exchange saved. Add the missing amounts later to see the gain and what was paid.'
          : difference > 0
            ? `Exchange saved: ${formatINR(difference)} paid`
            : difference < 0
              ? `Exchange saved: ${formatINR(-difference)} received`
              : 'Exchange saved',
        { tone: 'success' },
      );
      goBack();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!tradeable.length) {
    return (
      <Screen title="Trade in jewellery" back>
        <Card>
          <Txt tone="muted">Record the old gold or silver first (Invest / sell → Buy). It can then be traded in here.</Txt>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Trade in jewellery" subtitle="Old piece in, new piece out" back footer={<Button title="Save exchange" icon="checkmark" size="lg" onPress={save} loading={saving} />}>
      <Txt variant="bodyStrong">Traded in</Txt>
      <ChipSelect
        label="Old piece"
        value={oldId}
        onChange={(v) => {
          const next = tradeable.find((s) => s.holding.id === v)?.holding;
          if (!next) return;
          setOldId(next.id);
          // The new piece is usually the same metal and purity, for the same person.
          setPurity(next.purity ?? ASSET_CLASSES[next.assetClass].purities[0]?.value ?? null);
          setOwner(next.memberId ?? '');
        }}
        options={tradeable.map((s) => ({ value: s.holding.id, label: s.holding.name }))}
      />
      {old ? (
        <Txt variant="small" tone="muted">
          Held: {old.quantityComplete ? formatQuantity(old.quantity, 'g') : 'weight not recorded'} · cost {formatINR(old.invested)}
        </Txt>
      ) : null}
      <SwitchRow label="All of it" value={all} onChange={setAll} />
      {!all ? <TextField label="Grams traded in" value={oldGrams} onChangeText={setOldGrams} keyboardType="decimal-pad" /> : null}
      <Row gap={1} style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <TextField label="Value given for it" value={oldValue} onChangeText={setOldValue} keyboardType="decimal-pad" placeholder="₹" hint="After deductions" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Deductions" value={deductions} onChangeText={setDeductions} keyboardType="decimal-pad" placeholder="Optional" hint="Wastage, melting" />
        </View>
      </Row>

      <Txt variant="bodyStrong" style={{ marginTop: space(1) }}>
        New piece
      </Txt>
      <ChipSelect label="Purity" value={purity} onChange={setPurity} options={meta.purities} />
      <TextField label="Name" value={name} onChangeText={setName} placeholder={defaultHoldingName(metal, 'jewellery', purity)} />
      {members.length > 1 ? (
        <ChipSelect label="Whose" value={owner} onChange={(v) => setOwner(v ?? '')} options={[{ value: '', label: 'Joint' }, ...members.map((m) => ({ value: m.id, label: m.id === selfId ? 'Mine' : m.name, color: m.color }))]} />
      ) : null}
      <Row gap={1} style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <TextField label="Grams" value={grams} onChangeText={setGrams} keyboardType="decimal-pad" placeholder="Optional" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Full price" value={newTotal} onChangeText={setNewTotal} keyboardType="decimal-pad" placeholder="₹" hint="Making and GST included" />
        </View>
      </Row>
      <Row gap={1} style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <TextField label="Making charges" value={making} onChangeText={setMaking} keyboardType="decimal-pad" placeholder="Optional" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="GST" value={gst} onChangeText={setGst} keyboardType="decimal-pad" placeholder="Optional" />
        </View>
      </Row>

      <Card tone="alt" style={{ gap: 4 }}>
        <Txt variant="small" tone="muted">
          Difference
        </Txt>
        <Txt variant="h3">{difference === null ? 'Enter both amounts to see it' : difference > 0 ? `You pay ${formatINR(difference)}` : difference < 0 ? `You receive ${formatINR(-difference)}` : 'Even exchange'}</Txt>
        <Txt variant="small" tone="muted">
          Only this moves as money. The new piece's cost is its full price; the old piece's gain or loss is worked out from what it cost.
        </Txt>
      </Card>

      <DateField label="Date" value={date} onChange={setDate} allowFuture={false} />
      {difference ? (
        <>
          <ChipSelect
            label={difference > 0 ? 'Paid with' : 'Received in'}
            value={method}
            onChange={(v) => v && setMethod(v)}
            options={[
              { value: 'upi', label: 'UPI', icon: 'qr-code' as IconName },
              { value: 'bank', label: 'Bank', icon: 'business' as IconName },
              ...(difference > 0 ? [{ value: 'card' as PayMethod, label: 'Credit card', icon: 'card' as IconName }] : []),
              { value: 'cash', label: 'Cash', icon: 'cash' as IconName },
            ]}
          />
          {method === 'card' && difference > 0 && cards.length ? (
            <ChipSelect label="Which card?" value={cardId} onChange={setCardId} options={cards.map((c) => ({ value: c.id, label: `${c.name}${c.last4 ? ` ••${c.last4}` : ''}` }))} />
          ) : accounts.length && method !== 'card' ? (
            <ChipSelect label="Account" value={accountId} onChange={setAccountId} allowNone options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          ) : null}
        </>
      ) : null}
      <TextField label="Note" value={note} onChangeText={setNote} placeholder="Jeweller, bill number…" multiline />
      <SwitchRow icon="lock-closed-outline" label="Keep private" description="Private entries never leave this phone when syncing with family" value={scope === 'personal'} onChange={(v) => setScope(v ? 'personal' : 'household')} />
    </Screen>
  );
}
