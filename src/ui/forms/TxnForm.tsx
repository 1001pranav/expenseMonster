import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { billerMeta, viewBill } from '@/domain/bills';
import { formatDay, isoToYMD, toISO, type YMD } from '@/domain/dates';
import { formatINR, type Paise } from '@/domain/money';
import { parseIds } from '@/domain/settle';
import { categoryHistory, flagsOf, suggestCategory } from '@/domain/transactions';
import type { PayMethod, Scope, Transaction, TxnType } from '@/domain/types';
import { restore } from '@/db/repo';
import { useStore } from '@/db/store';
import { approveCapture, deleteTransaction, learnRule, rejectCapture, saveTransaction } from '@/data/actions';
import { useMembers, useSelfId, useSortedCategories, useTable, useToday } from '@/data/hooks';
import { Button, Card, Chip, Pill, Row, Txt, type IconName } from '../components/core';
import { Keypad, toast } from '../components/feedback';
import { ChipSelect, DateField, Field, Segmented, SwitchRow, TextField } from '../components/forms';
import { Screen, goBack } from '../components/Screen';
import { fonts, radius, space, useTheme } from '../theme';

const METHODS: { value: PayMethod; label: string; icon: IconName }[] = [
  { value: 'upi', label: 'UPI', icon: 'qr-code' },
  { value: 'card', label: 'Credit card', icon: 'card' },
  { value: 'cash', label: 'Cash', icon: 'cash' },
  { value: 'bank', label: 'Bank', icon: 'business' },
  { value: 'wallet', label: 'Wallet', icon: 'wallet' },
];

function amountText(paise: Paise | null) {
  if (!paise) return '';
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return p ? `${r}.${String(p).padStart(2, '0').replace(/0$/, '')}` : String(r);
}

