import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { budgetUsage, committedDues, safeToSpend } from '@/domain/budget';
import { splitCaptures } from '@/domain/captures';
import { addDays, daysInMonth, monthKey, parts, type YMD } from '@/domain/dates';
import { comparableChange, dayTotals, monthTotals } from '@/domain/transactions';
import type { Transaction } from '@/domain/types';
import { saveSettings } from '@/db/repo';
import { useStore } from '@/db/store';
import { useCategoryMap, useConfirmed, useDues, useMembers, usePending, useSelfId, useTable, useToday } from '@/data/hooks';
import { Ionicons } from '@expo/vector-icons';
import { IconButton, IconCircle, Money, ProgressBar, Row, Txt, useMoneyText, type IconName } from '@/ui/components/core';
import { smsCaptureAvailable } from '@/services/smsInbox';
import { DueRow, TxnRow, openPay } from '@/ui/components/rows';
import { Screen } from '@/ui/components/Screen';
import { fonts, space, useTheme, type Colors } from '@/ui/theme';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Home() {
  const { colors } = useTheme();
  const money = useMoneyText();
  const today = useToday();
  const month = monthKey(today);
  const confirmed = useConfirmed();
  const all = useTable('transactions');
  const cats = useCategoryMap();
  const cards = useTable('cards');
  const budgets = useTable('budgets');
  const loans = useTable('loans');
  const billers = useTable('billers');
  const policies = useTable('policies');
  const members = useMembers();
  const selfId = useSelfId();
  const pending = usePending();
  // Far enough to reach the month's end (for safe-to-spend); the list shows the next 15 days.
  const dues = useDues(31);
  const settings = useStore((s) => s.settings);
  const household = useStore((s) => s.identity.householdName);

  const me = members.find((m) => m.id === selfId);
  const { y, m, d: dayOfMonth } = parts(today);
  const monthName = MONTH_NAMES[m - 1];
  const totals = useMemo(() => monthTotals(confirmed, month), [confirmed, month]);
  const todays = useMemo(() => dayTotals(confirmed, today), [confirmed, today]);
  const budgetTotal = useMemo(() => budgetUsage(budgets, confirmed, month).reduce((a, b) => a + b.limit, 0), [budgets, confirmed, month]);
  const recent = useMemo(() => all.filter((t) => t.status !== 'rejected').slice(0, 3), [all]);
  const week = useMemo(() => weekSoFar(confirmed, today), [confirmed, today]);
  const reviewCount = pending.transactions.length + pending.bills.length;
  const fromSms = useMemo(() => pending.transactions.filter((t) => t.source === 'sms'), [pending.transactions]);
  const smsReady = useMemo(() => splitCaptures(fromSms).ready.length, [fromSms]);
  // Offered once, until the user imports or closes it: Android asks for SMS access only after they tap Allow.
  const offerSms = smsCaptureAvailable && !settings.smsImportedTo && !settings.smsOfferDismissed;

  const monthEnd = `${month}-${String(daysInMonth(y, m)).padStart(2, '0')}` as YMD;
  const horizon = addDays(today, 15);
  const outgoing = dues.filter((x) => !x.incoming);
  // Overdue first, then by date; at most four rows on Home.
  const upcoming = dues.filter((x) => x.state === 'overdue' || x.date <= horizon);
  const shown = [...upcoming.filter((x) => x.state === 'overdue' && !x.incoming), ...upcoming.filter((x) => x.state !== 'overdue')].slice(0, 4);
  const dueTotal = outgoing.filter((x) => x.state === 'overdue' || x.date <= horizon).reduce((a, x) => a + (x.amount ?? 0), 0);
  const lateCount = outgoing.filter((x) => x.state === 'overdue').length;

  const daysLeft = daysInMonth(y, m) - dayOfMonth + 1;
  const safe = budgetTotal
    ? safeToSpend({ budget: budgetTotal, spentBeforeToday: totals.expense - todays.expense, spentToday: todays.expense, committed: committedDues(dues, monthEnd), daysLeft })
    : null;
  const monthRatio = budgetTotal ? totals.expense / budgetTotal : 0;

  const setup = [
    { label: 'Record your first expense', done: all.length > 0, href: '/quick-add' },
    { label: 'Set a monthly budget', done: budgets.length > 0, href: '/budgets' },
    { label: 'Add a card, EMI, bill or policy', done: cards.length + loans.length + billers.length + policies.length > 0, href: '/add' },
  ] as const;
  const setupDone = setup.filter((s) => s.done).length;
  const nextStep = setup.find((s) => !s.done);
  const showSetup = !settings.setupDismissed && nextStep;

  const initial = (me?.name ?? household).trim().charAt(0).toUpperCase() || '?';
  const payments = todays.payments ? (todays.payments === 1 ? '1 payment' : `${todays.payments} payments`) : 'Nothing spent yet';

  return (
    <Screen
      tabBar
      header={
        <Row style={{ paddingHorizontal: space(2), paddingTop: space(1), gap: space(1) }}>
          <Pressable
            onPress={() => router.push('/hub')}
            accessibilityRole="button"
            accessibilityLabel={`You and ${household}`}
            hitSlop={4}
            style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: colors.text, alignItems: 'center', justifyContent: 'center' }}
          >
            <Txt style={{ fontWeight: fonts.semibold, fontSize: 15 }}>{initial}</Txt>
          </Pressable>
          <Txt variant="h3" style={{ flex: 1, fontSize: 17 }}>
            {monthName}
          </Txt>
          <IconButton name={settings.hideAmounts ? 'eye-off-outline' : 'eye-outline'} label={settings.hideAmounts ? 'Show amounts' : 'Hide amounts'} onPress={() => saveSettings({ hideAmounts: !settings.hideAmounts })} />
        </Row>
      }
    >
      {/* The one answer Home exists for: am I okay today? Everything else is below it. */}
      <Pressable onPress={() => router.push({ pathname: '/activity', params: { day: today } })} accessibilityRole="button" style={{ gap: space(0.75), paddingHorizontal: 4 }}>
        {safe ? (
          <>
            <Txt tone="muted">{safe.left < 0 ? 'Over today’s budget by' : 'Safe to spend today'}</Txt>
            <Money value={Math.abs(safe.left)} variant="display" decimals="never" fit="narrow" tone={safe.state === 'over' ? 'expense' : 'default'} />
            <ProgressBar value={safe.allowance ? todays.expense / safe.allowance : 1} height={6} color={safe.state === 'over' ? colors.expense : safe.state === 'close' ? colors.warn : colors.primary} />
            <StatusLine safe={safe} spent={todays.expense} payments={payments} money={money} colors={colors} />
          </>
        ) : (
          <>
            <Txt tone="muted">Spent today</Txt>
            <Money value={Math.max(0, todays.expense)} variant="display" decimals="never" fit="narrow" />
            <Txt variant="small" tone="muted">
              {payments}
            </Txt>
          </>
        )}
      </Pressable>

      <View style={{ gap: space(1.5) }}>
        <Divider colors={colors} />
        <Row gap={1} style={{ paddingHorizontal: 4, alignItems: 'baseline' }}>
          <Txt tone="muted" style={{ flex: 1 }}>
            This week
          </Txt>
          <Money value={week.spent} variant="body" decimals="never" style={{ fontWeight: fonts.medium }} />
          {week.change !== null && Math.abs(week.change) >= 0.01 ? (
            <Row gap={0.25} style={{ alignItems: 'center' }}>
              <Ionicons name={week.change > 0 ? 'arrow-up' : 'arrow-down'} size={12} color={week.change > 0 ? colors.warnText : colors.textMuted} />
              <Txt variant="caption" style={{ color: week.change > 0 ? colors.warnText : colors.textMuted }}>
                {Math.min(999, Math.abs(Math.round(week.change * 100)))}% vs last week
              </Txt>
            </Row>
          ) : null}
        </Row>
        <View style={{ gap: space(1), paddingHorizontal: 4 }}>
          <Row gap={1} style={{ alignItems: 'baseline' }}>
            <Txt tone="muted" style={{ flex: 1 }}>
              {monthName}
            </Txt>
            <Txt style={{ fontWeight: fonts.medium, fontVariant: ['tabular-nums'] }}>
              {money(totals.expense, { decimals: 'never' })}
              {budgetTotal ? <Txt tone="faint">{` of ${money(budgetTotal, { decimals: 'never' })}`}</Txt> : null}
            </Txt>
          </Row>
          {budgetTotal ? (
            <Row gap={1.25} style={{ alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <ProgressBar value={monthRatio} height={4} color={monthRatio >= 1 ? colors.expense : monthRatio >= 0.85 ? colors.warn : colors.primary} />
              </View>
              <Txt variant="caption" tone={monthRatio >= 1 ? 'expense' : 'faint'}>
                {monthRatio >= 1 ? 'Over budget' : `${Math.round(monthRatio * 100)}%`} · {daysLeft === 1 ? 'last day' : `${daysLeft} days left`}
              </Txt>
            </Row>
          ) : (
            <Pressable onPress={() => router.push('/budgets')} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}>
              <Txt variant="small" style={{ color: colors.primary, fontWeight: fonts.semibold }}>
                Set a monthly budget to see what’s safe to spend
              </Txt>
            </Pressable>
          )}
          {totals.income ? (
            <Txt variant="small" tone="muted">
              <Txt variant="small" tone="income" style={{ fontWeight: fonts.semibold }}>{`+${money(totals.income, { decimals: 'never' })}`}</Txt> came in this month
            </Txt>
          ) : null}
        </View>
        <Divider colors={colors} />
      </View>

      <View style={{ gap: space(0.5) }}>
        <SectionHead
          title={dueTotal ? `Next 15 days · ${money(dueTotal, { decimals: 'never' })} due` : 'Next 15 days'}
          action={lateCount ? `${lateCount} late` : 'See all'}
          actionTone={lateCount ? 'expense' : 'primary'}
          onAction={() => router.push('/dues')}
        />
        {shown.length ? (
          shown.map((x) => <DueRow key={x.key} d={x} today={today} onPay={() => openPay(x)} />)
        ) : (
          <Row gap={1.5} style={{ paddingHorizontal: 4, paddingVertical: space(1) }}>
            <IconCircle name="checkmark-done" state="good" />
            <Txt tone="muted" style={{ flex: 1 }}>
              Nothing due in the next 15 days.
            </Txt>
          </Row>
        )}
      </View>

      {reviewCount || offerSms || showSetup ? (
        <View>
          <Divider colors={colors} />
          {reviewCount ? (
            <AttentionRow
              icon={fromSms.length === reviewCount ? 'chatbubble-ellipses-outline' : 'scan-outline'}
              state="warn"
              title={fromSms.length === reviewCount ? `${reviewCount} from bank SMS to check` : reviewCount === 1 ? '1 capture to check' : `${reviewCount} captures to check`}
              subtitle={fromSms.length === reviewCount && smsReady ? `${smsReady} read clearly · ${reviewCount - smsReady} need a look` : undefined}
              action="Review"
              onPress={() => router.push('/review')}
            />
          ) : null}
          {offerSms ? (
            <AttentionRow
              icon="chatbubble-ellipses-outline"
              title="Record bank payments from SMS"
              subtitle="Reads bank messages on this phone, only if you allow it"
              action="Turn on"
              onPress={() => router.push('/settings/sms')}
              onClose={() => saveSettings({ smsOfferDismissed: true })}
            />
          ) : null}
          {showSetup ? (
            <AttentionRow
              icon="checkmark-done-outline"
              title={`Getting started, ${setupDone} of ${setup.length} done`}
              subtitle={`Next: ${nextStep.label.toLowerCase()}`}
              action="Go"
              onPress={() => router.push(nextStep.href as never)}
              onClose={() => saveSettings({ setupDismissed: true })}
            />
          ) : null}
          <Divider colors={colors} />
        </View>
      ) : (
        <Divider colors={colors} />
      )}

      <View style={{ gap: space(0.5) }}>
        <SectionHead title="Recent" action="All activity" onAction={() => router.push('/activity')} />
        {recent.length ? (
          recent.map((t) => <TxnRow key={t.id} t={t} cat={cats.get(t.categoryId ?? '')} card={cards.find((c) => c.id === t.cardId)} />)
        ) : (
          <Txt tone="muted" style={{ paddingHorizontal: 4, paddingVertical: space(1) }}>
            Nothing logged yet. Tap + to add your first expense, or share a payment screenshot to this app.
          </Txt>
        )}
      </View>
    </Screen>
  );
}

