import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { formatDay, formatMonth, monthKey } from '@/domain/dates';
import { loanEmisPaid } from '@/domain/dues';
import { loanProgress, scheduleFor, simulatePrepayment } from '@/domain/emi';
import { formatINR, type Paise } from '@/domain/money';
import { remove, restore, update } from '@/db/repo';
import { useDues, useTable, useToday } from '@/data/hooks';
import { Bars, ProgressRing } from '@/ui/components/charts';
import { Button, Card, Divider, EmptyState, IconButton, Money, Pill, Row, Section, Stat, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { AmountField, Segmented } from '@/ui/components/forms';
import { TxnRow, openPay } from '@/ui/components/rows';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

export default function LoanDetail() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const loan = useTable('loans').find((l) => l.id === id);
  const txns = useTable('transactions');
  const today = useToday();
  const dues = useDues(400);
  const [showAll, setShowAll] = useState(false);
  const [prepay, setPrepay] = useState<Paise | null>(null);
  const [mode, setMode] = useState<'reduce_tenure' | 'reduce_emi'>('reduce_tenure');

  const schedule = useMemo(() => (loan ? scheduleFor(loan) : []), [loan]);
  const p = useMemo(() => (loan ? loanProgress(schedule, loanEmisPaid(loan, txns), today) : null), [loan, schedule, txns, today]);
  const payments = useMemo(() => txns.filter((t) => t.linkType === 'loan' && t.linkId === id && t.status === 'confirmed'), [txns, id]);
  const yearly = useMemo(() => {
    const map = new Map<string, { principal: number; interest: number }>();
    for (const r of schedule) {
      const y = r.date.slice(0, 4);
      const v = map.get(y) ?? { principal: 0, interest: 0 };
      v.principal += r.principal;
      v.interest += r.interest;
      map.set(y, v);
    }
    return [...map.entries()].map(([y, v]) => ({ key: y, label: `'${y.slice(2)}`, values: [v.principal, v.interest] }));
  }, [schedule]);
  const sim = useMemo(() => (loan && p && prepay ? simulatePrepayment(loan.principal, loan.ratePa, loan.tenureMonths, loan.emi, p.emisPaid, prepay, mode) : null), [loan, p, prepay, mode]);

  if (!loan || !p) {
    return (
      <Screen title="Loan" back>
        <EmptyState icon="alert-circle-outline" title="Loan not found" />
      </Screen>
    );
  }
  const due = dues.find((d) => d.link?.type === 'loan' && d.link.id === loan.id);
  const total = schedule.length;
  const rows = showAll ? schedule : schedule.slice(Math.max(p.emisPaid - 1, 0), p.emisPaid + 11);

  const onDelete = async () => {
    await remove('loans', loan.id);
    toast('Loan deleted', { actionLabel: 'Undo', onAction: () => restore('loans', loan.id) });
    router.back();
  };

  return (
    <Screen
      title={loan.name}
      subtitle={`${loan.lender ?? (loan.direction === 'lent' ? 'Lent' : 'Loan')} · ${loan.ratePa}% ${loan.interestType === 'flat' ? 'flat' : ''}`}
      back
      right={
        <>
          <IconButton name="create-outline" label="Edit loan" onPress={() => router.push({ pathname: '/loan/new', params: { id: loan.id } })} />
          <IconButton name="trash-outline" label="Delete loan" onPress={onDelete} />
        </>
      }
      footer={due ? <Button title={loan.direction === 'lent' ? 'Record repayment' : `Pay EMI ${formatINR(due.amount ?? loan.emi)}`} icon="checkmark" size="lg" onPress={() => openPay(due)} /> : undefined}
    >
      <Card style={{ gap: space(2) }}>
        <Row gap={2}>
          <ProgressRing value={total ? p.emisPaid / total : 0} size={110} color={loan.direction === 'lent' ? colors.income : colors.primary}>
            <Txt variant="h3">
              {p.emisPaid}/{total}
            </Txt>
            <Txt variant="caption" tone="muted">
              EMIs
            </Txt>
          </ProgressRing>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="caption" tone="muted">
              OUTSTANDING
            </Txt>
            <Money value={p.outstanding} variant="h1" />
            {p.overdueCount ? <Pill label={`${p.overdueCount} EMI overdue`} tone="expense" /> : p.payoffDate ? <Txt variant="small" tone="muted">Free by {formatMonth(monthKey(p.payoffDate))}</Txt> : null}
          </View>
        </Row>
        <Row gap={2}>
          <Stat label="EMI" value={loan.emi} />
          <Stat label="Interest paid" value={p.interestPaid} />
          <Stat label="Interest left" value={p.interestLeft} tone="expense" />
        </Row>
      </Card>

      {yearly.length > 1 ? (
        <Section title="Principal vs interest by year">
          <Card>
            <Bars data={yearly} colors={[colors.primary, colors.expense]} legend={['Principal', 'Interest']} height={150} />
          </Card>
        </Section>
      ) : null}

      {loan.direction === 'borrowed' && loan.interestType === 'reducing' && p.emisLeft > 1 ? (
        <Section title="Prepayment simulator">
          <Card style={{ gap: space(1.5) }}>
            <AmountField label="Prepay a lump sum" value={prepay} onChange={setPrepay} placeholder="e.g. 200000" />
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'reduce_tenure', label: 'Reduce tenure' },
                { value: 'reduce_emi', label: 'Reduce EMI' },
              ]}
            />
            {sim ? (
              <View style={{ gap: 6 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt tone="muted">Interest saved</Txt>
                  <Money value={sim.interestSaved} tone="income" variant="h3" />
                </Row>
                {mode === 'reduce_tenure' ? (
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Txt tone="muted">Finishes earlier by</Txt>
                    <Txt variant="bodyStrong">
                      {Math.floor(sim.monthsSaved / 12)}y {sim.monthsSaved % 12}m
                    </Txt>
                  </Row>
                ) : (
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Txt tone="muted">New EMI</Txt>
                    <Txt variant="bodyStrong">{formatINR(sim.newEmi)}</Txt>
                  </Row>
                )}
                <Txt variant="small" tone="faint">
                  Reducing tenure usually saves more interest. Check your lender's prepayment charges.
                </Txt>
              </View>
            ) : null}
          </Card>
        </Section>
      ) : null}

      <Section title="Schedule" action={showAll ? 'Show less' : 'Show all'} onAction={() => setShowAll((v) => !v)}>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <Row style={{ paddingHorizontal: space(2), paddingVertical: 10 }}>
            {['#', 'Date', 'Principal', 'Interest', 'Balance'].map((h, i) => (
              <Txt key={h} variant="caption" tone="muted" style={{ flex: i === 0 ? 0.5 : 1, textAlign: i > 1 ? 'right' : 'left' }}>
                {h}
              </Txt>
            ))}
          </Row>
          <Divider />
          {rows.map((r) => (
            <Row key={r.n} style={{ paddingHorizontal: space(2), paddingVertical: 9, backgroundColor: r.n === p.emisPaid + 1 ? colors.primarySoft : undefined, opacity: r.n <= p.emisPaid ? 0.55 : 1 }}>
              <Txt variant="small" style={{ flex: 0.5 }}>
                {r.n}
              </Txt>
              <Txt variant="small" style={{ flex: 1 }}>
                {formatDay(r.date)} {r.date.slice(2, 4)}
              </Txt>
              <Txt variant="small" style={{ flex: 1, textAlign: 'right' }}>
                {formatINR(r.principal, { decimals: 'never' })}
              </Txt>
              <Txt variant="small" style={{ flex: 1, textAlign: 'right' }}>
                {formatINR(r.interest, { decimals: 'never' })}
              </Txt>
              <Txt variant="small" style={{ flex: 1, textAlign: 'right' }}>
                {formatINR(r.balance, { compact: true })}
              </Txt>
            </Row>
          ))}
        </Card>
      </Section>

      {payments.length ? (
        <Section title="Payments recorded">
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {payments.map((t) => (
              <TxnRow key={t.id} t={t} />
            ))}
          </Card>
        </Section>
      ) : null}

      <Button title={loan.closed ? 'Reopen loan' : 'Mark loan closed'} variant="ghost" onPress={() => update('loans', loan.id, { closed: loan.closed ? 0 : 1 })} />
    </Screen>
  );
}
