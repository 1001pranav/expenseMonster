import { router } from 'expo-router';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, View } from 'react-native';
import { budgetUsage, spendByCategory } from '@/domain/budget';
import { addDays, addMonths, daysInMonth, monthKey, parts, shortMonth, toDate } from '@/domain/dates';
import { comparableChange, dailySpend, monthTotals } from '@/domain/transactions';
import { saveSettings } from '@/db/repo';
import { useStore } from '@/db/store';
import { useCategoryMap, useConfirmed, useDues, useMembers, usePending, useSelfId, useTable, useToday } from '@/data/hooks';
import { GradientTile } from '@/ui/components/Aurora';
import { Avatar } from '@/ui/components/Avatar';
import { Bars, Donut, type Slice } from '@/ui/components/charts';
import { Card, EmptyState, IconButton, Money, Pill, ProgressBar, Row, Section, Stat, Txt, useMoneyText, type IconName } from '@/ui/components/core';
import { DueCard, TxnRow, openPay } from '@/ui/components/rows';
import { Screen } from '@/ui/components/Screen';
import { radius, space, useTheme, type GradientName } from '@/ui/theme';

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function greeting(hour: number) {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

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
  const monthDays = daysInMonth(y, m);
  const totals = useMemo(() => monthTotals(confirmed, month), [confirmed, month]);
  // Same days of last month, so the 5th of October isn't compared with all of September.
  const prevMonth = monthKey(addMonths(today, -1));
  const prevSoFar = useMemo(() => monthTotals(confirmed, prevMonth, dayOfMonth).expense, [confirmed, prevMonth, dayOfMonth]);
  const change = comparableChange(totals.expense, prevSoFar);
  const budgetTotal = useMemo(() => budgetUsage(budgets, confirmed, month).reduce((a, b) => a + b.limit, 0), [budgets, confirmed, month]);
  const slices: Slice[] = useMemo(() => {
    const spend = [...spendByCategory(confirmed, month).entries()].sort((a, b) => b[1] - a[1]);
    const top = spend.slice(0, 5).map(([id, value]) => ({ key: id, label: cats.get(id)?.name ?? 'Uncategorised', value, color: cats.get(id)?.color ?? colors.textFaint }));
    const rest = spend.slice(5).reduce((a, [, v]) => a + v, 0);
    return rest ? [...top, { key: 'others', label: 'Others', value: rest, color: colors.textFaint }] : top;
  }, [confirmed, month, cats, colors.textFaint]);
  const week = useMemo(() => dailySpend(confirmed, today, 7), [confirmed, today]);
  const weekTotal = week.reduce((a, d) => a + d.amount, 0);
  const recent = useMemo(() => all.filter((t) => t.status !== 'rejected').slice(0, 5), [all]);
  const reviewCount = pending.transactions.length + pending.bills.length;
  const upcoming = dues.filter((d) => d.state !== 'upcoming' || d.date <= addDays(today, 7));
  const dueTotal = upcoming.filter((d) => !d.incoming).reduce((a, d) => a + (d.amount ?? 0), 0);
  const overdueCount = upcoming.filter((d) => d.state === 'overdue').length;

  const spentRatio = budgetTotal ? totals.expense / budgetTotal : 0;
  const daysLeft = monthDays - dayOfMonth + 1;
  const left = budgetTotal - totals.expense;
  const pace = budgetTotal
    ? left > 0
      ? `${money(Math.floor(left / daysLeft), { decimals: 'never' })}/day for ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`
      : `Over by ${money(-left, { decimals: 'never' })}`
    : `${money(Math.round(totals.expense / dayOfMonth), { decimals: 'never' })}/day on average`;

  const setup = [
    { label: 'Record your first expense', hint: 'Or share a GPay / PhonePe screenshot', done: all.length > 0, href: '/txn/new' },
    { label: 'Add a credit card', hint: 'See each bill before the bank sends it', done: cards.length > 0, href: '/card/new' },
    { label: 'Add an EMI, bill or policy', hint: 'Get reminded before every due date', done: loans.length + billers.length + policies.length > 0, href: '/add' },
    { label: 'Set a monthly budget', hint: 'Know how much you can still spend', done: budgets.length > 0, href: '/budgets' },
  ] as const;
  const setupDone = setup.filter((s) => s.done).length;
  const showSetup = !settings.setupDismissed && setupDone < setup.length;

  return (
    <Screen
      tabBar
      header={
        <Row style={{ paddingHorizontal: space(2), paddingTop: space(1), paddingBottom: space(0.5), justifyContent: 'space-between' }}>
          <Pressable onPress={() => router.push('/household')} accessibilityRole="button" accessibilityLabel={`${household} household`} style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.25), flex: 1, minWidth: 0 }}>
            <Avatar name={me?.name ?? household} color={me?.color ?? colors.primary} size={42} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="small" tone="muted" numberOfLines={1}>
                {greeting(new Date().getHours())}
              </Txt>
              <Txt variant="h2" numberOfLines={1}>
                {me?.name.split(' ')[0] ?? household}
              </Txt>
            </View>
          </Pressable>
          <Row gap={0}>
            <IconButton name={settings.hideAmounts ? 'eye-off-outline' : 'eye-outline'} label={settings.hideAmounts ? 'Show amounts' : 'Hide amounts'} onPress={() => saveSettings({ hideAmounts: !settings.hideAmounts })} />
            <View>
              <IconButton name="notifications-outline" label={reviewCount ? `${reviewCount} to review` : 'Review captures'} onPress={() => router.push('/review')} />
              {reviewCount ? <View pointerEvents="none" style={{ position: 'absolute', top: 10, right: 11, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.expense, borderWidth: 1.5, borderColor: colors.bg }} /> : null}
            </View>
            <IconButton name="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
          </Row>
        </Row>
      }
    >
      <Card tone="primary" style={{ gap: space(2) }} onPress={() => router.push('/insights')}>
        <View style={{ gap: 2 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="small" tone="inverse" style={{ opacity: 0.85 }}>
              Spent in {shortMonth(month)}
            </Txt>
            {change !== null ? <ChangePill change={change} label={`vs ${shortMonth(prevMonth)}`} /> : null}
          </Row>
          <Money value={totals.expense} variant="display" tone="inverse" fit="narrow" decimals="never" />
        </View>

        {budgetTotal ? (
          <View style={{ gap: 6 }}>
            <ProgressBar value={spentRatio} color={spentRatio >= 1 ? '#FFB4B6' : colors.primaryText} trackColor="rgba(255,255,255,0.22)" height={6} />
            <Row style={{ justifyContent: 'space-between' }} gap={1}>
              <Txt variant="small" tone="inverse" style={{ opacity: 0.85 }} numberOfLines={1}>
                {Math.round(spentRatio * 100)}% of {money(budgetTotal, { compact: true })}
              </Txt>
              <Txt variant="small" tone="inverse" style={{ opacity: 0.85, flexShrink: 1 }} numberOfLines={1}>
                {pace}
              </Txt>
            </Row>
          </View>
        ) : (
          <Row style={{ justifyContent: 'space-between' }} gap={1}>
            <Txt variant="small" tone="inverse" style={{ opacity: 0.85, flexShrink: 1 }} numberOfLines={1}>
              {totals.expense ? pace : 'Nothing spent yet this month'}
            </Txt>
            <Pressable
              onPress={() => router.push('/budgets')}
              accessibilityRole="button"
              hitSlop={6}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 28, borderRadius: radius.pill, backgroundColor: pressed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.18)' })}
            >
              <Txt variant="small" tone="inverse">
                Set budget
              </Txt>
              <Ionicons name="arrow-forward" size={13} color={colors.primaryText} />
            </Pressable>
          </Row>
        )}

        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.16)' }} />
        <Row gap={2}>
          <Stat label="Income" value={totals.income} tone="inverse" />
          <Stat label={totals.net < 0 ? 'Overspent' : 'Saved'} value={Math.abs(totals.net)} tone="inverse" />
          <Stat label="On cards" value={totals.cardSpend} tone="inverse" />
        </Row>
      </Card>

      <Row gap={1} style={{ justifyContent: 'space-between' }}>
        <QuickAction icon="bar-chart" label="Insights" gradient="violet" onPress={() => router.push('/insights')} />
        <QuickAction icon="pie-chart" label="Budgets" gradient="sunset" onPress={() => router.push('/budgets')} />
        <QuickAction icon="receipt" label="Tax saver" gradient="mint" onPress={() => router.push('/tax')} />
        <QuickAction icon="scan" label="Scan" gradient="ocean" onPress={() => router.push('/scan')} />
      </Row>

      {reviewCount > 0 ? (
        <Card onPress={() => router.push('/review')} style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5), borderWidth: 1.5, borderColor: colors.warn }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.warnSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Txt variant="h3" tone="warn">
              {reviewCount}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong">{reviewCount === 1 ? '1 entry to review' : `${reviewCount} entries to review`}</Txt>
            <Txt variant="small" tone="muted">
              Captured from screenshots & pasted SMS — swipe to approve
            </Txt>
          </View>
          <Pill label="Review" tone="warn" />
        </Card>
      ) : null}

      {showSetup ? (
        <Card style={{ gap: space(1.25) }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt variant="h3">Finish setting up</Txt>
              <Txt variant="small" tone="muted">
                {setupDone} of {setup.length} done · about 2 minutes
              </Txt>
            </View>
            <IconButton name="close" label="Hide setup checklist" size={20} onPress={() => saveSettings({ setupDismissed: true })} />
          </Row>
          <ProgressBar value={setupDone / setup.length} color={colors.income} height={6} />
          <View>
            {setup.map((s) => (
              <Pressable
                key={s.label}
                disabled={s.done}
                onPress={() => router.push(s.href as never)}
                accessibilityRole="button"
                accessibilityState={{ checked: s.done, disabled: s.done }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(1.5), paddingVertical: space(1), opacity: pressed ? 0.6 : 1 })}
              >
                <Ionicons name={s.done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={s.done ? colors.income : colors.textFaint} />
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong" tone={s.done ? 'faint' : 'default'} style={s.done ? { textDecorationLine: 'line-through' } : undefined}>
                    {s.label}
                  </Txt>
                  {!s.done ? (
                    <Txt variant="small" tone="muted">
                      {s.hint}
                    </Txt>
                  ) : null}
                </View>
                {!s.done ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null}
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}

      <Section title="Due soon" action={upcoming.length ? `${money(dueTotal, { compact: true })} · See all` : 'See all'} onAction={() => router.push('/dues')}>
        {upcoming.length ? (
          <>
            {overdueCount ? (
              <Row gap={0.75} style={{ paddingHorizontal: 4 }}>
                <Ionicons name="alert-circle" size={16} color={colors.expense} />
                <Txt variant="small" tone="expense">
                  {overdueCount === 1 ? '1 payment is overdue' : `${overdueCount} payments are overdue`} — late fees and credit score at risk
                </Txt>
              </Row>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(1.5), paddingRight: space(4), paddingVertical: 2 }} style={{ marginHorizontal: -space(2), paddingLeft: space(2) }}>
              {upcoming.map((d) => (
                <DueCard key={d.key} d={d} today={today} onPay={() => openPay(d)} />
              ))}
            </ScrollView>
          </>
        ) : (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5) }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.incomeSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark-done" size={20} color={colors.income} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">You're all clear</Txt>
              <Txt variant="small" tone="muted">
                Nothing due in the next 7 days
              </Txt>
            </View>
          </Card>
        )}
      </Section>

      <Section title="Where it went" action="Insights" onAction={() => router.push('/insights')}>
        <Card>
          {slices.length ? (
            <Donut slices={slices} centerLabel={shortMonth(month).toUpperCase()} onSelect={(k) => k !== 'others' && router.push({ pathname: '/activity', params: { category: k } })} />
          ) : (
            <EmptyState icon="pie-chart-outline" title="No spending yet" body="Your category split appears here once you record an expense." />
          )}
        </Card>
      </Section>

      <Section title={weekTotal ? `Last 7 days · ${money(weekTotal, { compact: true })}` : 'Last 7 days'}>
        <Card>
          <Bars
            data={week.map((d) => ({ key: d.date, label: d.date === today ? 'Today' : WEEKDAY[toDate(d.date).getDay()], values: [d.amount] }))}
            colors={[colors.primary]}
            height={120}
            highlightLast
          />
        </Card>
      </Section>

      <Section title="Recent" action="See all" onAction={() => router.push('/activity')}>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {recent.length ? (
            recent.map((t) => <TxnRow key={t.id} t={t} cat={cats.get(t.categoryId ?? '')} card={cards.find((c) => c.id === t.cardId)} />)
          ) : (
            <EmptyState icon="receipt-outline" title="No transactions yet" body="Tap + to add one, share a payment screenshot, or paste a bank SMS." action="Add expense" onAction={() => router.push('/txn/new')} />
          )}
        </Card>
      </Section>
    </Screen>
  );
}

/** Month-over-month spend change. Spending less is good news, so "down" is the positive tone. */
function ChangePill({ change, label }: { change: number; label: string }) {
  const { colors } = useTheme();
  const flat = Math.abs(change) < 0.005;
  const pct = Math.min(999, Math.abs(Math.round(change * 100)));
  return (
    <View
      accessibilityLabel={flat ? `Same as ${label}` : `Spending ${change > 0 ? 'up' : 'down'} ${pct} percent ${label}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, height: 24, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.18)' }}
    >
      {!flat ? <Ionicons name={change > 0 ? 'trending-up' : 'trending-down'} size={13} color={colors.primaryText} /> : null}
      <Txt variant="caption" tone="inverse">
        {flat ? 'Same' : `${pct}%`} {label}
      </Txt>
    </View>
  );
}

function QuickAction({ icon, label, gradient, onPress }: { icon: IconName; label: string; gradient: GradientName; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 8, opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      <GradientTile icon={icon} gradient={gradient} size={54} />
      <Txt variant="small" numberOfLines={1}>
        {label}
      </Txt>
    </Pressable>
  );
}