export function TxnForm({ existing, initialType = 'expense', ocrText }: { existing?: Transaction; initialType?: TxnType; /** What OCR read, right after a scan. */ ocrText?: string }) {
  const { colors } = useTheme();
  const today = useToday();
  const accounts = useTable('accounts');
  const cards = useTable('cards');
  const billers = useTable('billers');
  const bills = useTable('bills');
  const txns = useTable('transactions');
  const rules = useTable('rules');
  const loans = useTable('loans');
  const members = useMembers();
  const selfId = useSelfId();
  const defaultScope = useStore((s) => s.settings.defaultTxnScope);
  const pending = existing?.status === 'pending';
  const flags = existing ? flagsOf(existing) : [];

  const [type, setType] = useState<TxnType>(existing?.type ?? initialType);
  const [amountStr, setAmountStr] = useState(amountText(existing?.amount ?? null));
  const [keypad, setKeypad] = useState(!existing);
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [method, setMethod] = useState<PayMethod>(existing?.method ?? 'upi');
  const [cardId, setCardId] = useState<string | null>(existing?.cardId ?? (cards.length === 1 ? cards[0].id : null));
  const [accountId, setAccountId] = useState<string | null>(existing?.accountId ?? (accounts.length === 1 ? accounts[0].id : null));
  const [date, setDate] = useState<YMD>(existing ? isoToYMD(existing.occurredAt) : today);
  const [payee, setPayee] = useState(existing?.payee ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [scope, setScope] = useState<Scope>(existing?.scope ?? defaultScope);
  const [payer, setPayer] = useState<string | null>(existing?.memberId ?? (selfId || null));
  const [splitWith, setSplitWith] = useState<string[]>(parseIds(existing?.splitWith ?? null));
  const [link, setLink] = useState<{ type: Transaction['linkType']; id: string | null }>({ type: existing?.linkType ?? null, id: existing?.linkId ?? null });
  const [showAllCats, setShowAllCats] = useState(false);
  /** True while the category was filled in from the payee, so typing more can still change it. */
  const [autoCat, setAutoCat] = useState(false);
  const [more, setMore] = useState(Boolean(existing && (existing.splitWith || existing.note)));
  const [saving, setSaving] = useState(false);
  const [showOcr, setShowOcr] = useState(false);

  const catKind = type === 'income' ? 'income' : 'expense';
  const categories = useSortedCategories(catKind);
  const topCats = categories.slice(0, 8);
  // Keep a selected category visible even when it isn't one of the most-used eight.
  const shownCats = showAllCats ? categories : [...topCats, ...categories.filter((c) => c.id === categoryId && !topCats.includes(c))];

  // Payees used before for this type, newest first, with the category they were filed under.
  const knownPayees = useMemo(() => {
    const seen = new Map<string, { name: string; categoryId: string | null }>();
    for (const t of txns) {
      if (!t.payee || t.type !== type || t.status === 'rejected') continue;
      const k = t.payee.trim().toLowerCase();
      if (!seen.has(k)) seen.set(k, { name: t.payee.trim(), categoryId: t.categoryId });
      if (seen.size >= 300) break;
    }
    return [...seen.values()];
  }, [txns, type]);
  const payeeQuery = payee.trim().toLowerCase();
  const payeeSuggestions = payeeQuery && !existing ? knownPayees.filter((p) => p.name.toLowerCase().includes(payeeQuery) && p.name.toLowerCase() !== payeeQuery).slice(0, 4) : [];

  const onPayee = (v: string, picked?: { categoryId: string | null }) => {
    setPayee(v);
    if (type === 'transfer' || (categoryId && !autoCat)) return;
    const exact = picked ?? knownPayees.find((p) => p.name.toLowerCase() === v.trim().toLowerCase());
    const suggestion = exact?.categoryId ?? (v.trim().length >= 3 ? suggestCategory(v, rules) : null);
    if (suggestion && categories.some((c) => c.id === suggestion)) {
      setCategoryId(suggestion);
      setAutoCat(true);
    } else if (autoCat) {
      setCategoryId(null);
      setAutoCat(false);
    }
  };
  // Categories this payee was filed under before (matched across spellings and its UPI ID).
  const pastCats = useMemo(
    () =>
      type === 'transfer'
        ? []
        : categoryHistory(payee.trim() || null, existing?.vpa ?? null, type, txns, existing?.id)
            .filter((c) => categories.some((x) => x.id === c.categoryId))
            .slice(0, 3),
    [payee, existing?.vpa, existing?.id, type, txns, categories],
  );
  const amount = Math.round(Number(amountStr || '0') * 100);
  const cardHint = flags.find((f) => f.startsWith('card-hint:'))?.split(':')[1];

  // "Which bill?" — open bills, newest due first, for bill-type categories or when the capture matched a biller.
  const openBills = useMemo(
    () =>
      bills
        .filter((b) => b.status !== 'draft')
        .map((b) => ({ v: viewBill(b, txns, today), biller: billers.find((x) => x.id === b.billerId) }))
        .filter((x) => x.biller && (x.v.remaining > 0 || x.v.bill.id === link.id))
        .sort((a, b) => a.v.bill.dueDate.localeCompare(b.v.bill.dueDate)),
    [bills, billers, txns, today, link.id],
  );
  const billCategory = categoryId === 'cat_utilities' || categoryId === 'cat_rent' || categoryId === 'cat_education' || flags.some((f) => f.startsWith('biller:'));

  const onKey = (k: string) => {
    if (k === 'clear') return setAmountStr('');
    if (k === 'del') return setAmountStr((s) => s.slice(0, -1));
    setAmountStr((s) => {
      if (k === '.' && s.includes('.')) return s;
      const next = s === '0' && k !== '.' ? k : s + k;
      const [, dec] = next.split('.');
      if (dec && dec.length > 2) return s;
      if (Number(next) > 99_99_99_999) return s;
      return next;
    });
  };

  const save = async (approve = false) => {
    if (!amount) return toast('Enter an amount', { tone: 'error' });
    if (method === 'card' && type === 'expense' && !cardId && cards.length) return toast('Pick which credit card', { tone: 'error' });
    setSaving(true);
    try {
      const time = existing && isoToYMD(existing.occurredAt) === date ? existing.occurredAt : toISO(date, date === today ? new Date().getHours() * 60 + new Date().getMinutes() : null);
      const isCardPayment = type === 'transfer' && link.type === 'card';
      const draft = {
        type,
        amount,
        occurredAt: time,
        categoryId: type === 'transfer' ? null : categoryId,
        method: isCardPayment && method === 'card' ? 'bank' : method,
        cardId: method === 'card' || isCardPayment ? cardId : null,
        accountId: method === 'card' && !isCardPayment ? null : accountId,
        payee: payee.trim() || null,
        note: note.trim() || null,
        scope,
        memberId: payer,
        splitWith: type === 'expense' && splitWith.length ? JSON.stringify(splitWith) : null,
        linkType: link.id ? link.type : null,
        linkId: link.id,
      } satisfies Partial<Transaction>;
      if (existing && (pending || approve)) {
        await approveCapture(existing.id, draft);
        toast('Approved', { tone: 'success' });
      } else if (existing) {
        await saveTransaction(draft, existing.id);
        await learnRule({ payee: draft.payee, vpa: existing.vpa, categoryId: draft.categoryId });
        toast('Saved', { tone: 'success' });
      } else {
        await saveTransaction(draft);
        toast(`${type === 'income' ? 'Income' : type === 'transfer' ? 'Transfer' : 'Expense'} of ${formatINR(amount)} saved`, { tone: 'success' });
      }
      goBack();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    if (pending) await rejectCapture(existing.id);
    else await deleteTransaction(existing.id);
    toast(pending ? 'Rejected' : 'Deleted', { actionLabel: pending ? undefined : 'Undo', onAction: pending ? undefined : () => restore('transactions', existing.id) });
    goBack();
  };

  type Part = 'payee' | 'category' | 'method' | 'date' | 'more';
  const [open, setOpen] = useState<Part | null>(null);
  const toggle = (part: Part) => {
    setKeypad(false);
    setOpen((o) => (o === part ? null : part));
  };
  const catName = categories.find((c) => c.id === categoryId)?.name;
  const card = cards.find((c) => c.id === cardId);
  const account = accounts.find((a) => a.id === accountId);
  const methodLabel = METHODS.find((m) => m.value === method)?.label ?? method;
  const paidWith = method === 'card' && card ? card.name : `${methodLabel}${account ? ` from ${account.name}` : ''}`;
  const dateLabel = date === today ? 'Today' : formatDay(date, { year: true });
  const extras = [note.trim() ? 'Note' : '', splitWith.length ? `Split ${splitWith.length} ways` : '', scope === 'personal' ? 'Private' : ''].filter(Boolean).join(', ');
  const divider = <View style={{ height: 1, backgroundColor: colors.surfaceAlt, marginHorizontal: space(2) }} />;
  const title = existing ? (pending ? 'Check this capture' : 'Edit entry') : type === 'income' ? 'Money in' : type === 'transfer' ? 'Move money' : 'New expense';

  return (
    <Screen
      title={title}
      back
      right={existing ? <Button title={pending ? 'Reject' : 'Delete'} variant="ghost" size="sm" onPress={onDelete} /> : <Button title="Set up…" variant="ghost" size="sm" onPress={() => router.push('/add')} />}
      footer={
        <Button
          title={pending ? 'Approve' : amount ? `Save ${formatINR(amount, { decimals: 'auto' })}` : 'Save'}
          icon="checkmark"
          onPress={() => save(pending)}
          loading={saving}
          size="lg"
          variant={pending ? 'success' : 'primary'}
        />
      }
    >
      {pending ? (
        <Card tone="alt" style={{ gap: 6 }}>
          <Row gap={1} wrap>
            <Pill label={existing?.source === 'sms' ? 'From SMS' : existing?.source === 'ocr' ? 'From screenshot' : 'Captured'} tone="info" />
            {existing?.confidence != null ? <Pill label={`${Math.round(existing.confidence * 100)}% sure`} tone={existing.confidence < 0.7 ? 'warn' : 'good'} /> : null}
            {flags.some((f) => f.startsWith('duplicate')) ? <Pill label="Possible duplicate" tone="expense" /> : null}
            {flags.includes('payment-pending') ? <Pill label="Payment was pending" tone="warn" /> : null}
            {flags.includes('amount-unsure') ? <Pill label="Check the amount" tone="warn" /> : null}
          </Row>
          {flags.includes('amount-unsure') ? (
            <Txt variant="small" tone="warn">
              The ₹ sign wasn't read clearly, so a digit may be wrong. Compare with the screenshot below.
            </Txt>
          ) : null}
          {existing?.sourceRef ? (
            <Txt variant="small" tone="muted">
              UPI reference {existing.sourceRef}
            </Txt>
          ) : null}
          {cardHint ? (
            <Txt variant="small" tone="warn">
              Card ending {cardHint} isn't saved yet. Add it from Dues, Cards to track its bill.
            </Txt>
          ) : null}
          {ocrText ? (
            <Pressable onPress={() => setShowOcr((v) => !v)} accessibilityRole="button">
              <Txt variant="small" tone="primary">
                {showOcr ? 'Hide what was read' : 'Show what was read'}
              </Txt>
            </Pressable>
          ) : null}
          {showOcr && ocrText ? (
            <Txt tone="muted" selectable style={{ fontSize: 12 }}>
              {ocrText}
            </Txt>
          ) : null}
          {existing?.attachment ? <Image source={{ uri: existing.attachment }} style={{ width: '100%', height: 220, borderRadius: radius.md }} resizeMode="contain" accessibilityLabel="Captured screenshot" /> : null}
        </Card>
      ) : null}

      <Segmented
        value={type === 'settlement' ? 'transfer' : type}
        onChange={(v) => {
          setType(v);
          setCategoryId(null);
          setAutoCat(false);
          if (v !== 'transfer' && link.type === 'card') setLink({ type: null, id: null });
        }}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Money in' },
          { value: 'transfer', label: 'Move money' },
        ]}
      />

      {!existing ? (
        <Row gap={1}>
          <Button title="Read a screenshot" icon="scan-outline" variant="secondary" size="sm" onPress={() => router.replace('/scan')} style={{ flex: 1 }} />
          <Button title="Paste a bank SMS" icon="chatbubble-ellipses-outline" variant="secondary" size="sm" onPress={() => router.replace('/paste-sms')} style={{ flex: 1 }} />
        </Row>
      ) : null}

      <Pressable onPress={() => { setOpen(null); setKeypad((k) => !k); }} accessibilityRole="button" accessibilityLabel={`Amount ${amountStr || 'zero'} rupees. Tap to ${keypad ? 'hide' : 'show'} the keypad`} style={{ paddingHorizontal: 4, gap: 2 }}>
        <Txt variant="small" tone="muted">
          Amount
        </Txt>
        <Txt style={{ fontFamily: fonts.display, fontSize: 48, lineHeight: 56, letterSpacing: -2, color: amountStr ? (type === 'income' ? colors.incomeText : colors.text) : colors.textFaint, fontVariant: ['tabular-nums'] }}>
          ₹{amountStr ? formatINR(Number(amountStr.split('.')[0]) * 100, { symbol: false, decimals: 'never' }) + (amountStr.includes('.') ? `.${amountStr.split('.')[1]}` : '') : '0'}
        </Txt>
      </Pressable>
      {keypad ? (
        <Card style={{ padding: space(1) }}>
          <Keypad onKey={onKey} />
          <Button title="Done" variant="secondary" size="sm" onPress={() => { setKeypad(false); setOpen(payee ? null : 'payee'); }} />
        </Card>
      ) : null}

      <Card padded={false} style={{ overflow: 'hidden' }}>
        <FormRow label={type === 'income' ? 'From' : type === 'transfer' ? 'Note' : 'Paid to'} value={payee.trim() || (type === 'income' ? 'Employer, tenant…' : 'Shop, person, biller…')} empty={!payee.trim()} open={open === 'payee'} onPress={() => toggle('payee')} />
        {open === 'payee' ? (
          <View style={{ paddingHorizontal: space(2), paddingBottom: space(2), gap: space(1) }}>
            <TextField value={payee} onChangeText={(v) => onPayee(v)} placeholder={type === 'income' ? 'Employer, tenant…' : 'Shop, person, biller…'} icon="storefront-outline" autoFocus />
            {payeeSuggestions.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {payeeSuggestions.map((p) => (
                  <Chip key={p.name} compact icon="time-outline" label={p.name} onPress={() => { onPayee(p.name, p); setOpen(type === 'transfer' ? 'method' : 'category'); }} />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        {divider}

        {type === 'transfer' ? (
          <>
            <FormRow label="To" value={link.type === 'card' ? `Pay ${card?.name ?? 'card'} bill` : 'Another account'} open={open === 'category'} onPress={() => toggle('category')} />
            {open === 'category' ? (
              <View style={{ paddingHorizontal: space(2), paddingBottom: space(2), gap: space(1) }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {cards.map((c) => (
                    <Chip
                      key={c.id}
                      icon="card"
                      label={`Pay ${c.name}`}
                      selected={link.type === 'card' && cardId === c.id}
                      onPress={() => {
                        setCardId(c.id);
                        setLink({ type: 'card', id: c.id });
                        setScope(c.scope);
                        setOpen(null);
                      }}
                    />
                  ))}
                  <Chip label="Another account" icon="business" selected={link.type !== 'card'} onPress={() => { setLink({ type: null, id: null }); setOpen(null); }} />
                </View>
                {link.type === 'card' ? (
                  <Txt variant="small" tone="muted">
                    Paying a card bill moves money; it isn't counted as spending again.
                  </Txt>
                ) : null}
              </View>
            ) : null}
          </>
        ) : (
          <>
            <FormRow label="Category" value={catName ?? 'Choose'} empty={!catName} open={open === 'category'} onPress={() => toggle('category')} />
            {open === 'category' ? (
              <View style={{ paddingHorizontal: space(2), paddingBottom: space(2), gap: space(1) }}>
                {pastCats.length ? (
                  <Txt variant="small" tone="muted">
                    {pastCats.length > 1
                      ? `${payee.trim() || 'This payee'} was filed two ways before.`
                      : `${payee.trim() || 'This payee'} was filed as ${categories.find((c) => c.id === pastCats[0].categoryId)?.name} ${pastCats[0].count === 1 ? 'last time' : `the last ${pastCats[0].count} times`}.`}
                  </Txt>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {shownCats.map((c) => (
                    <Chip
                      key={c.id}
                      label={c.name}
                      icon={c.icon as IconName}
                      color={colors.primary}
                      selected={categoryId === c.id}
                      onPress={() => {
                        setCategoryId(c.id);
                        setAutoCat(false);
                        setOpen(null);
                      }}
                    />
                  ))}
                  {categories.length > 8 ? <Chip label={showAllCats ? 'Fewer' : `${categories.length - 8} more`} onPress={() => setShowAllCats((v) => !v)} /> : null}
                </View>
              </View>
            ) : null}
          </>
        )}
        {type === 'expense' && billCategory && openBills.length ? (
          <>
            {divider}
            <View style={{ padding: space(2), gap: space(1) }}>
              <Txt variant="small" tone="muted">
                Which bill does this pay?
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {openBills.map(({ v, biller }) => (
                  <Chip
                    key={v.bill.id}
                    icon={billerMeta(biller!.type).icon as IconName}
                    label={`${biller!.name}, ${formatDay(v.bill.dueDate)}, ${formatINR(v.remaining || v.totalDue)}`}
                    selected={link.type === 'bill' && link.id === v.bill.id}
                    onPress={() => {
                      const on = !(link.type === 'bill' && link.id === v.bill.id);
                      setLink(on ? { type: 'bill', id: v.bill.id } : { type: null, id: null });
                      if (on && !amountStr) setAmountStr(amountText(v.remaining));
                      if (on && !payee) setPayee(biller!.name);
                    }}
                  />
                ))}
              </View>
            </View>
          </>
        ) : null}
        {divider}

        <FormRow label={type === 'transfer' ? 'From' : type === 'income' ? 'Received in' : 'Paid with'} value={paidWith} open={open === 'method'} onPress={() => toggle('method')} />
        {open === 'method' ? (
          <View style={{ paddingHorizontal: space(2), paddingBottom: space(2), gap: space(1.5) }}>
            <ChipSelect value={method} onChange={(v) => v && setMethod(v)} options={METHODS.filter((m) => !(type !== 'expense' && m.value === 'card') || type === 'income')} />
            {method === 'card' && type !== 'transfer' ? (
              cards.length ? (
                <ChipSelect label={type === 'income' ? 'Refund to card' : 'Which card?'} value={cardId} onChange={setCardId} options={cards.map((c) => ({ value: c.id, label: `${c.name}${c.last4 ? ` ••${c.last4}` : ''}`, icon: 'card' as IconName }))} />
              ) : (
                <Button title="Add a credit card" icon="add" size="sm" variant="secondary" onPress={() => router.push('/card/new')} />
              )
            ) : accounts.length ? (
              <ChipSelect label="Account" value={accountId} onChange={setAccountId} allowNone options={accounts.map((a) => ({ value: a.id, label: `${a.name}${a.last4 ? ` ••${a.last4}` : ''}`, icon: (a.type === 'cash' ? 'cash' : a.type === 'wallet' ? 'wallet' : 'business') as IconName }))} />
            ) : null}
          </View>
        ) : null}
        {divider}

        <FormRow label="Date" value={dateLabel} open={open === 'date'} onPress={() => toggle('date')} />
        {open === 'date' ? (
          <View style={{ paddingHorizontal: space(2), paddingBottom: space(2) }}>
            <DateField value={date} onChange={(v) => { setDate(v); setOpen(null); }} />
          </View>
        ) : null}
      </Card>

      {existing && !pending && type === 'expense' && method === 'card' && existing.cardId ? <EmiLink txnId={existing.id} plan={loans.find((l) => l.sourceTxnId === existing.id && !l.deletedAt)} /> : null}

      <Card padded={false} style={{ overflow: 'hidden' }}>
        <FormRow label="More" value={extras || 'Note, split with family, private'} empty={!extras} open={open === 'more' || more} onPress={() => { setMore(false); toggle('more'); }} />
        {open === 'more' || more ? (
          <View style={{ paddingHorizontal: space(2), paddingBottom: space(2), gap: space(1.5) }}>
            <TextField label="Note" value={note} onChangeText={setNote} placeholder="Optional" multiline />
            {members.length > 1 && type === 'expense' ? (
              <>
                <ChipSelect label="Paid by" value={payer} onChange={setPayer} options={members.map((m) => ({ value: m.id, label: m.id === selfId ? 'You' : m.name, color: m.color }))} />
                <Field label="Split equally with" hint={splitWith.length ? `${formatINR(Math.round(amount / splitWith.length))} each` : 'Not shared'}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {members.map((m) => (
                      <Chip key={m.id} label={m.id === selfId ? 'You' : m.name} color={m.color} selected={splitWith.includes(m.id)} onPress={() => setSplitWith((s) => (s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id]))} />
                    ))}
                  </View>
                </Field>
              </>
            ) : null}
            <SwitchRow icon="lock-closed-outline" label="Keep private" description="Family phones won't see it" value={scope === 'personal'} onChange={(v) => setScope(v ? 'personal' : 'household')} />
          </View>
        ) : null}
      </Card>
      {autoCat && categoryId && open !== 'category' ? (
        <Txt variant="small" tone="muted" style={{ paddingHorizontal: 4 }}>
          {catName} was filled in from your past payments to {payee.trim()}. Tap Category to change it.
        </Txt>
      ) : null}
    </Screen>
  );
}

/** A card purchase: offer to split it into EMIs, or show the plan it's already on. */
function EmiLink({ txnId, plan }: { txnId: string; plan?: { id: string; tenureMonths: number; name: string } }) {
  const { colors } = useTheme();
  return (
    <Card onPress={() => (plan ? router.push(`/loan/${plan.id}`) : router.push({ pathname: '/card-emi/new', params: { txn: txnId } }))} style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5) }}>
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{plan ? `On ${plan.tenureMonths} monthly EMIs` : 'Pay this in EMIs'}</Txt>
        <Txt variant="small" tone="muted">
          {plan ? 'Billed on the card each month. Tap to see the plan.' : 'Converted with your bank? Spread it across your card bills.'}
        </Txt>
      </View>
      <Txt variant="small" style={{ color: colors.primary, fontFamily: fonts.bold }}>
        {plan ? 'Open' : 'Set up'}
      </Txt>
    </Card>
  );
}

/** One line of the form: label, current value, and a Change/Done hint; tapping opens its picker below. */
function FormRow({ label, value, open, empty, onPress }: { label: string; value: string; open: boolean; empty?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(1.5), minHeight: 58, paddingHorizontal: space(2), backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
    >
      <Txt variant="small" tone="muted" style={{ width: 84 }}>
        {label}
      </Txt>
      <Txt variant="bodyStrong" tone={empty ? 'faint' : 'default'} style={{ flex: 1 }} numberOfLines={1}>
        {value}
      </Txt>
      <Txt variant="small" style={{ color: colors.primary, fontFamily: fonts.bold }}>
        {open ? 'Done' : 'Change'}
      </Txt>
    </Pressable>
  );
}
