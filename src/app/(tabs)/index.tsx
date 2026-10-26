import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { budgetUsage } from '@/domain/budget';
import { addMonths, daysInMonth, diffDays, monthKey, parts } from '@/domain/dates';
import type { DueItem } from '@/domain/dues';
import { comparableChange, monthTotals } from '@/domain/transactions';
import { saveSettings } from '@/db/repo';
import { useStore } from '@/db/store';
import { useCategoryMap, useConfirmed, useDues, useMembers, usePending, useSelfId, useTable, useToday } from '@/data/hooks';
import { Card, IconButton, IconCircle, Money, ProgressBar, Row, Section, Txt, useMoneyText, type IconName } from '@/ui/components/core';
import { DueRow, TxnRow, openPay } from '@/ui/components/rows';
import { Screen } from '@/ui/components/Screen';
import { fonts, space, useTheme } from '@/ui/theme';

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
  const dues = useDues(14);
  const settings = useStore((s) => s.settings);
  const household = useStore((s) => s.identity.householdName);

  const me = members.find((m) => m.id === selfId);
  const { y, m, d: dayOfMonth } = parts(today);
  const monthName = MONTH_NAMES[m - 1];
  const prevKey = monthKey(addMonths(today, -1));
  const prevName = MONTH_NAMES[parts(`${prevKey}-01`).m - 1];
  const totals = useMemo(() => monthTotals(confirmed, month), [confirmed, month]);
  // Same days of last month, so the 5th of October isn't compared with all of September.
  const prevSoFar = useMemo(() => monthTotals(confirmed, prevKey, dayOfMonth).expense, [confirmed, prevKey, dayOfMonth]);
  const change = comparableChange(totals.expense, prevSoFar);
  const budgetTotal = useMemo(() => budgetUsage(budgets, confirmed, month).reduce((a, b) => a + b.limit, 0), [budgets, confirmed, month]);
  const recent = useMemo(() => all.filter((t) => t.status !== 'rejected').slice(0, 5), [all]);
  const reviewCount = pending.transactions.length + pending.bills.length;

  const late = dues.filter((x) => x.state === 'overdue' && !x.incoming);
  const soon = dues.filter((x) => x.state !== 'overdue').slice(0, 3);
  const soonTotal = dues.filter((x) => x.state !== 'overdue' && !x.incoming).reduce((a, x) => a + (x.amount ?? 0), 0);
  const cardBills = dues.filter((x) => x.kind === 'card').reduce((a, x) => a + (x.amount ?? 0), 0);

  const ratio = budgetTotal ? totals.expense / budgetTotal : 0;
  const daysLeft = daysInMonth(y, m) - dayOfMonth + 1;
  const left = budgetTotal - totals.expense;

  const setup = [
    { label: 'Record your first expense', done: all.length > 0, href: '/txn/new' },
    { label: 'Add a credit card', done: cards.length > 0, href: '/card/new' },
    { label: 'Add an EMI, bill or policy', done: loans.length + billers.length + policies.length > 0, href: '/add' },
    { label: 'Set a monthly budget', done: budgets.length > 0, href: '/budgets' },
  ] as const;
  const setupDone = setup.filter((s) => s.done).length;
  const nextStep = setup.find((s) => !s.done);
  const showSetup = !settings.setupDismissed && nextStep;

  const initial = (me?.name ?? household).trim().charAt(0).toUpperCase() || '?';

  return (
    <Screen
      tabBar
      header={
        <Row style={{ paddingHorizontal: space(2), paddingTop: space(1), justifyContent: 'space-between' }}>
          <Txt variant="h3" style={{ fontFamily: fonts.display, fontSize: 18, flex: 1 }}>
            {monthName}
          </Txt>
          <IconButton name={settings.hideAmounts ? 'eye-off-outline' : 'eye-outline'} label={settings.hideAmounts ? 'Show amounts' : 'Hide amounts'} onPress={() => saveSettings({ hideAmounts: !settings.hideAmounts })} />
          <Pressable
            onPress={() => router.push('/hub')}
            accessibilityRole="button"
            accessibilityLabel={`You and ${household}`}
            hitSlop={4}
            style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: colors.text, alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}
          >
            <Txt style={{ fontFamily: fonts.display, fontSize: 15 }}>{initial}</Txt>
          </Pressable>
        </Row>
      }
    >
      <View style={{ gap: space(1.25), paddingHorizontal: 4 }}>
        <Txt variant="small" tone="muted">
          Spent this month
        </Txt>
        <Money value={totals.expense} variant="display" decimals="never" fit="narrow" />
        {budgetTotal ? (
          <>
            <ProgressBar value={ratio} color={ratio >= 1 ? colors.expense : ratio >= 0.8 ? colors.warn : colors.good} height={6} />
            <Row style={{ justifyContent: 'space-between' }} gap={1}>
              <Txt variant="small" tone={ratio >= 1 ? 'expense' : 'muted'} style={{ flexShrink: 1 }}>
                {left >= 0 ? `${Math.round(ratio * 100)}% of your ${money(budgetTotal, { decimals: 'never' })} budget` : `${money(-left, { decimals: 'never' })} over your budget`}
              </Txt>
              {left > 0 ? (
                <Txt variant="small" tone="muted">
                  {money(Math.floor(left / daysLeft), { decimals: 'never' })} a day left
                </Txt>
              ) : null}
            </Row>
          </>
        ) : (
          <Pressable onPress={() => router.push('/budgets')} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
            <Txt variant="small" style={{ color: colors.primary, fontFamily: fonts.bold }}>
              Set a monthly budget
            </Txt>
          </Pressable>
        )}
        {change !== null && Math.abs(change) >= 0.005 ? (
          <Txt variant="small" tone="muted">
            {Math.min(999, Math.abs(Math.round(change * 100)))}% {change > 0 ? 'more' : 'less'} than the same days of {prevName}
          </Txt>
        ) : null}
        <Row gap={2.75} style={{ marginTop: space(0.5) }}>
          <Stat label="Money in" value={totals.income} tone="income" />
          {totals.income ? <Stat label={totals.net < 0 ? 'Overspent' : 'Kept'} value={Math.abs(totals.net)} tone={totals.net < 0 ? 'expense' : 'default'} /> : null}
          {/* Three figures fit a narrow phone: in a month with investments, what went in replaces card bills. */}
          {totals.invested ? <Stat label={totals.invested < 0 ? 'Taken out' : 'Invested'} value={Math.abs(totals.invested)} /> : cardBills ? <Stat label="Card bills" value={cardBills} /> : null}
        </Row>
      </View>

      {late.length || reviewCount || showSetup ? (
        <View style={{ gap: space(1.25) }}>
          {late[0] ? <LateCard d={late[0]} today={today} more={late.length - 1} /> : null}
          {reviewCount ? (
            <AttentionRow
              icon="scan-outline"
              state="warn"
              title={reviewCount === 1 ? '1 capture needs a quick check' : `${reviewCount} captures need a quick check`}
              action="Check"
              onPress={() => router.push('/review')}
            />
          ) : null}
          {showSetup ? (
            <AttentionRow
              icon="checkmark-done-outline"
              title={`Finish setting up, ${setupDone} of ${setup.length} done`}
              subtitle={`Next: ${nextStep.label.toLowerCase()}`}
              action="Go"
              onPress={() => router.push(nextStep.href as never)}
              onClose={() => saveSettings({ setupDismissed: true })}
            />
          ) : null}
        </View>
      ) : null}

      <Section title="Due soon" action="All dues" onAction={() => router.push('/dues')}>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {soon.length ? (
            soon.map((x, i) => (
              <View key={x.key}>
                {i ? <View style={{ height: 1, backgroundColor: colors.surfaceAlt, marginLeft: space(8.5) }} /> : null}
                <DueRow d={x} today={today} onPay={() => openPay(x)} />
              </View>
            ))
          ) : (
            <Row gap={1.5} style={{ padding: space(2) }}>
              <IconCircle name="checkmark-done" state="good" />
              <Txt tone="muted" style={{ flex: 1 }}>
                Nothing due in the next two weeks.
              </Txt>
            </Row>
          )}
        </Card>
        {soonTotal ? (
          <Txt variant="small" tone="muted" style={{ paddingHorizontal: 4 }}>
            {money(soonTotal, { decimals: 'never' })} due in the next two weeks
          </Txt>
        ) : null}
      </Section>

      <Section title="Recent" action="All spending" onAction={() => router.push('/activity')}>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {recent.length ? (
            recent.map((t, i) => (
              <View key={t.id}>
                {i ? <View style={{ height: 1, backgroundColor: colors.surfaceAlt, marginLeft: space(8.5) }} /> : null}
                <TxnRow t={t} cat={cats.get(t.categoryId ?? '')} card={cards.find((c) => c.id === t.cardId)} />
              </View>
            ))
          ) : (
            <View style={{ padding: space(2), gap: space(1) }}>
              <Txt tone="muted">Nothing recorded yet. Tap + to add an expense, or share a payment screenshot to this app.</Txt>
            </View>
          )}
        </Card>
      </Section>
    </Screen>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'income' | 'expense' }) {
  return (
    <View style={{ gap: 2 }}>
      <Txt variant="small" tone="muted">
        {label}
      </Txt>
      <Money value={value} variant="bodyStrong" tone={tone} decimals="never" />
    </View>
  );
}

