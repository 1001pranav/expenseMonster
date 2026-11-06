import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, SlideInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { applyAmountKey, groupAmount } from '@/domain/amountInput';
import { recentRepeats, type Repeat } from '@/domain/captures';
import { addDays, toISO, type YMD } from '@/domain/dates';
import { formatINR } from '@/domain/money';
import { lastPayment, predictCategory } from '@/domain/quickAdd';
import type { PayMethod, TxnType } from '@/domain/types';
import { deleteTransaction, saveTransaction } from '@/data/actions';
import { useMembers, useSortedCategories, useTable, useToday } from '@/data/hooks';
import { Button, Chip, IconButton, Txt, type IconName } from '@/ui/components/core';
import { Sheet, toast } from '@/ui/components/feedback';
import { ChipSelect } from '@/ui/components/forms';
import { fonts, radius, space, useTheme } from '@/ui/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;
const METHOD_LABEL: Record<PayMethod, string> = { upi: 'UPI', bank: 'Bank', cash: 'Cash', card: 'Card', wallet: 'Wallet' };
/** Chips shown before "More": one row and a bit on a 360 dp phone, so the keypad stays in view. */
const TOP_CATS = 5;

type Mode = Extract<TxnType, 'expense' | 'income' | 'transfer'>;
const MODES: { value: Mode; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Money in' },
  { value: 'transfer', label: 'Move money' },
];
interface Source {
  method: PayMethod;
  cardId: string | null;
  accountId: string | null;
}
/** Where moved money went: a card's id (its bill paid) or another account of yours. */
const OTHER_ACCOUNT = 'account';

/** Big amount: smaller as it grows, so ₹12,34,567.50 still fits on one line without clipping. */
const amountSize = (shown: string) => (shown.length <= 7 ? 52 : shown.length <= 10 ? 42 : 34);

/**
 * Quick Add: the + button's sheet. Amount, category and Save are on screen together, so a usual
 * expense is + → digits → Save, with one more tap only when the suggested category is wrong.
 * Money moved (a card bill paid, to another account) is the third kind, with where it went in place
 * of the category. Everything else (payee, note, splits) is one tap away in the full form, pre-filled.
 */
