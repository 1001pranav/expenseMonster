import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { billerMeta, predictNextLpg, prepaidStatus, usageInsight, viewBill } from '@/domain/bills';
import { formatDay, monthKey, relativeDay, shortMonth } from '@/domain/dates';
import { formatINR } from '@/domain/money';
import { FREQUENCY_LABEL } from '@/domain/recurrence';
import { remove, restore, update } from '@/db/repo';
import { useDues, useTable, useToday } from '@/data/hooks';
import { Bars, LineChart } from '@/ui/components/charts';
import { Button, Card, EmptyState, IconButton, IconCircle, ListRow, Money, Pill, Row, Section, Txt, type IconName } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { openPay } from '@/ui/components/rows';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

const STATE_LABEL = { draft: 'Draft', upcoming: 'Upcoming', due: 'Due', part_paid: 'Part paid', paid: 'Paid', overdue: 'Overdue', skipped: 'Skipped' } as const;

export default function BillerDetail() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const biller = useTable('billers').find((b) => b.id === id);
  const allBills = useTable('bills');
  const txns = useTable('transactions');
  const today = useToday();
  const dues = useDues(400);

  const bills = useMemo(() => allBills.filter((b) => b.billerId === id && b.status !== 'draft').sort((a, b) => b.billDate.localeCompare(a.billDate)), [allBills, id]);
  const views = useMemo(() => bills.map((b) => viewBill(b, txns, today)), [bills, txns, today]);
  const insight = useMemo(() => usageInsight(bills), [bills]);
  const chron = [...bills].reverse().slice(-12);

  if (!biller) {
    return (
      <Screen title="Bill" back>
        <EmptyState icon="alert-circle-outline" title="Not found" />
      </Screen>
    );
  }
  const meta = billerMeta(biller.type);
  const due = dues.find((d) => (d.link?.type === 'bill' && bills.some((b) => b.id === d.link!.id)) || (d.link?.type === 'biller' && d.link.id === biller.id));
  const current = views.find((v) => v.state !== 'paid') ?? views[0];
  const prepaid = biller.amountMode === 'prepaid' ? prepaidStatus(bills, biller.id, today) : null;
  const lpg = biller.amountMode === 'on_demand' ? predictNextLpg(bills.map((b) => b.billDate)) : null;

  const onDelete = async () => {
    await remove('billers', biller.id);
    toast(`${biller.name} deleted`, { actionLabel: 'Undo', onAction: () => restore('billers', biller.id) });
    router.back();
  };

  const primary =
    biller.amountMode === 'prepaid' ? (
      <Button title="Record recharge" icon="flash" size="lg" onPress={() => router.push({ pathname: '/pay', params: { due: `biller:${biller.id}` } })} />
    ) : biller.amountMode === 'on_demand' ? (
      <Button title="Log a booking" icon="add" size="lg" onPress={() => router.push({ pathname: '/pay', params: { due: `biller:${biller.id}` } })} />
    ) : due && due.kind !== 'enter_bill' ? (
      <Button title={`Pay ${formatINR(due.amount ?? 0)}`} icon="checkmark" size="lg" onPress={() => openPay(due)} />
    ) : biller.amountMode === 'variable' ? (
      <Button title="Enter this cycle's bill" icon="create" size="lg" onPress={() => router.push({ pathname: '/bill/new', params: { billerId: biller.id } })} />
    ) : undefined;

  return (
    <Screen
      title={biller.name}
      subtitle={`${meta.label}${biller.provider ? ` · ${biller.provider}` : ''}`}
      back
      right={
        <>
          <IconButton name="create-outline" label="Edit" onPress={() => router.push({ pathname: '/biller/new', params: { id: biller.id } })} />
          <IconButton name="trash-outline" label="Delete" onPress={onDelete} />
        </>
      }
      footer={primary}
    >
      <Card style={{ gap: space(1.5) }}>
        <Row gap={1.5}>
          <IconCircle name={meta.icon as IconName} color={colors.primary} size={48} />
          <View style={{ flex: 1, gap: 4 }}>
            <Row gap={1} wrap>
              {biller.autopay ? <Pill label="Autopay" tone="info" /> : null}
              <Pill label={biller.amountMode === 'prepaid' ? 'Prepaid' : biller.amountMode === 'on_demand' ? 'On demand' : FREQUENCY_LABEL[biller.frequency]} />
              {!biller.active ? <Pill label="Paused" tone="warn" /> : null}
            </Row>
            {biller.consumerNo ? (
              <Pressable
                onPress={async () => {
                  await Clipboard.setStringAsync(biller.consumerNo!);
                  toast('Consumer number copied');
                }}
                accessibilityRole="button"
                accessibilityHint="Copies the consumer number"
              >
                <Txt variant="small" tone="primary">
                  {biller.consumerNo} · tap to copy
                </Txt>
              </Pressable>
            ) : null}
          </View>
        </Row>
        {prepaid ? (
          <View>
            <Txt variant="caption" tone="muted">
              PLAN VALID TILL
            </Txt>
            <Txt variant="h2" tone={prepaid.state === 'expired' ? 'expense' : prepaid.state === 'expiring' ? 'warn' : 'default'}>
              {prepaid.validUntil ? `${formatDay(prepaid.validUntil, { year: true })} · ${relativeDay(prepaid.validUntil, today)}` : 'No recharge yet'}
            </Txt>
          </View>
        ) : lpg ? (
          <View>
            <Txt variant="caption" tone="muted">
              BOOK NEXT AROUND
            </Txt>
            <Txt variant="h2">{formatDay(lpg.nextDate)}</Txt>
            <Txt variant="small" tone="muted">
              A cylinder lasts about {lpg.averageDays} days
            </Txt>
          </View>
        ) : current ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Txt variant="caption" tone="muted">
                {current.state === 'paid' ? 'LAST BILL' : 'CURRENT BILL'}
              </Txt>
              <Money value={current.state === 'paid' ? current.totalDue : current.remaining} variant="h1" />
              <Txt variant="small" tone={current.state === 'overdue' ? 'expense' : 'muted'}>
                {current.state === 'paid' ? 'Paid' : `Due ${formatDay(current.bill.dueDate)} · ${relativeDay(current.bill.dueDate, today)}`}
              </Txt>
            </View>
            <Pill label={STATE_LABEL[current.state]} tone={current.state === 'overdue' ? 'expense' : current.state === 'paid' ? 'income' : 'warn'} />
          </Row>
        ) : (
          <Txt tone="muted">No bills recorded yet.</Txt>
        )}
        {insight.changeVsAverage !== null && Math.abs(insight.changeVsAverage) >= 0.15 ? (
          <Card tone="alt">
            <Txt variant="small" tone={insight.changeVsAverage > 0 ? 'warn' : 'income'}>
              Latest bill is {Math.round(Math.abs(insight.changeVsAverage) * 100)}% {insight.changeVsAverage > 0 ? 'higher' : 'lower'} than your recent average ({formatINR(insight.averageAmount)}).
            </Txt>
          </Card>
        ) : null}
      </Card>

      {chron.length > 1 ? (
        <Section title="Amount trend">
          <Card>
            <Bars data={chron.map((b) => ({ key: b.id, label: shortMonth(monthKey(b.billDate)), values: [b.amount] }))} colors={[colors.primary]} height={130} highlightLast />
          </Card>
        </Section>
      ) : null}

      {biller.usageUnit && chron.filter((b) => b.usage).length > 1 ? (
        <Section title={`Usage (${biller.usageUnit})`}>
          <Card style={{ gap: space(1) }}>
            <LineChart
              points={chron.filter((b) => b.usage).map((b) => b.usage!)}
              labels={chron.filter((b) => b.usage).map((b) => shortMonth(monthKey(b.billDate)))}
              color={colors.warn}
              format={(v) => `${v} ${biller.usageUnit}`}
            />
            {insight.costPerUnit ? (
              <Txt variant="small" tone="muted">
                Latest cost ≈ ₹{insight.costPerUnit.toFixed(2)} per {biller.usageUnit}
              </Txt>
            ) : null}
          </Card>
        </Section>
      ) : null}

      <Section title="History">
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {views.length ? (
            views.map((v) => (
              <ListRow
                key={v.bill.id}
                title={v.bill.validUntil ? `Recharge ${formatDay(v.bill.billDate, { year: true })}` : `${formatDay(v.bill.billDate, { year: true })} bill`}
                subtitle={v.bill.validUntil ? `Valid till ${formatDay(v.bill.validUntil)}` : `${STATE_LABEL[v.state]}${v.state !== 'paid' ? ` · due ${formatDay(v.bill.dueDate)}` : ''}${v.bill.usage ? ` · ${v.bill.usage} ${biller.usageUnit ?? ''}` : ''}`}
                right={<Money value={v.totalDue} tone={v.state === 'overdue' ? 'expense' : 'default'} />}
                onPress={() => router.push({ pathname: '/bill/new', params: { id: v.bill.id } })}
              />
            ))
          ) : (
            <EmptyState icon="receipt-outline" title="No history yet" />
          )}
        </Card>
      </Section>

      <Button title={biller.active ? 'Pause reminders' : 'Resume reminders'} variant="ghost" onPress={() => update('billers', biller.id, { active: biller.active ? 0 : 1 })} />
    </Screen>
  );
}
