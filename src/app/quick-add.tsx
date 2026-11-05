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
import { useSortedCategories, useTable, useToday } from '@/data/hooks';
import { Chip, IconButton, Txt, type IconName } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { fonts, radius, space, useTheme } from '@/ui/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;
const METHOD_LABEL: Record<PayMethod, string> = { upi: 'UPI', bank: 'Bank', cash: 'Cash', card: 'Card', wallet: 'Wallet' };
/** Chips shown before "More": one row and a bit on a 360 dp phone, so the keypad stays in view. */
const TOP_CATS = 5;

/**
 * Quick Add: the + button's sheet. Amount, category and Save are on screen together, so a usual
 * expense is + → digits → Save, with one more tap only when the suggested category is wrong.
 * Everything else (payee, note, splits, transfers) is one tap away in the full form, pre-filled.
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

  const [type, setType] = useState<Extract<TxnType, 'expense' | 'income'>>('expense');
  const [raw, setRaw] = useState('');
  const [date, setDate] = useState<YMD>(today);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const categories = useSortedCategories(type);
  // Worked out once per opening (and per type): the guess must not jump while the user types.
  const predicted = useMemo(() => predictCategory(txns, type, new Date()), [type]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picked, setPicked] = useState<string | null>(null);
  const categoryId = picked ?? predicted;
  const pay = useMemo(() => lastPayment(txns, type), [txns, type]);
  const repeats = useMemo(() => recentRepeats(txns, type, today, 2), [txns, type, today]);

  const amount = Math.round(Number(raw || '0') * 100);
  const ordered = useMemo(() => {
    const first = categories.find((c) => c.id === categoryId);
    return first ? [first, ...categories.filter((c) => c.id !== first.id)] : categories;
  }, [categories, categoryId]);
  const chips = showAll ? ordered : ordered.slice(0, TOP_CATS);
  const catName = categories.find((c) => c.id === categoryId)?.name;

  const payLabel = !pay
    ? 'UPI'
    : pay.method === 'card'
      ? (cards.find((c) => c.id === pay.cardId)?.name ?? 'Card')
      : [METHOD_LABEL[pay.method], accounts.find((a) => a.id === pay.accountId)?.name].filter(Boolean).join(' · ');

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
      const method = draft.method ?? pay?.method ?? 'upi';
      const cardId = method === 'card' ? (draft.cardId ?? pay?.cardId ?? null) : null;
      const row = await saveTransaction({
        type,
        amount: draft.amount,
        occurredAt: toISO(date, date === today ? new Date().getHours() * 60 + new Date().getMinutes() : null),
        categoryId: draft.categoryId,
        payee: draft.payee ?? null,
        // A card payment with no card known falls back to UPI rather than saving an unusable card entry.
        method: method === 'card' && !cardId ? 'upi' : method,
        cardId,
        accountId: method === 'card' ? null : (draft.accountId ?? pay?.accountId ?? null),
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const name = categories.find((c) => c.id === draft.categoryId)?.name;
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

  const saveRepeat = (r: Repeat) => commit({ amount: r.amount, categoryId: r.categoryId, payee: r.payee, method: r.method, cardId: r.cardId, accountId: r.accountId });

  const moreDetails = () => {
    router.back();
    setTimeout(() => router.push({ pathname: '/txn/new', params: { type, ...(amount ? { amount: String(amount) } : {}), ...(categoryId ? { categoryId } : {}) } }), 10);
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
            <SmallToggle
              label={income ? 'Money in' : 'Expense'}
              icon="swap-vertical"
              hint="Switches between expense and money in"
              onPress={() => {
                setType(income ? 'expense' : 'income');
                setPicked(null);
                setShowAll(false);
              }}
            />
            <SmallToggle
              label={date === today ? 'Today' : date === yesterday ? 'Yesterday' : date}
              icon="calendar-outline"
              hint="Switches between today and yesterday. Other dates are in More details"
              warn={date !== today}
              onPress={() => setDate(date === today ? yesterday : today)}
            />
            <View style={{ flex: 1 }} />
            <IconButton name="close" label="Close" onPress={close} />
          </View>

          <View style={{ alignItems: 'center', gap: 2 }}>
            <Txt
              accessibilityLiveRegion="polite"
              accessibilityLabel={`${income ? 'Money in' : 'Amount'} ${amount ? formatINR(amount, { decimals: 'auto' }) : 'zero'}`}
              adjustsFontSizeToFit
              numberOfLines={1}
              style={{ fontWeight: fonts.bold, fontSize: 52, lineHeight: 62, fontVariant: ['tabular-nums'], color: raw ? (income ? colors.incomeText : colors.text) : colors.textFaint }}
            >
              <Txt style={{ fontWeight: fonts.semibold, fontSize: 38, color: colors.textMuted }}>{income ? '+₹' : '₹'}</Txt>
              {raw ? groupAmount(raw) : '0'}
            </Txt>
            <Txt variant="small" tone="muted" numberOfLines={1}>
              {catName ? (picked ? catName : `Suggested: ${catName}`) : first && !raw ? 'Log the last thing you paid for' : 'Pick a category, or save without one'}
            </Txt>
          </View>

          {repeats.length && !raw ? (
            <View style={{ flexDirection: 'row', gap: space(1) }}>
              {repeats.map((r) => (
                <Chip key={`${r.payee}|${r.amount}`} compact icon="refresh" label={`${r.payee} · ${formatINR(r.amount, { decimals: 'auto' })}`} onPress={() => saveRepeat(r)} />
              ))}
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(1) }}>
            {chips.map((c) => (
              <Chip key={c.id} compact icon={c.id === categoryId ? 'checkmark' : (c.icon as IconName)} label={c.name} selected={c.id === categoryId} onPress={() => setPicked(c.id === categoryId ? '' : c.id)} />
            ))}
            {categories.length > TOP_CATS ? <Chip compact label={showAll ? 'Fewer' : 'More…'} onPress={() => setShowAll((v) => !v)} /> : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
            <Txt variant="small" tone="muted" style={{ flex: 1 }} numberOfLines={1}>
              Paid with <Txt variant="small" style={{ fontWeight: fonts.semibold }}>{payLabel}</Txt>
            </Txt>
            <Pressable onPress={moreDetails} accessibilityRole="button" hitSlop={10} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Txt variant="small" style={{ color: colors.primary, fontWeight: fonts.semibold }}>
                Payee, note, more…
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
              onPress={() => commit({ amount, categoryId: categoryId || null })}
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
    </View>
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