export default function QuickAdd() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const today = useToday();
  /** Opened straight after onboarding: nothing logged yet, so say what to do. */
  const { first } = useLocalSearchParams<{ first?: string }>();
  const txns = useTable('transactions');
  const cards = useTable('cards');
  const accounts = useTable('accounts');
  const members = useMembers();
  const liveCards = cards.filter((c) => !c.deletedAt);

  const [type, setType] = useState<Mode>('expense');
  const moving = type === 'transfer';
  /** Spending and income have categories; moved money doesn't (the expense list is never shown for it). */
  const kind = type === 'income' ? 'income' : 'expense';
  const [raw, setRaw] = useState('');
  const [date, setDate] = useState<YMD>(today);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const categories = useSortedCategories(kind);
  // Worked out once per opening (and per type): the guess must not jump while the user types.
  const predicted = useMemo(() => (moving ? null : predictCategory(txns, type, new Date())), [type]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picked, setPicked] = useState<string | null>(null);
  const categoryId = moving ? null : (picked ?? predicted);
  const last = useMemo(() => lastPayment(txns, type), [txns, type]);
  /** Chosen in "Paid with"; until then, how the last one of this type was paid. */
  const [chosen, setChosen] = useState<Source | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [to, setTo] = useState<string | null>(null);
  // Moving money is from a bank or UPI, never "by card"; a card that's gone falls back to UPI.
  const fallback: Source = { method: 'upi', cardId: null, accountId: last?.accountId ?? (accounts.length === 1 ? accounts[0].id : null) };
  const lastUsable = last && !(last.method === 'card' && (moving || !liveCards.some((c) => c.id === last.cardId))) ? last : null;
  const pay: Source = chosen ?? lastUsable ?? fallback;
  const toCard = moving && to && to !== OTHER_ACCOUNT ? liveCards.find((c) => c.id === to) : undefined;
  const repeats = useMemo(() => recentRepeats(txns, type, today, 2), [txns, type, today]);

  const amount = Math.round(Number(raw || '0') * 100);
  const shown = raw ? groupAmount(raw) : '0';
  const size = amountSize(shown);
  const ordered = useMemo(() => {
    const first = categories.find((c) => c.id === categoryId);
    return first ? [first, ...categories.filter((c) => c.id !== first.id)] : categories;
  }, [categories, categoryId]);
  const chips = showAll ? ordered : ordered.slice(0, TOP_CATS);
  const catName = categories.find((c) => c.id === categoryId)?.name;

  const payLabel =
    pay.method === 'card'
      ? (liveCards.find((c) => c.id === pay.cardId)?.name ?? 'Card')
      : [METHOD_LABEL[pay.method], accounts.find((a) => a.id === pay.accountId)?.name].filter(Boolean).join(' · ');
  const payPrefix = moving ? 'From' : type === 'income' ? 'Into' : 'Paid with';

  const switchType = (next: Mode) => {
    if (next === type) return;
    Haptics.selectionAsync().catch(() => {});
    setType(next);
    setPicked(null);
    setShowAll(false);
    setChosen(null);
    setTo(null);
  };

  const drag = useSharedValue(0);
  const close = () => router.back();
  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      drag.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) scheduleOnRN(close);
      else drag.set(withTiming(0, { duration: 160 }));
    });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drag.get() }] }));

  const onKey = (k: string) => {
    Haptics.selectionAsync().catch(() => {});
    setRaw((r) => applyAmountKey(r, { start: r.length, end: r.length }, k).raw);
  };

  const commit = async (draft: { amount: number; categoryId: string | null; payee?: string | null; method?: PayMethod; cardId?: string | null; accountId?: string | null }) => {
    if (saving || !draft.amount) return;
    setSaving(true);
    try {
      const method = draft.method ?? pay.method;
      const cardId = method === 'card' ? (draft.cardId ?? pay.cardId ?? null) : null;
      const occurredAt = toISO(date, date === today ? new Date().getHours() * 60 + new Date().getMinutes() : null);
      const row = moving
        ? // A card bill paid moves money from the bank to the card: a transfer, never spending.
          await saveTransaction({
            type: 'transfer',
            amount: draft.amount,
            occurredAt,
            categoryId: null,
            method: method === 'card' ? 'bank' : method,
            accountId: draft.accountId ?? pay.accountId,
            cardId: toCard?.id ?? null,
            linkType: toCard ? 'card' : null,
            linkId: toCard?.id ?? null,
            ...(toCard ? { scope: toCard.scope } : {}),
          })
        : await saveTransaction({
            type,
            amount: draft.amount,
            occurredAt,
            categoryId: draft.categoryId,
            payee: draft.payee ?? null,
            // A card payment with no card known falls back to UPI rather than saving an unusable card entry.
            method: method === 'card' && !cardId ? 'upi' : method,
            cardId,
            accountId: method === 'card' ? null : (draft.accountId ?? pay.accountId ?? null),
          });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const name = moving ? (toCard ? `${toCard.name} bill paid` : 'Moved') : categories.find((c) => c.id === draft.categoryId)?.name;
      close();
      toast([formatINR(draft.amount, { decimals: 'auto' }), name ?? draft.payee].filter(Boolean).join(' · ') + ' logged', {
        actionLabel: 'Undo',
        onAction: () => {
          deleteTransaction(row.id).catch(() => {});
        },
      });
    } catch {
      // The sheet stays open with the amount, so nothing typed is lost.
      toast("Couldn't save. Your entry is still here, try again", { tone: 'error' });
      setSaving(false);
    }
  };

  const save = () => {
    if (moving && !to) return toast('Pick where the money went', { tone: 'error' });
    commit({ amount, categoryId: categoryId || null });
  };

  const saveRepeat = (r: Repeat) => commit({ amount: r.amount, categoryId: r.categoryId, payee: r.payee, method: r.method, cardId: r.cardId, accountId: r.accountId });

  const moreDetails = () => {
    router.back();
    setTimeout(() => router.push({ pathname: '/txn/new', params: { type, ...(amount ? { amount: String(amount) } : {}), ...(categoryId ? { categoryId } : {}), ...(toCard ? { payCard: toCard.id } : {}) } }), 10);
  };

  const income = type === 'income';
  const yesterday = addDays(today, -1);

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay }} onPress={close} accessibilityLabel="Close" />
      <GestureDetector gesture={pan}>
        <Animated.View
          entering={SlideInDown.duration(220).easing(Easing.out(Easing.cubic))}
          style={[{ backgroundColor: colors.elevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: space(2), paddingTop: space(1), paddingBottom: insets.bottom + space(2), gap: space(1.5) }, sheetStyle]}
        >
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
            <View accessibilityRole="tablist" style={{ flex: 1, flexDirection: 'row', padding: 3, gap: 3, borderRadius: radius.sm + 3, backgroundColor: colors.surfaceAlt }}>
              {MODES.map((m) => {
                const on = m.value === type;
                return (
                  <Pressable
                    key={m.value}
                    onPress={() => switchType(m.value)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => ({ flex: 1, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.elevated : 'transparent', opacity: pressed ? 0.75 : 1 })}
                  >
                    <Txt variant="small" numberOfLines={1} style={{ fontWeight: on ? fonts.bold : fonts.semibold, color: on ? (m.value === 'income' ? colors.incomeText : colors.text) : colors.textMuted }}>
                      {m.label}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
            <IconButton name="close" label="Close" onPress={close} />
          </View>

          <View style={{ alignItems: 'center', gap: 2 }}>
            {/* Two plain texts side by side: a nested <Txt> brings its own 22 px line height, which
                clips a 52 px figure on Android ("₹0" drawn as "₹()"). */}
            <View
              accessible
              accessibilityLiveRegion="polite"
              accessibilityLabel={`${income ? 'Money in' : moving ? 'Moving' : 'Amount'} ${amount ? formatINR(amount, { decimals: 'auto' }) : 'zero'}`}
              style={{ flexDirection: 'row', alignItems: 'baseline', maxWidth: '100%' }}
            >
              <Txt style={{ fontWeight: fonts.semibold, fontSize: Math.round(size * 0.7), lineHeight: Math.round(size * 1.3), color: colors.textMuted }}>{income ? '+₹' : '₹'}</Txt>
              <Txt
                numberOfLines={1}
                style={{ flexShrink: 1, fontWeight: fonts.bold, fontSize: size, lineHeight: Math.round(size * 1.3), includeFontPadding: false, fontVariant: ['tabular-nums'], color: raw ? (income ? colors.incomeText : colors.text) : colors.textFaint }}
              >
                {shown}
              </Txt>
            </View>
            <Txt variant="small" tone="muted" numberOfLines={1}>
              {moving
                ? toCard
                  ? `Pays ${toCard.name}: not counted as spending`
                  : to
                    ? 'Moved to another account of yours'
                    : 'Where did the money go?'
                : catName
                  ? picked
                    ? catName
                    : `Suggested: ${catName}`
                  : first && !raw
                    ? 'Log the last thing you paid for'
                    : 'Pick a category, or save without one'}
            </Txt>
          </View>

          {repeats.length && !raw && !moving ? (
            <View style={{ flexDirection: 'row', gap: space(1) }}>
              {repeats.map((r) => (
                <View key={`${r.payee}|${r.amount}`} style={{ flexShrink: 1 }}>
                  <Chip compact icon="refresh" label={`${r.payee} · ${formatINR(r.amount, { decimals: 'auto' })}`} onPress={() => saveRepeat(r)} />
                </View>
              ))}
            </View>
          ) : null}

          {moving ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(1) }}>
              {liveCards.map((c) => (
                <Chip key={c.id} compact icon={to === c.id ? 'checkmark' : 'card'} label={`Pay ${c.name}`} selected={to === c.id} onPress={() => setTo(to === c.id ? null : c.id)} />
              ))}
              <Chip compact icon={to === OTHER_ACCOUNT ? 'checkmark' : 'swap-horizontal'} label="Another account" selected={to === OTHER_ACCOUNT} onPress={() => setTo(to === OTHER_ACCOUNT ? null : OTHER_ACCOUNT)} />
              {members.length > 1 ? <Chip compact icon="people" label="Family member…" onPress={moreDetails} /> : null}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(1) }}>
              {chips.map((c) => (
                <Chip key={c.id} compact icon={c.id === categoryId ? 'checkmark' : (c.icon as IconName)} label={c.name} selected={c.id === categoryId} onPress={() => setPicked(c.id === categoryId ? '' : c.id)} />
              ))}
              {categories.length > TOP_CATS ? <Chip compact label={showAll ? 'Fewer' : 'More…'} onPress={() => setShowAll((v) => !v)} /> : null}
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
            <Pressable
              onPress={() => setChoosing(true)}
              accessibilityRole="button"
              accessibilityLabel={`${payPrefix} ${payLabel}`}
              accessibilityHint="Change how it was paid"
              hitSlop={4}
              style={({ pressed }) => ({ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 10, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.75 : 1 })}
            >
              <Txt variant="small" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                {payPrefix} <Txt variant="small" style={{ fontWeight: fonts.semibold }}>{payLabel}</Txt>
              </Txt>
              <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
            </Pressable>
            <SmallToggle
              label={date === today ? 'Today' : date === yesterday ? 'Yesterday' : date}
              icon="calendar-outline"
              hint="Switches between today and yesterday. Other dates are in More details"
              warn={date !== today}
              onPress={() => setDate(date === today ? yesterday : today)}
            />
            <View style={{ flex: 1 }} />
            <Pressable onPress={moreDetails} accessibilityRole="button" accessibilityLabel="More details: payee, note, splits" hitSlop={10} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Txt variant="small" style={{ color: colors.primary, fontWeight: fonts.semibold }}>
                More…
              </Txt>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', gap: space(1) }}>
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {KEYS.map((k) => (
                <Pressable
                  key={k}
                  onPress={() => onKey(k)}
                  onLongPress={k === 'del' ? () => setRaw('') : undefined}
                  accessibilityRole="button"
                  accessibilityLabel={k === 'del' ? 'Delete digit. Hold to clear' : k === '.' ? 'Decimal point' : k}
                  style={({ pressed }) => ({ width: '31.5%', height: 52, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.border : colors.surfaceAlt })}
                >
                  {k === 'del' ? <Ionicons name="backspace-outline" size={22} color={colors.text} /> : <Txt style={{ fontWeight: fonts.semibold, fontSize: 22, fontVariant: ['tabular-nums'] }}>{k}</Txt>}
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={save}
              disabled={!amount || saving}
              accessibilityRole="button"
              accessibilityLabel={amount ? `Save ${formatINR(amount, { decimals: 'auto' })}` : 'Save, enter an amount first'}
              accessibilityState={{ disabled: !amount || saving }}
              style={({ pressed }) => ({ width: 96, borderRadius: radius.sm + 4, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: amount ? colors.primary : colors.surfaceAlt, opacity: pressed ? 0.9 : 1 })}
            >
              <Ionicons name="checkmark" size={26} color={amount ? colors.primaryText : colors.textFaint} />
              <Txt style={{ fontWeight: fonts.bold, fontSize: 17, color: amount ? colors.primaryText : colors.textFaint }}>Save</Txt>
            </Pressable>
          </View>
        </Animated.View>
      </GestureDetector>
      <PaidWithSheet
        visible={choosing}
        title={moving ? 'Moved from' : type === 'income' ? 'Received in' : 'Paid with'}
        value={pay}
        allowCard={!moving}
        onClose={() => setChoosing(false)}
        onChange={(v) => setChosen(v)}
      />
    </View>
  );
}

const METHODS: PayMethod[] = ['upi', 'card', 'bank', 'cash', 'wallet'];

/** How it was paid: the method, then which card or account. Changes apply as they're tapped. */
function PaidWithSheet({ visible, title, value, allowCard, onClose, onChange }: { visible: boolean; title: string; value: Source; allowCard: boolean; onClose: () => void; onChange: (v: Source) => void }) {
  const cards = useTable('cards').filter((c) => !c.deletedAt);
  const accounts = useTable('accounts');
  const methods = METHODS.filter((m) => m !== 'card' || (allowCard && cards.length));
  return (
    <Sheet visible={visible} onClose={onClose} title={title} footer={<Button title="Done" size="lg" onPress={onClose} />}>
      <View style={{ gap: space(2) }}>
        <ChipSelect
          label="How"
          value={value.method}
          onChange={(m) => {
            if (!m) return;
            if (m === 'card') onChange({ method: 'card', cardId: value.cardId ?? cards[0]?.id ?? null, accountId: null });
            else onChange({ method: m, cardId: null, accountId: m === 'cash' ? null : value.accountId });
          }}
          options={methods.map((m) => ({ value: m, label: METHOD_LABEL[m] }))}
          wrap
        />
        {value.method === 'card' ? (
          <ChipSelect label="Which card?" value={value.cardId} onChange={(id) => id && onChange({ ...value, cardId: id })} options={cards.map((c) => ({ value: c.id, label: c.name, icon: 'card' as IconName }))} wrap />
        ) : value.method !== 'cash' && accounts.length ? (
          <ChipSelect label="Account" value={value.accountId} onChange={(id) => onChange({ ...value, accountId: id })} options={accounts.map((a) => ({ value: a.id, label: a.name }))} allowNone wrap />
        ) : null}
      </View>
    </Sheet>
  );
}

function SmallToggle({ label, icon, hint, warn, onPress }: { label: string; icon: IconName; hint: string; warn?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const color = warn ? colors.warnText : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      hitSlop={4}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: radius.sm, backgroundColor: warn ? colors.warnSoft : colors.surfaceAlt, opacity: pressed ? 0.75 : 1 })}
    >
      <Ionicons name={icon} size={15} color={color} />
      <Txt variant="small" style={{ color, fontWeight: fonts.semibold }}>
        {label}
      </Txt>
    </Pressable>
  );
}
