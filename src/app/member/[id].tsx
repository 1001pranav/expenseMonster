import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { memberBalances, parseIds } from '@/domain/settle';
import { remove } from '@/db/repo';
import { useMembers, useSelfId, useTable } from '@/data/hooks';
import { Avatar } from '@/ui/components/Avatar';
import { Button, Card, EmptyState, IconButton, Money, Row, Section, Txt } from '@/ui/components/core';
import { TxnRow } from '@/ui/components/rows';
import { Screen } from '@/ui/components/Screen';
import { space } from '@/ui/theme';

export default function MemberDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const members = useMembers();
  const selfId = useSelfId();
  const txns = useTable('transactions');
  const m = members.find((x) => x.id === id);
  const balance = useMemo(() => memberBalances(txns)[id] ?? 0, [txns, id]);
  const shared = useMemo(() => txns.filter((t) => t.status === 'confirmed' && (t.memberId === id || t.toMemberId === id || parseIds(t.splitWith).includes(id))).slice(0, 30), [txns, id]);
  if (!m) {
    return (
      <Screen title="Member" back>
        <EmptyState icon="person-outline" title="Not found" />
      </Screen>
    );
  }
  const isSelf = m.id === selfId;
  return (
    <Screen
      title={isSelf ? `${m.name} (you)` : m.name}
      back
      right={
        <>
          <IconButton name="create-outline" label="Edit" onPress={() => router.push({ pathname: '/member/new', params: { id: m.id } })} />
          {!isSelf ? <IconButton name="trash-outline" label="Remove" onPress={() => remove('members', m.id).then(() => router.back())} /> : null}
        </>
      }
      footer={
        !isSelf && balance !== 0 ? (
          <Button
            title={balance > 0 ? `${m.name} paid you back` : `Pay ${m.name}`}
            icon="swap-horizontal"
            size="lg"
            onPress={() => router.push({ pathname: '/settle', params: balance > 0 ? { from: m.id, to: selfId, amount: String(balance) } : { from: selfId, to: m.id, amount: String(-balance) } })}
          />
        ) : undefined
      }
    >
      <Card style={{ alignItems: 'center', gap: space(1) }}>
        <Avatar name={m.name} color={m.color} size={64} />
        {balance === 0 ? (
          <Txt tone="muted">All settled up</Txt>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <Txt tone="muted">{balance > 0 ? (isSelf ? 'You are owed' : `${m.name} is owed`) : isSelf ? 'You owe' : `${m.name} owes`}</Txt>
            <Money value={Math.abs(balance)} variant="h1" tone={balance > 0 ? 'income' : 'expense'} />
          </View>
        )}
        {m.upiId ? (
          <Row gap={0.5}>
            <Txt variant="small" tone="muted">
              UPI
            </Txt>
            <Txt variant="small">{m.upiId}</Txt>
          </Row>
        ) : null}
      </Card>
      <Section title="Shared activity">
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {shared.length ? shared.map((t) => <TxnRow key={t.id} t={t} />) : <EmptyState icon="people-outline" title="Nothing shared yet" body="Split an expense with this member from the transaction screen." />}
        </Card>
      </Section>
    </Screen>
  );
}
