import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { billerMeta, prepaidStatus, viewBill } from '@/domain/bills';
import { buildCardLedger } from '@/domain/creditCard';
import { formatDay, relativeDay } from '@/domain/dates';
import { loanEmisPaid } from '@/domain/dues';
import { loanProgress, scheduleFor } from '@/domain/emi';
import { FREQUENCY_LABEL } from '@/domain/recurrence';
import { useDues, useTable, useToday } from '@/data/hooks';
import { Button, Chip, EmptyState, IconCircle, List, ListRow, Money, Pill, ProgressBar, Row, Section, Stat, Txt, useMoneyText, type IconName } from '@/ui/components/core';
import { CardFace } from '@/ui/components/CardFace';
import { DueRow, openPay } from '@/ui/components/rows';
import { Segmented } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { BudgetsBody } from '../budgets';
import { fonts, space, useTheme } from '@/ui/theme';

type Seg = 'all' | 'loans' | 'cards' | 'bills' | 'insurance';
const SEGS: { key: Seg; label: string; icon: IconName }[] = [
  { key: 'all', label: 'All', icon: 'list' },
  { key: 'loans', label: 'Loans', icon: 'trending-down' },
  { key: 'cards', label: 'Cards', icon: 'card' },
  { key: 'bills', label: 'Bills', icon: 'flash' },
  { key: 'insurance', label: 'Insurance', icon: 'shield-checkmark' },
];

/**
 * The Plan tab: what's coming (dues) and what you've allowed yourself (budgets). Both look forward;
 * Insights looks back. The route stays /dues so reminders and links that open it keep working.
 */
export default function Plan() {
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<'dues' | 'budgets'>(params.view === 'budgets' ? 'budgets' : 'dues');
  // Opening the tab with ?view=budgets (Home's "Set a budget") switches to it even if already
  // mounted: follow the param when it changes, without an effect (React's "adjust state on prop change").
  const [seenParam, setSeenParam] = useState(params.view);
  if (params.view !== seenParam) {
    setSeenParam(params.view);
    if (params.view === 'budgets' || params.view === 'dues') setView(params.view);
  }
  return (
    <Screen title="Plan" large tabBar>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'dues', label: 'Dues' },
          { value: 'budgets', label: 'Budgets' },
        ]}
      />
      {view === 'budgets' ? <BudgetsBody /> : <DuesBody />}
    </Screen>
  );
}

function DuesBody() {
  const [seg, setSeg] = useState<Seg>('all');
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -space(2), paddingLeft: space(2), flexGrow: 0 }}>
        {SEGS.map((s) => (
          <Chip key={s.key} label={s.label} icon={s.icon} selected={seg === s.key} onPress={() => setSeg(s.key)} />
        ))}
        <View style={{ width: space(2) }} />
      </ScrollView>
      {seg === 'all' ? <AllDues /> : seg === 'loans' ? <Loans /> : seg === 'cards' ? <Cards /> : seg === 'bills' ? <Bills /> : <Insurance />}
    </>
  );
}

function AllDues() {
  const dues = useDues(45);
  const today = useToday();
  const overdue = dues.filter((d) => d.state === 'overdue');
  const week = dues.filter((d) => d.state === 'due');
  const later = dues.filter((d) => d.state === 'upcoming');
  const owed = dues.filter((d) => !d.incoming && d.state !== 'upcoming').reduce((a, d) => a + (d.amount ?? 0), 0);
  const lateTotal = overdue.filter((d) => !d.incoming).reduce((a, d) => a + (d.amount ?? 0), 0);
  const money = useMoneyText();

  if (!dues.length) {
    return <EmptyState icon="calendar-outline" title="Nothing due" body="Add your loans, credit cards, bills and insurance to get a reminder before each one is due." action="Set up a reminder" onAction={() => router.push('/add')} />;
  }
  const group = (title: string, items: typeof dues) =>
    items.length ? (
      <Section title={title} key={title}>
        <List>
          {items.map((d) => (
            <DueRow key={d.key} d={d} today={today} onPay={() => openPay(d)} />
          ))}
        </List>
      </Section>
    ) : null;
  return (
    <>
      <View style={{ gap: 4, paddingHorizontal: 4 }}>
        <Txt variant="small" tone="muted">
          Due in the next 7 days
        </Txt>
        <Money value={owed} variant="display" decimals="never" fit="narrow" />
        {lateTotal ? (
          <Txt variant="small" tone="expense" style={{ fontWeight: fonts.bold }}>
            {money(lateTotal, { decimals: 'never' })} of it is already late
          </Txt>
        ) : null}
      </View>
      {group('Late', overdue)}
      {group('This week', week)}
      {group('Later', later)}
    </>
  );
}

