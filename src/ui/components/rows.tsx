import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { formatDay, isoToYMD, relativeDay, type YMD } from '@/domain/dates';
import type { DueItem } from '@/domain/dues';
import { flagsOf } from '@/domain/transactions';
import type { Category, CreditCard, Transaction } from '@/domain/types';
import { radius, space, useTheme } from '../theme';
import { Card, IconCircle, ListRow, Money, Pill, Row, Txt, type IconName } from './core';

const METHOD_LABEL: Record<Transaction['method'], string> = { upi: 'UPI', bank: 'Bank', cash: 'Cash', card: 'Card', wallet: 'Wallet' };

export function txnTitle(t: Transaction, cat?: Category) {
  if (t.type === 'transfer' && t.linkType === 'card') return 'Card bill payment';
  if (t.type === 'settlement') return 'Settlement';
  return t.payee || cat?.name || (t.type === 'income' ? 'Income' : 'Expense');
}

export function TxnRow({ t, cat, card, onPress }: { t: Transaction; cat?: Category; card?: CreditCard; onPress?: () => void }) {
  const { colors } = useTheme();
  const sign = t.type === 'expense' ? -1 : t.type === 'income' ? 1 : 0;
  const icon: IconName = t.type === 'transfer' ? 'swap-horizontal' : t.type === 'settlement' ? 'people' : ((cat?.icon as IconName) ?? (t.type === 'income' ? 'arrow-down' : 'arrow-up'));
  const color = t.type === 'transfer' || t.type === 'settlement' ? colors.info : (cat?.color ?? colors.textMuted);
  const meta = [cat && t.payee ? cat.name : null, t.method === 'card' && card ? card.name : METHOD_LABEL[t.method]].filter(Boolean).join(' · ');
  const flags = flagsOf(t);
  return (
    <ListRow
      onPress={onPress ?? (() => router.push(`/txn/${t.id}`))}
      icon={icon}
      iconColor={color}
      title={txnTitle(t, cat)}
      subtitle={
        <Row gap={0.75}>
          <Txt variant="small" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {meta}
          </Txt>
          {t.status === 'pending' ? <Pill label="Review" tone="warn" /> : null}
          {flags.includes('refund') ? <Pill label="Refund" tone="info" /> : null}
          {t.scope === 'personal' ? <Ionicons name="lock-closed" size={11} color={colors.textFaint} /> : null}
        </Row>
      }
      right={<Money value={sign === 0 ? t.amount : sign * t.amount} tone={sign > 0 ? 'income' : sign === 0 ? 'muted' : 'default'} signed={sign > 0} />}
    />
  );
}

export const stateTone = (d: DueItem) => (d.state === 'overdue' ? 'expense' : d.state === 'due' ? 'warn' : 'muted');

export function DueCard({ d, today, onPay }: { d: DueItem; today: YMD; onPay: () => void }) {
  const { colors } = useTheme();
  const accent = d.state === 'overdue' ? colors.expense : d.state === 'due' ? colors.warn : colors.primary;
  return (
    <Card style={{ width: 200, gap: space(1) }} onPress={() => router.push(d.href as never)}>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconCircle name={d.icon as IconName} color={accent} size={36} />
        <Pill label={d.state === 'overdue' ? 'Overdue' : relativeDay(d.date, today)} tone={stateTone(d)} />
      </Row>
      <Txt variant="bodyStrong" numberOfLines={1}>
        {d.title}
      </Txt>
      {d.amount ? <Money value={d.amount} variant="h3" /> : <Txt tone="muted">Enter amount</Txt>}
      <Pressable
        onPress={onPay}
        accessibilityRole="button"
        accessibilityLabel={d.incoming ? `Mark ${d.title} received` : `Pay ${d.title}`}
        style={({ pressed }) => ({ height: 36, borderRadius: radius.pill, backgroundColor: pressed ? colors.primary : colors.primarySoft, alignItems: 'center', justifyContent: 'center' })}
      >
        <Txt variant="small" tone="primary">
          {d.kind === 'enter_bill' ? 'Enter bill' : d.incoming ? 'Mark received' : 'Pay'}
        </Txt>
      </Pressable>
    </Card>
  );
}

export function DueRow({ d, today, onPay }: { d: DueItem; today: YMD; onPay: () => void }) {
  const { colors } = useTheme();
  const accent = d.state === 'overdue' ? colors.expense : d.state === 'due' ? colors.warn : colors.primary;
  return (
    <ListRow
      onPress={() => router.push(d.href as never)}
      icon={d.icon as IconName}
      iconColor={accent}
      title={d.title}
      subtitle={`${d.state === 'overdue' ? `Overdue · ${formatDay(d.date)}` : `${relativeDay(d.date, today)} · ${formatDay(d.date)}`} · ${d.subtitle}`}
      right={
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {d.amount ? <Money value={d.amount} tone={d.incoming ? 'income' : 'default'} /> : null}
          <Pressable onPress={onPay} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Pay ${d.title}`}>
            <Txt variant="small" tone="primary">
              {d.kind === 'enter_bill' ? 'Enter' : d.incoming ? 'Received' : 'Pay'}
            </Txt>
          </Pressable>
        </View>
      }
    />
  );
}

/** Group transactions by local day for the Activity list. */
export function groupByDay(txns: Transaction[]) {
  const groups: { date: YMD; items: Transaction[]; out: number; in: number }[] = [];
  for (const t of txns) {
    const d = isoToYMD(t.occurredAt);
    let g = groups[groups.length - 1];
    if (!g || g.date !== d) {
      g = { date: d, items: [], out: 0, in: 0 };
      groups.push(g);
    }
    g.items.push(t);
    if (t.status === 'confirmed' && t.type === 'expense') g.out += t.amount;
    if (t.status === 'confirmed' && t.type === 'income') g.in += t.amount;
  }
  return groups;
}

/** Open the right "pay" flow for a due item. */
export function openPay(d: DueItem) {
  if (d.kind === 'enter_bill') router.push(d.href as never);
  else router.push({ pathname: '/pay', params: { due: d.key } });
}
