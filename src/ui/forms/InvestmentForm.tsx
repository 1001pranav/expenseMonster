import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { addMonths, isoToYMD, toISO, type YMD } from '@/domain/dates';
import {
  ASSET_CLASSES,
  ASSET_ORDER,
  defaultHoldingName,
  derive,
  fieldToDerive,
  formatQuantity,
  ledger,
  liveTrades,
  parseQuantity,
  quantityText,
  summarizeHoldings,
  unitFor,
  unitLabel,
  type TradeField,
  type TradeNumbers,
} from '@/domain/investments';
import { formatINR, parseAmount, type Paise } from '@/domain/money';
import type { AssetClass, FundType, PayMethod, Scope, Trade } from '@/domain/types';
import { deleteInvestment, saveInvestment } from '@/data/investments';
import { saveTransaction } from '@/data/actions';
import { useMembers, useSelfId, useTable, useToday } from '@/data/hooks';
import { Button, Card, Chip, Row, Txt, type IconName } from '../components/core';
import { toast } from '../components/feedback';
import { ChipSelect, DateField, Field, Segmented, SwitchRow, TextField } from '../components/forms';
import { SchemePicker } from '../components/SchemePicker';
import { Screen, goBack } from '../components/Screen';
import { space } from '../theme';

const METHODS: { value: PayMethod; label: string; icon: IconName }[] = [
  { value: 'upi', label: 'UPI', icon: 'qr-code' },
  { value: 'bank', label: 'Bank', icon: 'business' },
  { value: 'card', label: 'Credit card', icon: 'card' },
  { value: 'cash', label: 'Cash', icon: 'cash' },
  { value: 'wallet', label: 'Wallet', icon: 'wallet' },
];

/** What jewellery is for: only an investment becomes a holding (docs/INVESTMENTS_PLAN.md §2). */
type Purpose = 'investment' | 'own' | 'gift';
/** How the money moved: all of it, part (the rest traded in), or none (a gift). */
type CashMode = 'full' | 'part' | 'none';

/** 123456 paise → "1234.56", for editing. */
const rupeesText = (p: Paise | null) => (p === null ? '' : String(p / 100));
const money = (text: string): Paise | null => (text.trim() ? parseAmount(text) : null);

export interface InvestmentFormProps {
  side?: Trade['side'];
  /** Edit this trade. */
  tradeId?: string;
  /** Buy more of, or sell from, this holding. */
  holdingId?: string;
  /** Turn this older expense (filed under Investments) into a purchase. */
  fromTxnId?: string;
  /** Carried over from the expense form ("Record as an investment"). */
  prefill?: { amount?: Paise; date?: YMD };
}

