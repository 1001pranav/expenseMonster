import { router } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { formatDay, isoToYMD, relativeDay } from '@/domain/dates';
import { flagsOf } from '@/domain/transactions';
import type { Transaction } from '@/domain/types';
import { remove, update } from '@/db/repo';
import { approveCapture, rejectCapture } from '@/data/actions';
import { useCategoryMap, usePending, useTable, useToday } from '@/data/hooks';
import { Button, Card, Chip, EmptyState, IconButton, IconCircle, Money, Pill, Row, Section, Txt, type IconName } from '@/ui/components/core';
import { Sheet, toast } from '@/ui/components/feedback';
import { Screen } from '@/ui/components/Screen';
import { SwipeRow } from '@/ui/components/SwipeRow';
import { space, useTheme } from '@/ui/theme';

export default function Review() {
  const { colors } = useTheme();
  const { transactions, bills } = usePending();
  const cats = useCategoryMap();
  const cards = useTable('cards');
  const billers = useTable('billers');
  const today = useToday();
  const [cardFor, setCardFor] = useState<Transaction | null>(null);
  const narrow = useWindowDimensions().width < 360;

  const approve = async (t: Transaction) => {
    await approveCapture(t.id);
    toast('Approved', { tone: 'success', actionLabel: 'Undo', onAction: () => update('transactions', t.id, { status: 'pending' }) });
  };
  const reject = async (t: Transaction) => {
    await rejectCapture(t.id);
    toast('Rejected', { actionLabel: 'Undo', onAction: () => update('transactions', t.id, { status: 'pending' }) });
  };
  const confident = transactions.filter((t) => (t.confidence ?? 0) >= 0.8 && t.categoryId && !flagsOf(t).some((f) => f.startsWith('duplicate')));

  const approveConfident = async () => {
    for (const t of confident) await approveCapture(t.id);
    toast(`Approved ${confident.length}`, { tone: 'success' });
  };

  return (
    <Screen
      title="Review"
      subtitle="Nothing is recorded until you approve it"
      back
    >
      {transactions.length + bills.length === 0 ? (
        <EmptyState icon="checkmark-done-circle-outline" title="All caught up" body="Share a payment screenshot from GPay / PhonePe to ExpenseMonster, or paste a bank SMS." action="Scan a screenshot" onAction={() => router.replace('/scan')} />
      ) : null}

      {confident.length > 1 ? <Button title={`Approve ${confident.length} high-confidence`} icon="checkmark-done" variant="secondary" onPress={approveConfident} /> : null}

      {transactions.length ? (
        <Section title={`Transactions · ${transactions.length}`}>
          <Txt variant="small" tone="muted" style={{ paddingHorizontal: 4 }}>
            Swipe right to approve, left to reject. Tap to edit.
          </Txt>
          <View style={{ gap: space(1.25) }}>
            {transactions.map((t) => {
              const flags = flagsOf(t);
              const cat = cats.get(t.categoryId ?? '');
              const card = cards.find((c) => c.id === t.cardId);
              const dup = flags.some((f) => f.startsWith('duplicate'));
              return (
                <Card key={t.id} padded={false} style={{ overflow: 'hidden' }}>
                  <SwipeRow left={[{ label: 'Approve', icon: 'checkmark', color: colors.income, onPress: () => approve(t) }]} right={[{ label: 'Reject', icon: 'close', color: colors.expense, onPress: () => reject(t) }]}>
                    <View style={{ padding: space(2), gap: space(1.25) }}>
                      <Row gap={1.5}>
                        <IconCircle name={t.type === 'income' ? 'arrow-down' : t.type === 'transfer' ? 'swap-horizontal' : ((cat?.icon as IconName) ?? 'arrow-up')} color={t.type === 'income' ? colors.income : (cat?.color ?? colors.expense)} />
                        <View style={{ flex: 1 }}>
                          <Txt variant="bodyStrong" numberOfLines={1}>
                            {t.payee ?? (t.type === 'income' ? 'Money received' : 'Payment')}
                          </Txt>
                          <Txt variant="small" tone="muted" numberOfLines={1}>
                            {relativeDay(isoToYMD(t.occurredAt), today)} · {t.source === 'sms' ? 'SMS' : 'Screenshot'}
                            {t.method === 'card' ? ` · ${card?.name ?? 'Credit card'}` : ` · ${t.method.toUpperCase()}`}
                          </Txt>
                        </View>
                        <Money value={t.type === 'expense' ? -t.amount : t.amount} variant="h3" tone={t.type === 'income' ? 'income' : 'default'} />
                      </Row>
                      <Row gap={1} wrap>
                        {cat ? <Pill label={cat.name} tone="primary" /> : <Pill label="No category" tone="warn" />}
                        {dup ? <Pill label="Possible duplicate" tone="expense" /> : null}
                        {t.linkType === 'bill' ? <Pill label="Pays a bill" tone="info" /> : null}
                        {t.linkType === 'card' ? <Pill label="Card bill payment" tone="info" /> : null}
                        {flags.includes('refund') ? <Pill label="Refund" tone="income" /> : null}
                        {(t.confidence ?? 1) < 0.7 ? <Pill label="Check amount" tone="warn" /> : null}
                      </Row>
                      <Row gap={1}>
                        <Button title={narrow ? '' : 'Approve'} label="Approve" size="sm" variant="success" icon="checkmark" onPress={() => approve(t)} style={{ flex: 1 }} />
                        <IconButton name="create-outline" label="Edit" filled onPress={() => router.push(`/txn/${t.id}`)} />
                        {t.type === 'expense' ? <IconButton name={t.method === 'card' ? 'card' : 'card-outline'} label="Paid with credit card?" filled color={t.method === 'card' ? colors.primary : undefined} onPress={() => setCardFor(t)} /> : null}
                        <IconButton name="close" label="Reject" filled onPress={() => reject(t)} />
                      </Row>
                    </View>
                  </SwipeRow>
                </Card>
              );
            })}
          </View>
        </Section>
      ) : null}

      {bills.length ? (
        <Section title={`Bills detected · ${bills.length}`}>
          {bills.map((b) => {
            const biller = billers.find((x) => x.id === b.billerId);
            return (
              <Card key={b.id} style={{ gap: space(1.25) }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong">{biller?.name ?? 'Bill'}</Txt>
                    <Txt variant="small" tone="muted">
                      Due {formatDay(b.dueDate)} · {relativeDay(b.dueDate, today)}
                      {b.usage ? ` · ${b.usage} ${biller?.usageUnit ?? 'units'}` : ''}
                    </Txt>
                  </View>
                  <Money value={b.amount} variant="h3" />
                </Row>
                <Row gap={1}>
                  <Button title="Add bill" size="sm" variant="success" icon="checkmark" style={{ flex: 1 }} onPress={() => update('bills', b.id, { status: 'open' }).then(() => toast('Bill added — reminder set', { tone: 'success' }))} />
                  <Button title="Edit" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/bill/new', params: { id: b.id } })} />
                  <Button title="Ignore" size="sm" variant="ghost" onPress={() => remove('bills', b.id)} />
                </Row>
              </Card>
            );
          })}
        </Section>
      ) : null}

      <Sheet visible={Boolean(cardFor)} onClose={() => setCardFor(null)} title="Paid with which credit card?">
        <Txt tone="muted">The purchase moves to that card's current billing cycle, and its bill will include it.</Txt>
        {cards.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {cards.map((c) => (
              <Chip
                key={c.id}
                icon="card"
                label={`${c.name}${c.last4 ? ` ••${c.last4}` : ''}`}
                selected={cardFor?.cardId === c.id && cardFor?.method === 'card'}
                onPress={async () => {
                  if (!cardFor) return;
                  await update('transactions', cardFor.id, { method: 'card', cardId: c.id, accountId: null });
                  setCardFor(null);
                  toast(`Moved to ${c.name}`, { tone: 'success' });
                }}
              />
            ))}
            {cardFor?.method === 'card' ? (
              <Chip
                label="Not a card payment"
                onPress={async () => {
                  if (!cardFor) return;
                  await update('transactions', cardFor.id, { method: cardFor.vpa || cardFor.sourceRef ? 'upi' : 'bank', cardId: null });
                  setCardFor(null);
                }}
              />
            ) : null}
          </View>
        ) : (
          <Button
            title="Add a credit card"
            icon="add"
            onPress={() => {
              setCardFor(null);
              router.push('/card/new');
            }}
          />
        )}
      </Sheet>
    </Screen>
  );
}
