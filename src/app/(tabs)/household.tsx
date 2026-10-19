import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { memberBalances, simplifyDebts } from '@/domain/settle';
import { asideRecords } from '@/db/repo';
import { useStore } from '@/db/store';
import { HOUSEHOLD_ID, ownHeld } from '@/services/holds';
import { keyStatus } from '@/services/rotation';
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
  const version = useStore((s) => s.version);
  const devices = useTable('devices');
  const headId = useTable('household').find((h) => h.id === HOUSEHOLD_ID)?.headDeviceId ?? null;
  const headName = headId === identity.deviceId ? 'This phone' : (devices.find((d) => d.id === headId)?.name ?? 'Another phone');
  // Family edits waiting for the head, and this phone's own entries the head is holding.
  const [review, setReview] = useState({ aside: 0, own: 0, discarded: 0, removed: false });
  useEffect(() => {
    Promise.all([asideRecords(), ownHeld(), keyStatus()])
      .then(([aside, own, key]) => setReview({ aside: aside.length, own: own.length, discarded: own.filter((o) => o.decision === 'discard').length, removed: key === 'removed' }))
      .catch(() => {});
  }, [version]);
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
          {members.length === 1 ? (
            <>
              <Divider inset={space(9)} />
              <ListRow icon="person-add" iconColor={colors.primary} title="Add family members" subtitle="Split expenses and see who owes whom" chevron onPress={() => router.push('/member/new')} />
            </>
          ) : null}
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

      {review.removed ? (
        <Card onPress={() => router.push('/sync/review')} style={{ borderWidth: 1.5, borderColor: colors.expense, gap: 4 }}>
          <Txt variant="bodyStrong">The household head removed this phone</Txt>
          <Txt variant="small" tone="muted">
            Your data stays here; new family entries no longer arrive. Tap to separate this phone.
          </Txt>
        </Card>
      ) : review.aside || review.own ? (
        <Card onPress={() => router.push('/sync/review')} style={{ borderWidth: 1.5, borderColor: review.discarded ? colors.expense : colors.warn, gap: 4 }}>
          <Txt variant="bodyStrong">
            {review.discarded ? `The head didn't accept ${review.discarded} of your entries` : review.own ? `${review.own} of your entries are on hold` : `${review.aside} family ${review.aside === 1 ? 'edit is' : 'edits are'} waiting for review`}
          </Txt>
          <Txt variant="small" tone="muted">
            {review.discarded ? 'Choose to delete them or separate this phone.' : headId === identity.deviceId ? 'You are the household head: merge or discard them.' : `${headName} (household head) is reviewing them.`}
          </Txt>
        </Card>
      ) : null}

      <Section title="Share between phones">
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <ListRow icon="sync" iconColor={colors.primary} title="Sync with family" subtitle="Pair by QR · send & receive encrypted updates" chevron onPress={() => router.push('/sync')} />
          <Divider inset={space(9)} />
          <ListRow icon="shield-checkmark" iconColor={colors.info} title="Household head & review" subtitle={headId ? `Head: ${headName}` : 'No head yet'} chevron onPress={() => router.push('/sync/review')} />
        </Card>
      </Section>

      <Section title="Manage">
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <ListRow icon="business" iconColor={colors.info} title="Bank accounts & wallets" chevron onPress={() => router.push('/accounts')} />
          <Divider inset={space(9)} />
          <ListRow icon="trending-up" iconColor={colors.income} title="Investments" subtitle="Gold, shares, funds… by person and joint" chevron onPress={() => router.push('/investments')} />
          <Divider inset={space(9)} />
          <ListRow icon="pie-chart" iconColor={colors.warn} title="Budgets" chevron onPress={() => router.push('/budgets')} />
          <Divider inset={space(9)} />
          <ListRow icon="pricetags" iconColor="#DB2777" title="Categories & auto-rules" chevron onPress={() => router.push('/categories')} />
          <Divider inset={space(9)} />
          <ListRow icon="wallet" iconColor={colors.income} title="Recurring income" chevron onPress={() => router.push('/income')} />
          <Divider inset={space(9)} />
          <ListRow icon="bar-chart" iconColor={colors.primary} title="Insights" chevron onPress={() => router.push('/insights')} />
          <Divider inset={space(9)} />
          <ListRow icon="receipt" iconColor={colors.income} title="Tax saver" subtitle="80C, 80D, home-loan deductions" chevron onPress={() => router.push('/tax')} />
          <Divider inset={space(9)} />
          <ListRow icon="cloud-download" iconColor={colors.textMuted} title="Backup & export" chevron onPress={() => router.push('/backup')} />
        </Card>
      </Section>
    </Screen>
  );
}