export function InvestmentForm({ side: initialSide = 'buy', tradeId, holdingId, fromTxnId, prefill }: InvestmentFormProps) {
  const today = useToday();
  const members = useMembers();
  const selfId = useSelfId();
  const holdings = useTable('holdings');
  const trades = useTable('trades');
  const txns = useTable('transactions');
  const accounts = useTable('accounts');
  const cards = useTable('cards');

  const existing = tradeId ? trades.find((t) => t.id === tradeId) : undefined;
  const existingTxn = existing?.txnId ? txns.find((t) => t.id === existing.txnId) : undefined;
  const fromTxn = fromTxnId ? txns.find((t) => t.id === fromTxnId) : undefined;
  const cashTxn = existingTxn ?? fromTxn;

  const [side, setSide] = useState<Trade['side']>(existing?.side ?? initialSide);
  const [holdingChoice, setHoldingChoice] = useState<string>(existing?.holdingId ?? holdingId ?? 'new');
  const chosen = holdings.find((h) => h.id === holdingChoice);
  const [assetClass, setAssetClass] = useState<AssetClass>(chosen?.assetClass ?? 'gold');
  const meta = ASSET_CLASSES[chosen?.assetClass ?? assetClass];
  const [form, setForm] = useState<string | null>(chosen?.form ?? meta.forms[0]?.value ?? null);
  const [purity, setPurity] = useState<string | null>(chosen?.purity ?? meta.purities[0]?.value ?? null);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [picking, setPicking] = useState(false);
  const [owner, setOwner] = useState<string>(''); // '' = joint
  const [fundType, setFundType] = useState<FundType | null>(null);
  // Bonds
  const [faceText, setFaceText] = useState('');
  const [couponText, setCouponText] = useState('');
  const [maturity, setMaturity] = useState<YMD | null>(null);
  const [purpose, setPurpose] = useState<Purpose>('investment');

  // A trade saved without its amount opens with the field empty, not "0".
  const [amountText, setAmountText] = useState(rupeesText(existing ? (existing.amountUnknown ? null : existing.amount) : (cashTxn?.amount ?? prefill?.amount ?? null)));
  const [qtyText, setQtyText] = useState(quantityText(existing?.quantity ?? null));
  const [priceText, setPriceText] = useState(rupeesText(existing?.unitPrice ?? null));
  const [chargesText, setChargesText] = useState(existing?.charges ? rupeesText(existing.charges) : '');
  const [taxesText, setTaxesText] = useState(existing?.taxes ? rupeesText(existing.taxes) : '');
  const [refRateText, setRefRateText] = useState(rupeesText(existing?.refRate ?? null));
  const [recent, setRecent] = useState<TradeField[]>([]);
  const [soldAll, setSoldAll] = useState(existing?.side === 'sell' && existing.quantity === null);
  const [date, setDate] = useState<YMD>(existing?.tradeDate ?? (cashTxn ? isoToYMD(cashTxn.occurredAt) : (prefill?.date ?? today)));
  const [cashMode, setCashMode] = useState<CashMode>(existing && !existing.txnId ? 'none' : existingTxn && existing && existingTxn.amount !== existing.amount ? 'part' : 'full');
  const [cashText, setCashText] = useState(rupeesText(existingTxn?.amount ?? null));
  const [method, setMethod] = useState<PayMethod>(cashTxn?.method ?? 'upi');
  const [accountId, setAccountId] = useState<string | null>(cashTxn?.accountId ?? (accounts.length === 1 ? accounts[0].id : null));
  const [cardId, setCardId] = useState<string | null>(cashTxn?.cardId ?? (cards.length === 1 ? cards[0].id : null));
  const [note, setNote] = useState(cashTxn?.note ?? '');
  const [scope, setScope] = useState<Scope>(cashTxn?.scope ?? chosen?.scope ?? 'household');
  const [saving, setSaving] = useState(false);

  const isMetal = (chosen?.assetClass ?? assetClass) === 'gold' || (chosen?.assetClass ?? assetClass) === 'silver';
  const isJewellery = side === 'buy' && isMetal && form === 'jewellery' && !chosen;
  const asInvestment = !isJewellery || purpose === 'investment';
  const unit = chosen?.unit ?? unitFor(assetClass, form);
  const hasQuantity = unit !== 'none';

  const numbers: TradeNumbers = {
    amount: money(amountText),
    quantity: soldAll ? null : (parseQuantity(qtyText) ?? null),
    unitPrice: money(priceText),
    charges: money(chargesText) ?? 0,
    taxes: money(taxesText) ?? 0,
  };
  const derived = hasQuantity && !soldAll ? fieldToDerive(recent, numbers) : null;

  /** Edit one of amount / quantity / price, then fill in the one touched least recently. */
  const edit = (field: TradeField | 'charges' | 'taxes', text: string) => {
    const next = { amountText, qtyText, priceText, chargesText, taxesText, [`${field === 'unitPrice' ? 'price' : field === 'quantity' ? 'qty' : field}Text`]: text };
    const order = field === 'charges' || field === 'taxes' ? recent : ([field, ...recent.filter((f) => f !== field)] as TradeField[]);
    const n: TradeNumbers = {
      amount: money(next.amountText),
      quantity: parseQuantity(next.qtyText) ?? null,
      unitPrice: money(next.priceText),
      charges: money(next.chargesText) ?? 0,
      taxes: money(next.taxesText) ?? 0,
    };
    const target = hasQuantity && !soldAll ? fieldToDerive(order, n) : null;
    const value = target ? derive(target, n, side) : null;
    if (target === 'amount') next.amountText = rupeesText(value);
    if (target === 'unitPrice') next.priceText = rupeesText(value);
    if (target === 'quantity') next.qtyText = quantityText(value);
    setAmountText(next.amountText);
    setQtyText(next.qtyText);
    setPriceText(next.priceText);
    setChargesText(next.chargesText);
    setTaxesText(next.taxesText);
    setRecent(order);
  };

  // What the chosen holding has now (without the trade being edited), and what this sale would realise.
  const position = (() => {
    if (!chosen) return null;
    const others = liveTrades(trades, txns).filter((t) => t.holdingId === chosen.id && t.id !== existing?.id);
    const before = ledger(chosen, others);
    if (side !== 'sell' || !numbers.amount) return { before, sale: null };
    const draft = { ...(existing ?? ({} as Trade)), id: existing?.id ?? 'draft', side, tradeDate: date, amount: numbers.amount, quantity: numbers.quantity, createdAt: existing?.createdAt ?? '9', charges: numbers.charges, taxes: numbers.taxes } as Trade;
    const after = ledger(chosen, [...others, draft]);
    return { before, sale: after.realised.find((r) => r.trade.id === draft.id) ?? null };
  })();

  // Selling: only what is still held. Buying: more of the same kind, even if it was sold out before.
  const soldOut = useMemo(() => new Set(summarizeHoldings(holdings, trades, txns).filter((s) => s.soldOut).map((s) => s.holding.id)), [holdings, trades, txns]);
  const holdingOptions = holdings
    .filter((h) => !h.deletedAt && (h.id === holdingChoice || (side === 'buy' ? h.assetClass === assetClass && !h.closed : !soldOut.has(h.id) && !h.closed)))
    .map((h) => ({ value: h.id, label: h.name }));

  const save = async () => {
    // Nothing is mandatory: what isn't entered is saved as unknown, never as zero.
    const amountIn = numbers.amount;
    const amount = amountIn ?? 0;
    // More than 3 decimals is rounded; only text that isn't a number is flagged (dropping it would lose what was typed).
    const typed = qtyText.trim().replace(/,/g, '');
    const quantity = soldAll ? null : (parseQuantity(qtyText) ?? (typed && Number.isFinite(Number(typed)) ? Math.round(Number(typed) * 1000) : null));
    if (hasQuantity && !soldAll && typed && quantity === null) return toast(`"${qtyText}" isn't a number`, { tone: 'error' });
    const newName = (name.trim() || defaultHoldingName(assetClass, form, purity) || ASSET_CLASSES[assetClass].label).trim();
    const partCash = money(cashText);
    // "Part" with no cash figure is no cash; with the full amount or more, it was paid in full.
    const mode: CashMode = cashMode === 'part' ? (!partCash ? 'none' : amountIn !== null && partCash >= amountIn ? 'full' : 'part') : cashMode;
    const cashAmount = mode === 'part' ? partCash! : amount;
    setSaving(true);
    try {
      if (!asInvestment) {
        // Jewellery for own use or as a gift: spending, with the weight kept in the note for own use.
        const weight = purpose === 'own' && quantity ? `${ASSET_CLASSES[assetClass].purities.find((p) => p.value === purity)?.label ?? ''} · ${formatQuantity(quantity, 'g')}`.replace(/^ · /, '') : null;
        await saveTransaction({
          type: 'expense',
          amount,
          occurredAt: toISO(date),
          categoryId: purpose === 'gift' ? 'cat_gifts' : 'cat_shopping',
          method,
          accountId: method === 'card' ? null : accountId,
          cardId: method === 'card' ? cardId : null,
          payee: name.trim() || `${ASSET_CLASSES[assetClass].label} jewellery`,
          note: [weight, note.trim()].filter(Boolean).join(' · ') || null,
          scope,
        });
        toast(`Saved as ${purpose === 'gift' ? 'a gift' : 'spending'}`, { tone: 'success' });
        return goBack();
      }
      await saveInvestment(
        {
          side,
          holding: chosen
            ? { id: chosen.id }
            : {
                assetClass,
                form,
                fundType: assetClass === 'mf' ? fundType : null,
                name: newName,
                symbol: symbol.trim().toUpperCase() || null,
                unit,
                purity: isMetal ? purity : null,
                memberId: owner || null,
                ...(assetClass === 'bond' ? { faceValue: money(faceText), couponRate: couponText.trim() ? Number(couponText) || null : null, maturityDate: maturity } : {}),
              },
          tradeDate: date,
          amount: amountIn,
          quantity: hasQuantity ? quantity : null,
          unitPrice: numbers.unitPrice,
          charges: numbers.charges,
          taxes: numbers.taxes,
          refRate: money(refRateText),
          cash: mode === 'none' ? null : { amount: cashAmount, method: side === 'sell' && method === 'card' ? 'bank' : method, accountId, cardId },
          note: note.trim() || null,
          scope,
        },
        { tradeId: existing?.id, fromTxnId },
      );
      toast(
        amountIn === null ? 'Saved without an amount: its cost is unknown until you add it' : side === 'buy' ? `Invested ${formatINR(amount)}` : `Sale of ${formatINR(amount)} saved`,
        { tone: 'success' },
      );
      goBack();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    await deleteInvestment(existing.id);
    toast('Deleted', { tone: 'success' });
    goBack();
  };

  const derivedHint = (f: TradeField) => (derived === f ? 'Calculated' : undefined);
  const unitName = unitLabel(unit, false) || 'unit';
  const sale = position?.sale;

  return (
    <Screen
      title={existing ? (side === 'buy' ? 'Edit purchase' : 'Edit sale') : fromTxn ? 'Record as investment' : side === 'buy' ? 'Invest' : 'Sell'}
      back
      right={existing ? <Button title="Delete" variant="ghost" size="sm" onPress={onDelete} /> : null}
      footer={<Button title="Save" icon="checkmark" onPress={save} loading={saving} size="lg" />}
    >
      {!existing && !fromTxn ? (
        <Segmented
          value={side}
          onChange={(v) => {
            setSide(v);
            if (v === 'sell' && holdingChoice === 'new') setHoldingChoice(holdingOptions[0]?.value ?? 'new');
          }}
          options={[
            { value: 'buy', label: 'Buy' },
            { value: 'sell', label: 'Sell' },
          ]}
        />
      ) : null}

      {!existing && (side === 'buy' || !chosen) ? (
        <Field label="What">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ASSET_ORDER.map((c) => (
              <Chip
                key={c}
                label={ASSET_CLASSES[c].label}
                icon={ASSET_CLASSES[c].icon as IconName}
                selected={(chosen?.assetClass ?? assetClass) === c}
                onPress={() => {
                  setAssetClass(c);
                  setHoldingChoice('new');
                  setForm(ASSET_CLASSES[c].forms[0]?.value ?? null);
                  setPurity(ASSET_CLASSES[c].purities[0]?.value ?? null);
                }}
              />
            ))}
          </View>
        </Field>
      ) : null}

      {holdingOptions.length || side === 'sell' ? (
        <ChipSelect
          label={side === 'buy' ? 'Add to' : 'Sold from'}
          value={holdingChoice}
          onChange={(v) => v && setHoldingChoice(v)}
          options={[...holdingOptions, { value: 'new', label: side === 'buy' ? 'Something new' : 'Not recorded here' }]}
        />
      ) : null}
      {side === 'sell' && !holdingOptions.length ? (
        <Txt tone="muted">Nothing recorded to sell yet: it's saved as a new holding. Add the purchase later to see the gain.</Txt>
      ) : null}

      {!chosen ? (
        <>
          {meta.forms.length ? <ChipSelect label="Form" value={form} onChange={(v) => setForm(v)} options={meta.forms} /> : null}
          {isMetal && meta.purities.length ? <ChipSelect label="Purity" value={purity} onChange={(v) => setPurity(v)} options={meta.purities} /> : null}
          {isJewellery ? (
            <Field label="This jewellery is">
              <Segmented
                value={purpose}
                onChange={setPurpose}
                options={[
                  { value: 'investment', label: 'Investment' },
                  { value: 'own', label: 'For own use' },
                  { value: 'gift', label: 'A gift' },
                ]}
              />
              <Txt variant="small" tone="muted" style={{ marginTop: 6 }}>
                {purpose === 'investment'
                  ? "Tracked with its weight and cost. Making charges and GST (often 10–25% on top of the metal) aren't recovered when you sell."
                  : purpose === 'own'
                    ? 'Saved as spending (Shopping). The weight, if you enter it, is noted on the entry.'
                    : 'Saved as spending (Gifts). Nothing more to fill in.'}
              </Txt>
            </Field>
          ) : null}
          {asInvestment ? (
            <>
              <TextField
                label="Name"
                value={name}
                onChangeText={setName}
                placeholder={defaultHoldingName(assetClass, form, purity) || (assetClass === 'equity' ? 'Infosys' : assetClass === 'mf' ? 'Parag Parikh Flexi Cap' : 'What is it?')}
              />
              {assetClass === 'mf' ? (
                <>
                  <Button title={symbol ? `Scheme ${symbol} · change` : 'Find the scheme (AMFI list)'} icon="search" size="sm" variant="secondary" onPress={() => setPicking(true)} />
                  <SchemePicker
                    visible={picking}
                    onClose={() => setPicking(false)}
                    initialQuery={name}
                    onPick={(scheme) => {
                      setName(scheme.name);
                      setSymbol(scheme.code);
                    }}
                  />
                </>
              ) : null}
              {assetClass === 'mf' ? (
                <ChipSelect
                  label="The fund invests in"
                  value={fundType}
                  onChange={setFundType}
                  allowNone
                  options={[
                    { value: 'equity', label: 'Shares (equity)' },
                    { value: 'debt', label: 'Debt' },
                    { value: 'hybrid', label: 'Hybrid' },
                    { value: 'gold', label: 'Gold' },
                    { value: 'international', label: 'International' },
                  ]}
                />
              ) : null}
              {assetClass === 'bond' ? (
                <>
                  <TextField label="ISIN (optional)" value={symbol} onChangeText={setSymbol} placeholder="From the contract note: INE… or IN0…" autoCapitalize="characters" hint="Lets a CDSL/NSDL statement update its price" />
                  <Row gap={1} style={{ alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <TextField label="Face value per bond" value={faceText} onChangeText={setFaceText} keyboardType="decimal-pad" placeholder="₹ 1,000" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <TextField label="Coupon, % a year" value={couponText} onChangeText={setCouponText} keyboardType="decimal-pad" placeholder="8.1" />
                    </View>
                  </Row>
                  <SwitchRow label="Has a maturity date" value={maturity !== null} onChange={(v) => setMaturity(v ? addMonths(today, 12 * 5) : null)} />
                  {maturity ? <DateField label="Matures on" value={maturity} onChange={setMaturity} /> : null}
                </>
              ) : null}
              {assetClass === 'equity' || assetClass === 'mf' ? (
                <TextField label={assetClass === 'equity' ? 'Symbol (optional)' : 'Scheme code or ISIN (optional)'} value={symbol} onChangeText={setSymbol} placeholder={assetClass === 'equity' ? 'INFY' : 'For daily prices from AMFI'} autoCapitalize="characters" />
              ) : null}
              {members.length > 1 ? (
                <ChipSelect
                  label="Whose"
                  value={owner}
                  onChange={(v) => setOwner(v ?? '')}
                  options={[{ value: '', label: 'Joint' }, ...members.map((m) => ({ value: m.id, label: m.id === selfId ? 'Mine' : m.name, color: m.color }))]}
                />
              ) : null}
            </>
          ) : (
            <TextField label="Shop" value={name} onChangeText={setName} placeholder="Jeweller's name (optional)" />
          )}
        </>
      ) : null}

      {position && chosen ? (
        <Card tone="alt" style={{ gap: 4 }}>
          <Txt variant="small" tone="muted">
            {chosen.name} now
          </Txt>
          <Txt variant="bodyStrong">
            {position.before.soldOut || !position.before.trades.length
              ? 'Nothing held'
              : `${hasQuantity && position.before.quantity ? formatQuantity(position.before.quantity, unit) : ''}${position.before.quantityComplete || !hasQuantity ? '' : ' recorded (some purchases have no quantity)'} · cost ${formatINR(position.before.invested)}`.replace(/^ · /, '')}
          </Txt>
          {sale ? (
            <Txt variant="small" tone={sale.gain === null ? 'muted' : sale.gain >= 0 ? 'income' : 'expense'}>
              {sale.gain === null
                ? "Gain can't be worked out: some purchases have no quantity. Enter them, or choose Sold all of it."
                : `${sale.gain >= 0 ? 'Gain' : 'Loss'} ${sale.beyondRecorded ? 'of at least ' : ''}${formatINR(Math.abs(sale.gain))} (cost ${formatINR(sale.cost ?? 0)}, earliest purchases first)`}
            </Txt>
          ) : null}
        </Card>
      ) : null}

      {side === 'sell' && hasQuantity ? (
        <SwitchRow label="Sold all of it" description="Everything still held, whatever the quantity" value={soldAll} onChange={setSoldAll} />
      ) : null}

      {hasQuantity && !soldAll && asInvestment ? (
        <Row gap={1} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <TextField label={unit === 'g' ? 'Grams' : unit === 'share' ? 'Shares' : unit === 'bond' ? 'Bonds' : 'Units'} value={qtyText} onChangeText={(t) => edit('quantity', t)} keyboardType="decimal-pad" placeholder="Optional" hint={derivedHint('quantity')} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label={`Price per ${unitName}`} value={priceText} onChangeText={(t) => edit('unitPrice', t)} keyboardType="decimal-pad" placeholder="₹" hint={derivedHint('unitPrice')} />
          </View>
        </Row>
      ) : null}
      {hasQuantity && !asInvestment && purpose === 'own' ? <TextField label="Grams (optional)" value={qtyText} onChangeText={setQtyText} keyboardType="decimal-pad" placeholder="Noted on the entry" /> : null}

      <TextField
        label={side === 'buy' ? 'Total paid' : 'Total received'}
        value={amountText}
        onChangeText={(t) => edit('amount', t)}
        keyboardType="decimal-pad"
        placeholder="₹"
        icon="cash-outline"
        hint={derivedHint('amount') ?? (side === 'buy' ? 'Charges and taxes included' : 'After charges')}
      />

      {asInvestment ? (
        <Row gap={1} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <TextField label={side === 'sell' && isMetal ? 'Deductions' : meta.chargesLabel} value={chargesText} onChangeText={(t) => edit('charges', t)} keyboardType="decimal-pad" placeholder="Optional" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label={meta.taxesLabel} value={taxesText} onChangeText={(t) => edit('taxes', t)} keyboardType="decimal-pad" placeholder="Optional" />
          </View>
        </Row>
      ) : null}

      {isMetal && asInvestment && side === 'buy' ? (
        <TextField label="Market rate that day (₹ per gram, optional)" value={refRateText} onChangeText={setRefRateText} keyboardType="decimal-pad" placeholder="From the jeweller's board or a rates site" hint="Shows how much went to making charges" />
      ) : null}

      <DateField label="Date" value={date} onChange={setDate} />

      {asInvestment ? (
        <Field label={side === 'buy' ? 'Paid' : 'Money'}>
          <Segmented
            value={cashMode}
            onChange={setCashMode}
            options={
              side === 'buy'
                ? [
                    { value: 'full', label: 'In full' },
                    { value: 'part', label: 'Part, traded in old' },
                    { value: 'none', label: 'Gift, no money' },
                  ]
                : [
                    { value: 'full', label: 'Received' },
                    { value: 'none', label: 'Traded in / given' },
                  ]
            }
          />
          {cashMode === 'part' ? (
            <View style={{ marginTop: space(1) }}>
              <TextField label="Cash paid" value={cashText} onChangeText={setCashText} keyboardType="decimal-pad" placeholder="₹" hint="Record the old piece as a sale with 'Traded in'" />
            </View>
          ) : null}
        </Field>
      ) : null}

      {cashMode !== 'none' || !asInvestment ? (
        <>
          <ChipSelect label={side === 'buy' ? 'Paid with' : 'Received in'} value={method} onChange={(v) => v && setMethod(v)} options={side === 'buy' ? METHODS : METHODS.filter((m) => m.value !== 'card')} />
          {method === 'card' && side === 'buy' ? (
            cards.length ? (
              <ChipSelect label="Which card?" value={cardId} onChange={setCardId} options={cards.map((c) => ({ value: c.id, label: `${c.name}${c.last4 ? ` ••${c.last4}` : ''}`, icon: 'card' as IconName }))} />
            ) : (
              <Button title="Add a credit card" icon="add" size="sm" variant="secondary" onPress={() => router.push('/card/new')} />
            )
          ) : accounts.length ? (
            <ChipSelect label="Account" value={accountId} onChange={setAccountId} allowNone options={accounts.map((a) => ({ value: a.id, label: `${a.name}${a.last4 ? ` ••${a.last4}` : ''}`, icon: (a.type === 'cash' ? 'cash' : a.type === 'wallet' ? 'wallet' : 'business') as IconName }))} />
          ) : null}
        </>
      ) : null}

      <TextField label="Note" value={note} onChangeText={setNote} placeholder="Optional" multiline />
      <SwitchRow icon="lock-closed-outline" label="Keep private" description="Private entries never leave this phone when syncing with family" value={scope === 'personal'} onChange={(v) => setScope(v ? 'personal' : 'household')} />
    </Screen>
  );
}