/** The one late payment that matters most, with the action to fix it. */
function LateCard({ d, today, more }: { d: DueItem; today: string; more: number }) {
  const days = Math.max(1, diffDays(today, d.date));
  return (
    <Card style={{ gap: space(1.25) }}>
      <Row gap={1.5}>
        <IconCircle name={d.icon as IconName} state="expense" />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">
            {d.title} is {days === 1 ? '1 day' : `${days} days`} late
          </Txt>
          {d.amount ? <Money value={d.amount} variant="small" tone="muted" /> : null}
        </View>
        <PayButton label="Pay" onPress={() => openPay(d)} />
      </Row>
      {more > 0 ? (
        <Pressable onPress={() => router.push('/dues')} accessibilityRole="button" hitSlop={8}>
          <Txt variant="small" tone="expense">
            {more === 1 ? '1 more payment is late' : `${more} more payments are late`}
          </Txt>
        </Pressable>
      ) : null}
    </Card>
  );
}

function AttentionRow({ icon, state, title, subtitle, action, onPress, onClose }: { icon: IconName; state?: 'warn'; title: string; subtitle?: string; action: string; onPress: () => void; onClose?: () => void }) {
  const { colors } = useTheme();
  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5), paddingVertical: space(1.5) }}>
      <IconCircle name={icon} state={state} />
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        {subtitle ? (
          <Txt variant="small" tone="muted">
            {subtitle}
          </Txt>
        ) : null}
      </View>
      <Txt variant="small" style={{ color: colors.primary, fontFamily: fonts.bold }}>
        {action}
      </Txt>
      {onClose ? <IconButton name="close" label="Hide" size={18} onPress={onClose} /> : null}
    </Card>
  );
}

function PayButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ height: 40, paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      <Txt variant="bodyStrong" style={{ color: colors.primaryText }}>
        {label}
      </Txt>
    </Pressable>
  );
}

