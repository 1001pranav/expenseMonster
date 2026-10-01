import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { billerMeta, viewBill } from '@/domain/bills';
import { formatDay, isoToYMD, toISO, type YMD } from '@/domain/dates';
import { formatINR, type Paise } from '@/domain/money';
import { parseIds } from '@/domain/settle';
import { flagsOf, suggestCategory } from '@/domain/transactions';
import type { PayMethod, Scope, Transaction, TxnType } from '@/domain/types';
import { restore } from '@/db/repo';
import { approveCapture, deleteTransaction, learnRule, rejectCapture, saveTransaction } from '@/data/actions';
import { useMembers, useSelfId, useSortedCategories, useTable, useToday } from '@/data/hooks';
import { Button, Card, Chip, Pill, Row, Txt, type IconName } from '../components/core';
import { Keypad, toast } from '../components/feedback';
import { ChipSelect, DateField, Field, Segmented, SwitchRow, TextField } from '../components/forms';
import { Screen } from '../components/Screen';
import { radius, space, useTheme } from '../theme';

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

export function TxnForm({ existing, initialType = 'expense' }: { existing?: Transaction; initialType?: TxnType }) {
  const { colors } = useTheme();
  const today = useToday();
  const accounts = useTable('accounts');
  const cards = useTable('cards');
  const billers = useTable('billers');
  const bills = useTable('bills');
  const txns = useTable('transactions');
  const rules = useTable('rules');
  const members = useMembers();
  const selfId = useSelfId();
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
  const [scope, setScope] = useState<Scope>(existing?.scope ?? 'household');
  const [payer, setPayer] = useState<string | null>(existing?.memberId ?? (selfId || null));
  const [splitWith, setSplitWith] = useState<string[]>(parseIds(existing?.splitWith ?? null));
  const [link, setLink] = useState<{ type: Transaction['linkType']; id: string | null }>({ type: existing?.linkType ?? null, id: existing?.linkId ?? null });
  const [showAllCats, setShowAllCats] = useState(false);
  /** True while the category was filled in from the payee, so typing more can still change it. */
  const [autoCat, setAutoCat] = useState(false);
  const [more, setMore] = useState(Boolean(existing && (existing.splitWith || existing.note)));
  const [saving, setSaving] = useState(false);

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
      router.back();
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
    router.back();
  };

  const color = type === 'income' ? colors.income : type === 'expense' ? colors.expense : colors.info;

  return (
    <Screen
      title={existing ? (pending ? 'Review capture' : 'Edit transaction') : 'New transaction'}
      back
      right={existing ? <Button title={pending ? 'Reject' : 'Delete'} variant="ghost" size="sm" onPress={onDelete} /> : null}
      footer={
        <Row gap={1}>
          <Button title={pending ? 'Approve' : 'Save'} icon="checkmark" onPress={() => save(pending)} loading={saving} style={{ flex: 1 }} size="lg" variant={pending ? 'success' : 'primary'} />
        </Row>
      }
    >
      {pending ? (
        <Card tone="alt" style={{ gap: 6 }}>
          <Row gap={1} wrap>
            <Pill label={existing?.source === 'sms' ? 'From SMS' : existing?.source === 'ocr' ? 'From screenshot' : 'Captured'} tone="info" />
            {existing?.confidence != null ? <Pill label={`${Math.round(existing.confidence * 100)}% sure`} tone={existing.confidence < 0.7 ? 'warn' : 'income'} /> : null}
            {flags.some((f) => f.startsWith('duplicate')) ? <Pill label="Possible duplicate" tone="expense" /> : null}
            {flags.includes('payment-pending') ? <Pill label="Payment was pending" tone="warn" /> : null}
          </Row>
          {existing?.sourceRef ? (
            <Txt variant="small" tone="muted">
              UPI ref {existing.sourceRef}
            </Txt>
          ) : null}
          {cardHint ? (
            <Txt variant="small" tone="warn">
              Card ending {cardHint} isn't saved. Add it under Dues → Cards to track its bill.
            </Txt>
          ) : null}
          {existing?.attachment ? <Image source={{ uri: existing.attachment }} style={{ width: '100%', height: 220, borderRadius: radius.md }} resizeMode="contain" accessibilityLabel="Captured screenshot" /> : null}
        </Card>
      ) : null}

      <Segmented
        value={type === 'settlement' ? 'expense' : type}
        onChange={(v) => {
          setType(v);
          setCategoryId(null);
          setAutoCat(false);
          if (v !== 'transfer' && link.type === 'card') setLink({ type: null, id: null });
        }}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
          { value: 'transfer', label: 'Transfer' },
        ]}
      />

      <Pressable onPress={() => setKeypad((k) => !k)} accessibilityRole="button" accessibilityLabel={`Amount ${amountStr || 'zero'} rupees. Tap to ${keypad ? 'hide' : 'show'} keypad`} style={{ alignItems: 'center', paddingVertical: space(1) }}>
        <Row gap={0.5} style={{ alignItems: 'flex-start' }}>
          <Txt variant="h1" style={{ color, marginTop: 6 }}>
            ₹
          </Txt>
          <Txt style={{ fontFamily: 'Inter_700Bold', fontSize: 52, lineHeight: 60, color: amountStr ? colors.text : colors.textFaint, fontVariant: ['tabular-nums'] }}>
            {amountStr ? formatINR(Number(amountStr.split('.')[0]) * 100, { symbol: false, decimals: 'never' }) + (amountStr.includes('.') ? `.${amountStr.split('.')[1]}` : '') : '0'}
          </Txt>
        </Row>
        {!keypad ? (
          <Txt variant="small" tone="faint">
            Tap to edit
          </Txt>
        ) : null}
      </Pressable>
      {keypad ? <Keypad onKey={onKey} /> : null}

      {type === 'transfer' ? (
        <Field label="Transfer to">
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
                }}
              />
            ))}
            <Chip label="Another account" icon="business" selected={link.type !== 'card'} onPress={() => setLink({ type: null, id: null })} />
          </View>
          {link.type === 'card' ? (
            <Txt variant="small" tone="muted" style={{ marginTop: 6 }}>
              Card bill payments are transfers, so your spending isn't counted twice.
            </Txt>
          ) : null}
        </Field>
      ) : (
        <Field label="Category">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {shownCats.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                icon={c.icon as IconName}
                color={c.color}
                selected={categoryId === c.id}
                onPress={() => {
                  setCategoryId(categoryId === c.id ? null : c.id);
                  setAutoCat(false);
                }}
              />
            ))}
            {categories.length > 8 ? <Chip label={showAllCats ? 'Less' : `+${categories.length - 8} more`} onPress={() => setShowAllCats((v) => !v)} /> : null}
          </View>
        </Field>
      )}

      {type === 'expense' && billCategory && openBills.length ? (
        <Field label="Which bill?">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {openBills.map(({ v, biller }) => (
              <Chip
                key={v.bill.id}
                icon={billerMeta(biller!.type).icon as IconName}
                label={`${biller!.name} · ${formatDay(v.bill.dueDate)} · ${formatINR(v.remaining || v.totalDue)}`}
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
        </Field>
      ) : null}

      <ChipSelect label={type === 'transfer' ? 'Paid from' : type === 'income' ? 'Received via' : 'Paid with'} value={method} onChange={(v) => v && setMethod(v)} options={METHODS.filter((m) => !(type !== 'expense' && m.value === 'card') || type === 'income')} />

      {method === 'card' && type !== 'transfer' ? (
        cards.length ? (
          <ChipSelect label={type === 'income' ? 'Refund to card' : 'Which card?'} value={cardId} onChange={setCardId} options={cards.map((c) => ({ value: c.id, label: `${c.name}${c.last4 ? ` ••${c.last4}` : ''}`, icon: 'card' as IconName }))} />
        ) : (
          <Button title="Add a credit card" icon="add" size="sm" variant="secondary" onPress={() => router.push('/card/new')} />
        )
      ) : accounts.length ? (
        <ChipSelect label="Account" value={accountId} onChange={setAccountId} allowNone options={accounts.map((a) => ({ value: a.id, label: `${a.name}${a.last4 ? ` ••${a.last4}` : ''}`, icon: (a.type === 'cash' ? 'cash' : a.type === 'wallet' ? 'wallet' : 'business') as IconName }))} />
      ) : null}

      <DateField label="Date" value={date} onChange={setDate} />
      <View style={{ gap: space(1) }}>
        <TextField label={type === 'income' ? 'From' : 'Paid to'} value={payee} onChangeText={(v) => onPayee(v)} placeholder={type === 'income' ? 'Employer, tenant…' : 'Shop, person, biller…'} icon="storefront-outline" />
        {payeeSuggestions.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {payeeSuggestions.map((p) => (
              <Chip key={p.name} compact icon="time-outline" label={p.name} onPress={() => onPayee(p.name, p)} />
            ))}
          </View>
        ) : null}
        {autoCat && categoryId ? (
          <Txt variant="small" tone="muted" style={{ paddingHorizontal: 2 }}>
            Filed under {categories.find((c) => c.id === categoryId)?.name} like your past entries — tap a category to change it.
          </Txt>
        ) : null}
      </View>

      <Pressable onPress={() => setMore((m) => !m)} accessibilityRole="button" style={{ paddingVertical: 4 }}>
        <Txt variant="small" tone="primary">
          {more ? 'Hide details' : 'Note, split with family, privacy…'}
        </Txt>
      </Pressable>
      {more ? (
        <>
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
          <SwitchRow
            icon="lock-closed-outline"
            label="Keep private"
            description="Private entries never leave this phone when syncing with family"
            value={scope === 'personal'}
            onChange={(v) => setScope(v ? 'personal' : 'household')}
          />
        </>
      ) : null}
    </Screen>
  );
}
