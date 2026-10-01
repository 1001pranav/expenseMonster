import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { billerMeta, prepaidStatus, viewBill } from '@/domain/bills';
import { buildCardLedger } from '@/domain/creditCard';
import { formatDay, relativeDay } from '@/domain/dates';
import { loanEmisPaid } from '@/domain/dues';
import { loanProgress, scheduleFor } from '@/domain/emi';
import { FREQUENCY_LABEL } from '@/domain/recurrence';
import { useDues, useTable, useToday } from '@/data/hooks';
import { Button, Card, Chip, EmptyState, IconCircle, ListRow, Money, Pill, ProgressBar, Row, Section, Stat, Txt, type IconName } from '@/ui/components/core';
import { CardFace } from '@/ui/components/CardFace';
import { DueRow, openPay } from '@/ui/components/rows';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

type Seg = 'all' | 'loans' | 'cards' | 'bills' | 'insurance';
const SEGS: { key: Seg; label: string; icon: IconName }[] = [
  { key: 'all', label: 'All', icon: 'list' },
  { key: 'loans', label: 'Loans', icon: 'trending-down' },
  { key: 'cards', label: 'Cards', icon: 'card' },
  { key: 'bills', label: 'Bills', icon: 'flash' },
  { key: 'insurance', label: 'Insurance', icon: 'shield-checkmark' },
];

export default function Dues() {
  const [seg, setSeg] = useState<Seg>('all');
  return (
    <Screen title="Dues" large tabBar>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -space(2), paddingLeft: space(2), flexGrow: 0 }}>
        {SEGS.map((s) => (
          <Chip key={s.key} label={s.label} icon={s.icon} selected={seg === s.key} onPress={() => setSeg(s.key)} />
        ))}
        <View style={{ width: space(2) }} />
      </ScrollView>
      {seg === 'all' ? <AllDues /> : seg === 'loans' ? <Loans /> : seg === 'cards' ? <Cards /> : seg === 'bills' ? <Bills /> : <Insurance />}
    </Screen>
  );
}

function AllDues() {
  const dues = useDues(45);
  const today = useToday();
  const overdue = dues.filter((d) => d.state === 'overdue');
  const week = dues.filter((d) => d.state === 'due');
  const later = dues.filter((d) => d.state === 'upcoming');
  const owed = dues.filter((d) => !d.incoming && d.state !== 'upcoming').reduce((a, d) => a + (d.amount ?? 0), 0);
  const month = dues.filter((d) => !d.incoming).reduce((a, d) => a + (d.amount ?? 0), 0);

  if (!dues.length) {
    return <EmptyState icon="calendar-outline" title="No dues" body="Add your loans, credit cards, bills and insurance to get reminders before every due date." action="Add something" onAction={() => router.push('/add')} />;
  }
  const group = (title: string, items: typeof dues) =>
    items.length ? (
      <Section title={title} key={title}>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {items.map((d) => (
            <DueRow key={d.key} d={d} today={today} onPay={() => openPay(d)} />
          ))}
        </Card>
      </Section>
    ) : null;
  return (
    <>
      <Card tone="primary" style={{ gap: space(1.5) }}>
        <View style={{ gap: 2 }}>
          <Txt variant="small" tone="inverse" style={{ opacity: 0.85 }}>
            Due in the next 7 days
          </Txt>
          <Money value={owed} variant="display" tone="inverse" decimals="never" fit="narrow" />
        </View>
        {overdue.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,79,139,0.3)' }}>
            <Txt variant="small" tone="inverse">
              {overdue.length} overdue — pay these first
            </Txt>
          </View>
        ) : null}
        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.16)' }} />
        <Row gap={2}>
          <Stat label="Next 45 days" value={month} tone="inverse" />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="caption" tone="inverse" style={{ opacity: 0.75 }}>
              ITEMS
            </Txt>
            <Txt variant="h3" tone="inverse">
              {dues.length}
            </Txt>
          </View>
        </Row>
      </Card>
      {group('Overdue', overdue)}
      {group('This week', week)}
      {group('Coming up', later)}
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
        return { loan: l, p: loanProgress(schedule, loanEmisPaid(l, txns), today), n: schedule.length };
      }),
    [loans, txns, today],
  );
  const borrowed = rows.filter((r) => r.loan.direction === 'borrowed' && !r.loan.closed);
  const lent = rows.filter((r) => r.loan.direction === 'lent' && !r.loan.closed);
  const totalOutstanding = borrowed.reduce((a, r) => a + r.p.outstanding, 0);
  const totalEmi = borrowed.reduce((a, r) => a + r.loan.emi, 0);

  if (!loans.length) return <EmptyState icon="trending-down-outline" title="No loans" body="Track home, car, personal or informal loans — and money you lent." action="Add loan" onAction={() => router.push('/loan/new')} />;

  const item = ({ loan, p, n }: (typeof rows)[number]) => (
    <Card key={loan.id} onPress={() => router.push(`/loan/${loan.id}`)} style={{ gap: space(1.25) }}>
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
        <Pill label="Fully repaid" tone="income" />
      )}
    </Card>
  );

  return (
    <>
      {borrowed.length ? (
        <Card tone="alt">
          <Row gap={2}>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" tone="muted">
                OUTSTANDING
              </Txt>
              <Money value={totalOutstanding} variant="h2" />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" tone="muted">
                MONTHLY EMIs
              </Txt>
              <Money value={totalEmi} variant="h2" />
            </View>
          </Row>
        </Card>
      ) : null}
      {borrowed.length ? <Section title="Borrowed">{borrowed.map(item)}</Section> : null}
      {lent.length ? <Section title="Lent to others">{lent.map(item)}</Section> : null}
      <Button title="Add loan" icon="add" variant="secondary" onPress={() => router.push('/loan/new')} />
    </>
  );
}

