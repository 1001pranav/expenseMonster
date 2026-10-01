import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { STATUS_LABEL, type CycleSummary } from '@/domain/creditCard';
import { formatDay, relativeDay, shortMonth, monthKey } from '@/domain/dates';
import { formatINR, type Paise } from '@/domain/money';
import { insert, remove, restore, update } from '@/db/repo';
import { useCardLedger, useCategoryMap, useTable, useToday } from '@/data/hooks';
import { Bars } from '@/ui/components/charts';
import { Button, Card, EmptyState, IconButton, ListRow, Money, Pill, ProgressBar, Row, Section, Txt } from '@/ui/components/core';
import { CardFace } from '@/ui/components/CardFace';
import { Sheet, toast } from '@/ui/components/feedback';
import { AmountField } from '@/ui/components/forms';
import { TxnRow } from '@/ui/components/rows';
import { Screen } from '@/ui/components/Screen';
import { useTheme } from '@/ui/theme';

const statusTone = (s: CycleSummary['status']) => (s === 'overdue' ? 'expense' : s === 'due' || s === 'partly_paid' ? 'warn' : s === 'paid' || s === 'nil' ? 'income' : 'muted');

export default function CardDetail() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useCardLedger(id);
  const txns = useTable('transactions');
  const overrides = useTable('card_overrides');
  const cats = useCategoryMap();
  const today = useToday();
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<CycleSummary | null>(null);
  const [actual, setActual] = useState<Paise | null>(null);

  const cycles = useMemo(() => (data ? [...data.ledger.cycles].reverse() : []), [data]);
  if (!data) {
    return (
      <Screen title="Card" back>
        <EmptyState icon="alert-circle-outline" title="Card not found" />
      </Screen>
    );
  }
  const { card, ledger } = data;
  const view = cycles.find((c) => c.statementDate === selected) ?? ledger.current;
  const viewTxns = txns.filter((t) => view.transactionIds.includes(t.id)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const payments = txns.filter((t) => t.cardId === card.id && t.type === 'transfer' && t.linkType === 'card' && t.status === 'confirmed');
  const unpaidCycles = ledger.cycles.filter((c) => c.status !== 'unbilled' && c.remaining > 0);
  const unpaid = unpaidCycles[0] ? { ...unpaidCycles[0], remaining: unpaidCycles.reduce((a, c) => a + c.remaining, 0) } : undefined;
  const history = ledger.cycles.slice(-6).map((c) => ({ key: c.statementDate, label: shortMonth(monthKey(c.statementDate)), values: [Math.max(c.total, 0)] }));

  const saveActual = async () => {
    if (!editing || actual === null) return;
    const existing = overrides.find((o) => o.cardId === card.id && o.statementDate === editing.statementDate);
    if (existing) await update('card_overrides', existing.id, { total: actual });
    else await insert('card_overrides', { cardId: card.id, statementDate: editing.statementDate, total: actual, minDue: null, scope: card.scope });
    setEditing(null);
    toast('Statement amount updated', { tone: 'success' });
  };

  const onDelete = async () => {
    await remove('cards', card.id);
    toast('Card deleted', { actionLabel: 'Undo', onAction: () => restore('cards', card.id) });
    router.back();
  };

  return (
    <Screen
      title={card.name}
      back
      right={
        <>
          <IconButton name="create-outline" label="Edit card" onPress={() => router.push({ pathname: '/card/new', params: { id: card.id } })} />
          <IconButton name="trash-outline" label="Delete card" onPress={onDelete} />
        </>
      }
      footer={unpaid ? <Button title={`Pay bill · ${formatINR(unpaid.remaining)} by ${formatDay(unpaid.dueDate)}`} icon="checkmark" size="lg" variant={unpaid.status === 'overdue' ? 'danger' : 'primary'} onPress={() => router.push({ pathname: '/pay', params: { due: `card:${card.id}:${unpaid.statementDate}` } })} /> : undefined}
    >
      <CardFace name={card.name} last4={card.last4} color={card.color}>
        <Row gap={2}>
          <View style={{ flex: 1 }}>
            <Txt variant="caption" style={{ color: 'rgba(255,255,255,0.7)' }}>
              OUTSTANDING
            </Txt>
            <Money value={ledger.outstanding} variant="h2" style={{ color: '#fff' }} fit="tight" />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="caption" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {ledger.daysToDue !== null ? (ledger.daysToDue < 0 ? 'OVERDUE' : `DUE IN ${ledger.daysToDue} DAYS`) : 'NO BILL DUE'}
            </Txt>
            <Money value={unpaid?.remaining ?? 0} variant="h2" style={{ color: '#fff' }} />
          </View>
        </Row>
        {ledger.utilisation !== null ? <ProgressBar value={ledger.utilisation} color={ledger.utilisation > 0.3 ? '#FBBF24' : '#A5F3C4'} height={6} /> : null}
        <Txt variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>
          Statement on the {card.statementDay} · due on the {card.dueDay}
          {ledger.utilisation !== null ? ` · ${Math.round(ledger.utilisation * 100)}% used` : ''}
        </Txt>
      </CardFace>

      {history.length > 1 ? (
        <Section title="Bill history">
          <Card>
            <Bars data={history} colors={[colors.primary]} height={120} highlightLast />
          </Card>
        </Section>
      ) : null}

      <Section title="Statements">
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {cycles.slice(0, 8).map((c) => (
            <ListRow
              key={c.statementDate}
              icon={c.status === 'unbilled' ? 'time-outline' : 'document-text-outline'}
              iconColor={c.status === 'overdue' ? colors.expense : colors.primary}
              title={c.status === 'unbilled' ? `Current cycle · ends ${formatDay(c.statementDate)}` : `Statement ${formatDay(c.statementDate, { year: true })}`}
              subtitle={
                <Row gap={0.75}>
                  <Pill label={STATUS_LABEL[c.status]} tone={statusTone(c.status)} />
                  <Txt variant="small" tone="muted" numberOfLines={1}>
                    {c.status === 'unbilled' ? `${formatDay(c.start)} – ${formatDay(c.statementDate)}` : c.status === 'paid' || c.status === 'nil' ? `was due ${formatDay(c.dueDate)}` : `due ${relativeDay(c.dueDate, today)}`}
                    {c.overridden ? ' · bank figure' : ''}
                  </Txt>
                </Row>
              }
              right={<Money value={c.status === 'unbilled' ? c.total : c.remaining || c.total} />}
              onPress={() => setSelected(c.statementDate)}
              onLongPress={() => {
                if (c.status === 'unbilled') return;
                setActual(c.total);
                setEditing(c);
              }}
            />
          ))}
        </Card>
        <Txt variant="small" tone="faint" style={{ paddingHorizontal: 4 }}>
          Long-press a statement to enter the exact amount from your bank (fees, interest, GST).
        </Txt>
      </Section>

      <Section title={view.status === 'unbilled' ? 'In this cycle' : `Statement ${formatDay(view.statementDate)}`}>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {viewTxns.length ? viewTxns.map((t) => <TxnRow key={t.id} t={t} cat={cats.get(t.categoryId ?? '')} card={card} />) : <EmptyState icon="card-outline" title="No purchases" body="Mark UPI/SMS payments as credit-card to bring them here." />}
        </Card>
      </Section>

      {payments.length ? (
        <Section title="Bill payments">
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {payments.slice(0, 6).map((t) => (
              <TxnRow key={t.id} t={t} />
            ))}
          </Card>
        </Section>
      ) : null}

      <Sheet visible={Boolean(editing)} onClose={() => setEditing(null)} title="Amount on bank statement">
        <Txt tone="muted">We calculated {editing ? formatINR(editing.computedTotal) : ''} from your purchases. Enter the bank's total if it differs.</Txt>
        <AmountField key={editing?.statementDate} value={actual} onChange={setActual} autoFocus />
        <Button title="Save" onPress={saveActual} />
      </Sheet>
    </Screen>
  );
}
