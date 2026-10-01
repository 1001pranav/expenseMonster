import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { memberBalances, simplifyDebts } from '@/domain/settle';
import { useStore } from '@/db/store';
import { useMembers, useSelfId, useTable } from '@/data/hooks';
import { Avatar } from '@/ui/components/Avatar';
import { Button, Card, Divider, ListRow, Money, Row, Section, Txt } from '@/ui/components/core';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

export default function Household() {
  const { colors } = useTheme();
  const members = useMembers();
  const selfId = useSelfId();
  const txns = useTable('transactions');
  const identity = useStore((s) => s.identity);
  const balances = useMemo(() => memberBalances(txns), [txns]);
  const transfers = useMemo(() => simplifyDebts(balances), [balances]);
  const nameOf = (id: string) => (id === selfId ? 'You' : (members.find((m) => m.id === id)?.name ?? 'Someone'));

  return (
    <Screen title={identity.householdName} subtitle={`This phone: ${identity.deviceName}`} large tabBar right={<Button title="Settings" icon="settings-outline" size="sm" variant="ghost" onPress={() => router.push('/settings')} />}>
      <Section title="Members" action="Add" onAction={() => router.push('/member/new')}>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {members.map((m, i) => {
            const bal = balances[m.id] ?? 0;
            return (
              <View key={m.id}>
                {i ? <Divider inset={space(9)} /> : null}
                <ListRow
                  leading={<Avatar name={m.name} color={m.color} />}
                  title={m.id === selfId ? `${m.name} (you)` : m.name}
                  subtitle={bal === 0 ? 'Settled up' : bal > 0 ? 'Is owed' : 'Owes'}
                  right={bal ? <Money value={Math.abs(bal)} tone={bal > 0 ? 'income' : 'expense'} /> : null}
                  chevron
                  onPress={() => router.push(`/member/${m.id}`)}
                />
              </View>
            );
          })}
        </Card>
      </Section>

      {transfers.length ? (
        <Section title="Settle up">
          <Card style={{ gap: space(1.5) }}>
            {transfers.map((t) => (
              <Row key={`${t.from}-${t.to}`} style={{ justifyContent: 'space-between' }}>
                <Txt style={{ flex: 1 }}>
                  <Txt variant="bodyStrong">{nameOf(t.from)}</Txt> pays <Txt variant="bodyStrong">{nameOf(t.to)}</Txt>
                </Txt>
                <Money value={t.amount} />
                <Button title="Settle" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/settle', params: { from: t.from, to: t.to, amount: String(t.amount) } })} />
              </Row>
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title="Share between phones">
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <ListRow icon="sync" iconColor={colors.primary} title="Sync with family" subtitle="Pair by QR · send & receive encrypted updates" chevron onPress={() => router.push('/sync')} />
        </Card>
      </Section>

      <Section title="Manage">
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <ListRow icon="business" iconColor={colors.info} title="Bank accounts & wallets" chevron onPress={() => router.push('/accounts')} />
          <Divider inset={space(9)} />
          <ListRow icon="pie-chart" iconColor={colors.warn} title="Budgets" chevron onPress={() => router.push('/budgets')} />
          <Divider inset={space(9)} />
          <ListRow icon="pricetags" iconColor="#DB2777" title="Categories & auto-rules" chevron onPress={() => router.push('/categories')} />
          <Divider inset={space(9)} />
          <ListRow icon="wallet" iconColor={colors.income} title="Recurring income" chevron onPress={() => router.push('/income')} />
          <Divider inset={space(9)} />
          <ListRow icon="bar-chart" iconColor={colors.primary} title="Insights" chevron onPress={() => router.push('/insights')} />
          <Divider inset={space(9)} />
          <ListRow icon="cloud-download" iconColor={colors.textMuted} title="Backup & export" chevron onPress={() => router.push('/backup')} />
        </Card>
      </Section>
    </Screen>
  );
}