function Cards() {
  const cards = useTable('cards');
  const txns = useTable('transactions');
  const overrides = useTable('card_overrides');
  const today = useToday();
  if (!cards.length) return <EmptyState icon="card-outline" title="No credit cards" body="Add a card with its statement day so every purchase lands in the right bill." action="Add card" onAction={() => router.push('/card/new')} />;
  return (
    <>
      {cards.map((c) => {
        const l = buildCardLedger(c, txns, overrides, today);
        const due = l.cycles.find((x) => x.status !== 'unbilled' && x.remaining > 0);
        return (
          <View key={c.id} style={{ gap: 8 }}>
            <Pressable onPress={() => router.push(`/card/${c.id}`)} accessibilityRole="button" accessibilityLabel={`${c.name} details`}>
              <CardFace name={c.name} last4={c.last4} color={c.color}>
                <Row gap={2}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="caption" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      UNBILLED
                    </Txt>
                    <Money value={l.current.total} variant="h3" style={{ color: '#fff' }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="caption" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      {due ? `DUE ${formatDay(due.dueDate).toUpperCase()}` : 'NO BILL DUE'}
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
      <Card padded={false} style={{ overflow: 'hidden' }}>
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
          return <ListRow key={b.id} icon={meta.icon as IconName} iconColor={b.active ? colors.primary : colors.textFaint} title={b.name} subtitle={subtitle} right={right} chevron onPress={() => router.push(`/biller/${b.id}`)} />;
        })}
      </Card>
      <Button title="Add bill" icon="add" variant="secondary" onPress={() => router.push('/biller/new')} />
    </>
  );
}

function Insurance() {
  const policies = useTable('policies');
  const today = useToday();
  const { colors } = useTheme();
  if (!policies.length) return <EmptyState icon="shield-checkmark-outline" title="No policies" body="Add life, health and vehicle policies to get renewal alerts 30, 7 and 1 day before." action="Add policy" onAction={() => router.push('/policy/new')} />;
  const yearly = policies.filter((p) => p.active).reduce((a, p) => a + p.premium * (12 / { monthly: 1, bimonthly: 2, quarterly: 3, half_yearly: 6, yearly: 12 }[p.frequency]), 0);
  return (
    <>
      <Card tone="alt">
        <Txt variant="caption" tone="muted">
          PREMIUMS PER YEAR
        </Txt>
        <Money value={Math.round(yearly)} variant="h2" />
      </Card>
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {policies.map((p) => (
          <ListRow
            key={p.id}
            leading={<IconCircle name="shield-checkmark" color={p.nextDueDate < today ? colors.expense : colors.info} />}
            title={p.name}
            subtitle={`${p.insurer} · ${FREQUENCY_LABEL[p.frequency]} · ${p.nextDueDate < today ? 'Overdue' : `due ${relativeDay(p.nextDueDate, today)}`}`}
            right={<Money value={p.premium} />}
            chevron
            onPress={() => router.push(`/policy/${p.id}`)}
          />
        ))}
      </Card>
      <Button title="Add policy" icon="add" variant="secondary" onPress={() => router.push('/policy/new')} />
    </>
  );
}
