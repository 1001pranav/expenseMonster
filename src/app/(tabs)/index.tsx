import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, ScrollView, View } from 'react-native';
import { isSmsAvailable } from '../../../modules/sms-reader';
import { budgetUsage, spendByCategory } from '@/domain/budget';
import { addDays, formatMonth, monthKey, shortMonth } from '@/domain/dates';
import { formatINR } from '@/domain/money';
import { dailySpend, monthTotals } from '@/domain/transactions';
import { saveSettings } from '@/db/repo';
import { useStore } from '@/db/store';
import { useCategoryMap, useConfirmed, useDues, usePending, useTable, useToday } from '@/data/hooks';
import { scanSms } from '@/services/capture';
import { Bars, Donut, ProgressRing, type Slice } from '@/ui/components/charts';
import { Button, Card, EmptyState, IconButton, Money, Pill, Row, Section, Stat, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { DueCard, TxnRow, openPay } from '@/ui/components/rows';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

export default function Home() {
  const { colors } = useTheme();
  const today = useToday();
  const month = monthKey(today);
  const confirmed = useConfirmed();
  const all = useTable('transactions');
  const cats = useCategoryMap();
  const cards = useTable('cards');
  const budgets = useTable('budgets');
  const pending = usePending();
  const dues = useDues(14);
  const settings = useStore((s) => s.settings);
  const name = useStore((s) => s.identity.householdName);
  const [refreshing, setRefreshing] = useState(false);

  const totals = useMemo(() => monthTotals(confirmed, month), [confirmed, month]);
  const budgetTotal = useMemo(() => budgetUsage(budgets, confirmed, month).reduce((a, b) => a + b.limit, 0), [budgets, confirmed, month]);
  const slices: Slice[] = useMemo(() => {
    const spend = [...spendByCategory(confirmed, month).entries()].sort((a, b) => b[1] - a[1]);
    const top = spend.slice(0, 5).map(([id, value]) => ({ key: id, label: cats.get(id)?.name ?? 'Uncategorised', value, color: cats.get(id)?.color ?? colors.textFaint }));
    const rest = spend.slice(5).reduce((a, [, v]) => a + v, 0);
    return rest ? [...top, { key: 'others', label: 'Others', value: rest, color: colors.textFaint }] : top;
  }, [confirmed, month, cats, colors.textFaint]);
  const week = useMemo(() => dailySpend(confirmed, today, 7), [confirmed, today]);
  const recent = useMemo(() => all.filter((t) => t.status !== 'rejected').slice(0, 5), [all]);
  const reviewCount = pending.transactions.length + pending.bills.length;
  const upcoming = dues.filter((d) => d.state !== 'upcoming' || d.date <= addDays(today, 7));
  const dueTotal = upcoming.filter((d) => !d.incoming).reduce((a, d) => a + (d.amount ?? 0), 0);

  const refresh = async () => {
    if (!settings.smsEnabled) return;
    setRefreshing(true);
    try {
      const s = await scanSms();
      toast(s.added + s.bills ? `${s.added + s.bills} new from SMS` : 'No new bank SMS', { tone: s.added ? 'success' : 'default' });
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setRefreshing(false);
    }
  };

  const spentRatio = budgetTotal ? totals.expense / budgetTotal : 0;
  const showSmsPrompt = Platform.OS === 'android' && isSmsAvailable() && !settings.smsEnabled && !settings.smsPromptDismissed;

  return (
    <Screen
      tabBar
      refreshing={refreshing}
      onRefresh={settings.smsEnabled ? refresh : undefined}
      header={
        <Row style={{ paddingHorizontal: space(2), paddingTop: space(1), justifyContent: 'space-between' }}>
          <View>
            <Txt variant="small" tone="muted">
              {name}
            </Txt>
            <Txt variant="h1">{formatMonth(month)}</Txt>
          </View>
          <Row gap={0}>
            <IconButton name={settings.hideAmounts ? 'eye-off-outline' : 'eye-outline'} label={settings.hideAmounts ? 'Show amounts' : 'Hide amounts'} onPress={() => saveSettings({ hideAmounts: !settings.hideAmounts })} />
            <IconButton name="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
          </Row>
        </Row>
      }
    >
      <Card tone="primary" style={{ gap: space(2) }} onPress={() => router.push('/insights')}>
        <Row gap={2}>
          <ProgressRing value={budgetTotal ? spentRatio : 0} size={96} stroke={10} color={spentRatio >= 1 ? colors.expense : colors.primaryText} trackColor={`${colors.primaryText}38`}>
            <Txt variant="caption" tone="inverse">
              {budgetTotal ? `${Math.round(spentRatio * 100)}%` : 'SPENT'}
            </Txt>
          </ProgressRing>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="small" tone="inverse" style={{ opacity: 0.8 }}>
              Spent this month
            </Txt>
            <Money value={totals.expense} variant="display" tone="inverse" />
            <Txt variant="small" tone="inverse" style={{ opacity: 0.8 }}>
              {budgetTotal ? `of ${settings.hideAmounts ? '••••' : formatINR(budgetTotal)} budget` : 'Set budgets in Household → Budgets'}
            </Txt>
          </View>
        </Row>
        <Row gap={2}>
          <Stat label="Income" value={totals.income} tone="inverse" />
          <Stat label="Saved" value={totals.net} tone="inverse" />
          <Stat label="On cards" value={totals.cardSpend} tone="inverse" />
        </Row>
      </Card>

      {reviewCount > 0 ? (
        <Card onPress={() => router.push('/review')} style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5), borderWidth: 1.5, borderColor: colors.warn }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.warnSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Txt variant="h3" tone="warn">
              {reviewCount}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong">To review</Txt>
            <Txt variant="small" tone="muted">
              Captured from SMS & screenshots — swipe to approve
            </Txt>
          </View>
          <Pill label="Open" tone="warn" />
        </Card>
      ) : null}

      {showSmsPrompt ? (
        <Card style={{ gap: space(1.25) }}>
          <Row gap={1.5}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chatbubble-ellipses" size={22} color={colors.info} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">Read bank SMS automatically?</Txt>
              <Txt variant="small" tone="muted">
                Optional. Payments are suggested for you to approve. Say no and everything stays manual.
              </Txt>
            </View>
          </Row>
          <Row gap={1}>
            <Button title="Allow" size="sm" onPress={() => router.push('/settings/sms')} style={{ flex: 1 }} />
            <Button title="No, keep manual" size="sm" variant="secondary" onPress={() => saveSettings({ smsPromptDismissed: true })} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : null}

      <Section title="Due soon" action={upcoming.length ? `${formatINR(dueTotal, { compact: true })} · All` : 'All'} onAction={() => router.push('/dues')}>
        {upcoming.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(1.5), paddingRight: space(2), paddingVertical: 2 }} style={{ marginHorizontal: -space(2), paddingLeft: space(2) }}>
            {upcoming.map((d) => (
              <DueCard key={d.key} d={d} today={today} onPay={() => openPay(d)} />
            ))}
          </ScrollView>
        ) : (
          <Card>
            <Txt tone="muted">Nothing due in the next 7 days. 🎉</Txt>
          </Card>
        )}
      </Section>

      <Section title="Where it went" action="Insights" onAction={() => router.push('/insights')}>
        <Card onPress={() => router.push('/insights')}>
          {slices.length ? <Donut slices={slices} centerLabel="THIS MONTH" /> : <Txt tone="muted">No spending recorded this month yet.</Txt>}
        </Card>
      </Section>

      <Section title="Last 7 days">
        <Card>
          <Bars data={week.map((d) => ({ key: d.date, label: shortMonth(monthKey(d.date)) === shortMonth(month) ? String(Number(d.date.slice(8))) : d.date.slice(5), values: [d.amount] }))} colors={[colors.primary]} height={120} highlightLast />
        </Card>
      </Section>

      <Section title="Recent" action="See all" onAction={() => router.push('/activity')}>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {recent.length ? (
            recent.map((t) => <TxnRow key={t.id} t={t} cat={cats.get(t.categoryId ?? '')} card={cards.find((c) => c.id === t.cardId)} />)
          ) : (
            <EmptyState icon="receipt-outline" title="No transactions yet" body="Tap + to add one, share a payment screenshot, or turn on SMS capture." action="Add expense" onAction={() => router.push('/txn/new')} />
          )}
        </Card>
      </Section>
    </Screen>
  );
}