function Loans() {
  const loans = useTable('loans');
  const txns = useTable('transactions');
  const today = useToday();
  const { colors } = useTheme();
  const rows = useMemo(
    () =>
      loans.map((l) => {
        const schedule = scheduleFor(l);
        return { loan: l, p: loanProgress(schedule, loanEmisPaid(l, txns, today), today), n: schedule.length };
      }),
    [loans, txns, today],
  );
  const borrowed = rows.filter((r) => r.loan.direction === 'borrowed' && !r.loan.closed);
  const lent = rows.filter((r) => r.loan.direction === 'lent' && !r.loan.closed);
  const totalOutstanding = borrowed.reduce((a, r) => a + r.p.outstanding, 0);
  const totalEmi = borrowed.reduce((a, r) => a + r.loan.emi, 0);

  if (!loans.length) return <EmptyState icon="trending-down-outline" title="No loans" body="Track home, car, personal or informal loans — and money you lent." action="Add loan" onAction={() => router.push('/loan/new')} />;

  const item = ({ loan, p, n }: (typeof rows)[number]) => (
    <Pressable key={loan.id} onPress={() => router.push(`/loan/${loan.id}`)} accessibilityRole="button" style={({ pressed }) => ({ gap: space(1), paddingHorizontal: space(2), paddingVertical: space(1.5), backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">{loan.name}</Txt>
          <Txt variant="small" tone="muted">
            {loan.lender ?? (loan.direction === 'lent' ? 'Lent' : 'Loan')} · {loan.ratePa}% · EMI {p.emisPaid}/{n}
          </Txt>
        </View>
        <Money value={p.outstanding} variant="h3" />
      </Row>
      <ProgressBar value={n ? p.emisPaid / n : 0} color={loan.direction === 'lent' ? colors.income : colors.primary} />
      {p.nextDue ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="small" tone={p.overdueCount ? 'expense' : 'muted'}>
            {p.overdueCount ? `${p.overdueCount} EMI overdue` : `Next ${relativeDay(p.nextDue.date, today)}`}
          </Txt>
          <Money value={p.nextDue.emi} variant="small" />
        </Row>
      ) : (
        <Pill label="Fully repaid" tone="good" />
      )}
    </Pressable>
  );

  return (
    <>
      {borrowed.length ? (
        <Row gap={2} style={{ paddingHorizontal: 4 }}>
          <Stat label="Still to pay" value={totalOutstanding} />
          <Stat label="EMIs a month" value={totalEmi} />
        </Row>
      ) : null}
      {borrowed.length ? (
        <Section title="Borrowed">
          <List inset={space(2)}>{borrowed.map(item)}</List>
        </Section>
      ) : null}
      {lent.length ? (
        <Section title="Lent to others">
          <List inset={space(2)}>{lent.map(item)}</List>
        </Section>
      ) : null}
      <Button title="Add loan" icon="add" variant="secondary" onPress={() => router.push('/loan/new')} />
    </>
  );
}

function Cards() {
  const cards = useTable('cards');
  const txns = useTable('transactions');
  const overrides = useTable('card_overrides');
  const loans = useTable('loans');
  const today = useToday();
  if (!cards.length) return <EmptyState icon="card-outline" title="No credit cards" body="Add a card with its statement day so every purchase lands in the right bill." action="Add card" onAction={() => router.push('/card/new')} />;
  return (
    <>
      {cards.map((c) => {
        const l = buildCardLedger(c, txns, overrides, today, undefined, loans);
        const due = l.cycles.find((x) => x.status !== 'unbilled' && x.remaining > 0);
        return (
          <View key={c.id} style={{ gap: 8 }}>
            <Pressable onPress={() => router.push(`/card/${c.id}`)} accessibilityRole="button" accessibilityLabel={`${c.name} details`}>
              <CardFace name={c.name} last4={c.last4} color={c.color}>
                <Row gap={2}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="caption" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      This cycle so far
                    </Txt>
                    <Money value={l.current.total} variant="h3" style={{ color: '#fff' }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="caption" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      {due ? `Due ${formatDay(due.dueDate)}` : 'No bill due'}
                    </Txt>
                    <Money value={due?.remaining ?? 0} variant="h3" style={{ color: '#fff' }} />
                  </View>
                </Row>
                {l.utilisation !== null ? (
                  <View style={{ gap: 4 }}>
                    <ProgressBar value={l.utilisation} color={l.utilisation > 0.3 ? '#FBBF24' : '#A5F3C4'} height={6} />
                    <Txt variant="caption" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      {Math.round(l.utilisation * 100)}% of limit used{l.utilisation > 0.3 ? ' · above 30% can hurt your credit score' : ''}
                    </Txt>
                  </View>
                ) : null}
              </CardFace>
            </Pressable>
            {due ? (
              <Button
                title={`Pay ${due.status === 'overdue' ? 'overdue ' : ''}bill`}
                size="sm"
                variant={due.status === 'overdue' ? 'danger' : 'secondary'}
                onPress={() => router.push({ pathname: '/pay', params: { due: `card:${c.id}:${due.statementDate}` } })}
              />
            ) : null}
          </View>
        );
      })}
      <Button title="Add card" icon="add" variant="secondary" onPress={() => router.push('/card/new')} />
    </>
  );
}

function Bills() {
  const billers = useTable('billers');
  const bills = useTable('bills');
  const txns = useTable('transactions');
  const today = useToday();
  const { colors } = useTheme();
  if (!billers.length) return <EmptyState icon="flash-outline" title="No bills yet" body="Electricity, internet, rent, school fees, prepaid recharges, LPG — add each once and get reminded every cycle." action="Add bill" onAction={() => router.push('/biller/new')} />;
  return (
    <>
      <List>
        {billers.map((b) => {
          const meta = billerMeta(b.type);
          const mine = bills.filter((x) => x.billerId === b.id && x.status !== 'draft').sort((x, y) => y.billDate.localeCompare(x.billDate));
          let subtitle = meta.label;
          let right: React.ReactNode = null;
          if (b.amountMode === 'prepaid') {
            const st = prepaidStatus(mine, b.id, today);
            subtitle = st.validUntil ? `Valid till ${formatDay(st.validUntil)}` : 'No recharge recorded';
            right = st.state === 'expired' ? <Pill label="Expired" tone="expense" /> : st.state === 'expiring' ? <Pill label={`${st.daysLeft}d left`} tone="warn" /> : null;
          } else if (mine[0]) {
            const v = viewBill(mine[0], txns, today);
            subtitle = `${b.autopay ? 'Autopay · ' : ''}${v.state === 'paid' ? 'Paid' : `Due ${relativeDay(v.bill.dueDate, today)}`}`;
            right = <Money value={v.state === 'paid' ? v.totalDue : v.remaining} tone={v.state === 'overdue' ? 'expense' : v.state === 'paid' ? 'muted' : 'default'} />;
          }
          return <ListRow key={b.id} icon={meta.icon as IconName} iconColor={b.active ? colors.textMuted : colors.textFaint} title={b.name} subtitle={subtitle} right={right} chevron onPress={() => router.push(`/biller/${b.id}`)} />;
        })}
      </List>
      <Button title="Add bill" icon="add" variant="secondary" onPress={() => router.push('/biller/new')} />
    </>
  );
}

function Insurance() {
  const policies = useTable('policies');
  const today = useToday();
  if (!policies.length) return <EmptyState icon="shield-checkmark-outline" title="No policies" body="Add life, health and vehicle policies to get renewal alerts 30, 7 and 1 day before." action="Add policy" onAction={() => router.push('/policy/new')} />;
  const yearly = policies.filter((p) => p.active).reduce((a, p) => a + p.premium * (12 / { monthly: 1, bimonthly: 2, quarterly: 3, half_yearly: 6, yearly: 12 }[p.frequency]), 0);
  return (
    <>
      <Row style={{ paddingHorizontal: 4 }}>
        <Stat label="Premiums per year" value={Math.round(yearly)} />
      </Row>
      <List>
        {policies.map((p) => (
          <ListRow
            key={p.id}
            leading={<IconCircle name="shield-checkmark" state={p.nextDueDate < today ? 'expense' : undefined} />}
            title={p.name}
            subtitle={`${p.insurer} · ${FREQUENCY_LABEL[p.frequency]} · ${p.nextDueDate < today ? 'Overdue' : `due ${relativeDay(p.nextDueDate, today)}`}`}
            right={<Money value={p.premium} />}
            chevron
            onPress={() => router.push(`/policy/${p.id}`)}
          />
        ))}
      </List>
      <Button title="Add policy" icon="add" variant="secondary" onPress={() => router.push('/policy/new')} />
    </>
  );
}