/** What today's figure means and what happens next: always words plus an icon, never colour alone. */
function StatusLine({ safe, spent, payments, money, colors }: { safe: ReturnType<typeof safeToSpend>; spent: number; payments: string; money: ReturnType<typeof useMoneyText>; colors: Colors }) {
  const opts = { decimals: 'never' } as const;
  if (safe.state === 'over') {
    const text =
      safe.allowance === 0
        ? 'This month’s budget is used up'
        : `${money(spent, opts)} of ${money(safe.allowance, opts)} spent${safe.tomorrow !== null ? ` · tomorrow’s adjusted to ${money(safe.tomorrow, opts)}` : ''}`;
    return (
      <Row gap={0.75} style={{ alignItems: 'center' }}>
        <Ionicons name="alert-circle" size={16} color={colors.expenseText} />
        <Txt variant="small" tone="expense" style={{ flex: 1, fontWeight: fonts.medium }}>
          {text}
        </Txt>
      </Row>
    );
  }
  return (
    <Row gap={0.75} style={{ alignItems: 'center' }}>
      {safe.state === 'close' ? <Ionicons name="contrast-outline" size={16} color={colors.warnText} /> : null}
      <Txt variant="small" tone={safe.state === 'close' ? 'warn' : 'muted'} style={{ flex: 1, fontVariant: ['tabular-nums'] }}>
        {safe.state === 'close' ? 'Close to today’s limit · ' : ''}
        {money(spent, opts)} of {money(safe.allowance, opts)} spent · {payments.toLowerCase()}
      </Txt>
    </Row>
  );
}

/** Expense spent Monday→today, and the change against the same weekdays last week. */
function weekSoFar(txns: Transaction[], today: YMD) {
  const { y, m, d } = parts(today);
  const sinceMonday = (new Date(y, m - 1, d).getDay() + 6) % 7;
  let spent = 0;
  let before = 0;
  for (let i = 0; i <= sinceMonday; i++) {
    const day = addDays(today, -i);
    spent += dayTotals(txns, day).expense;
    before += dayTotals(txns, addDays(day, -7)).expense;
  }
  return { spent, change: comparableChange(spent, before) };
}

function Divider({ colors }: { colors: Colors }) {
  return <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 4 }} />;
}

function SectionHead({ title, action, actionTone = 'primary', onAction }: { title: string; action?: string; actionTone?: 'primary' | 'expense'; onAction?: () => void }) {
  return (
    <Row style={{ paddingHorizontal: 4, alignItems: 'center', minHeight: 44 }}>
      <Txt variant="caption" tone="faint" style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: fonts.semibold }}>
        {title}
      </Txt>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
          <Txt variant="small" tone={actionTone} style={{ fontWeight: fonts.semibold }}>
            {action}
          </Txt>
        </Pressable>
      ) : null}
    </Row>
  );
}

function AttentionRow({ icon, state, title, subtitle, action, onPress, onClose }: { icon: IconName; state?: 'warn'; title: string; subtitle?: string; action: string; onPress: () => void; onClose?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(1.5), paddingVertical: space(1.25), paddingHorizontal: 4, minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
      <IconCircle name={icon} state={state} />
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        {subtitle ? (
          <Txt variant="small" tone="muted">
            {subtitle}
          </Txt>
        ) : null}
      </View>
      <Txt variant="small" style={{ color: colors.primary, fontWeight: fonts.semibold }}>
        {action}
      </Txt>
      {onClose ? <IconButton name="close" label="Hide" size={18} onPress={onClose} /> : null}
    </Pressable>
  );
}
