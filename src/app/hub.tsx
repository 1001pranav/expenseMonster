import { router } from 'expo-router';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { memberBalances, simplifyDebts } from '@/domain/settle';
import { asideRecords } from '@/db/repo';
import { useStore } from '@/db/store';
import { HOUSEHOLD_ID, ownHeld } from '@/services/holds';
import { keyStatus } from '@/services/rotation';
import { useMembers, useSelfId, useTable } from '@/data/hooks';
import { Avatar } from '@/ui/components/Avatar';
import { Button, Card, ListRow, Money, Row, Section, Txt } from '@/ui/components/core';
import { Screen } from '@/ui/components/Screen';
import { fonts, space, useTheme } from '@/ui/theme';

/** "You and household": everything that isn't day-to-day money, behind the initial on Home. */
export default function Hub() {
  const { colors } = useTheme();
  const members = useMembers();
  const selfId = useSelfId();
  const txns = useTable('transactions');
  const accounts = useTable('accounts');
  const incomes = useTable('incomes');
  const identity = useStore((s) => s.identity);
  const settings = useStore((s) => s.settings);
  const balances = useMemo(() => memberBalances(txns), [txns]);
  const transfers = useMemo(() => simplifyDebts(balances), [balances]);
  const me = members.find((m) => m.id === selfId);
  const nameOf = (id: string) => (id === selfId ? 'You' : (members.find((m) => m.id === id)?.name ?? 'Someone'));
  const others = members.filter((m) => m.id !== selfId);
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

  return (
    <Screen back>
      <Row gap={1.75} style={{ paddingHorizontal: 4 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: colors.text, alignItems: 'center', justifyContent: 'center' }}>
          <Txt style={{ fontFamily: fonts.display, fontSize: 22 }}>{(me?.name ?? identity.householdName).charAt(0).toUpperCase()}</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="h2">{me?.name ?? 'You'}</Txt>
          <Txt variant="small" tone="muted" numberOfLines={1}>
            {identity.householdName}, on {identity.deviceName}
          </Txt>
        </View>
        {selfId ? <Button title="Edit" variant="ghost" size="sm" onPress={() => router.push({ pathname: '/member/new', params: { id: selfId } })} /> : null}
      </Row>

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

      <Section title="Household">
        <Group>
          {others.map((m) => {
            const bal = balances[m.id] ?? 0;
            return (
              <ListRow
                key={m.id}
                leading={<Avatar name={m.name} color={m.color} />}
                title={m.name}
                subtitle={bal === 0 ? 'Settled up' : bal > 0 ? `${m.name} is owed` : `${m.name} owes`}
                right={bal ? <Money value={Math.abs(bal)} /> : null}
                chevron
                onPress={() => router.push(`/member/${m.id}`)}
              />
            );
          })}
          <ListRow icon="person-add-outline" title={others.length ? 'Add someone' : 'Add family members'} subtitle={others.length ? undefined : 'Split expenses and see who owes whom'} chevron onPress={() => router.push('/member/new')} />
          <ListRow icon="phone-portrait-outline" title="Family phones" subtitle={settings.cloudSync ? 'Updates through the cloud, encrypted' : 'Pair phones and share updates'} chevron onPress={() => router.push('/sync')} />
          <ListRow icon="shield-checkmark-outline" title="Household head and review" subtitle={headId ? `Head: ${headName}` : 'No head yet'} chevron onPress={() => router.push('/sync/review')} />
          <ListRow icon="cloud-upload-outline" title="Backup" subtitle={settings.vaultSync ? 'Cloud backup is on' : 'Keep a copy in case this phone is lost'} chevron onPress={() => router.push('/backup')} />
        </Group>
        {transfers.length ? (
          <Card style={{ gap: space(1.5) }}>
            <Txt variant="bodyStrong">To settle up</Txt>
            {transfers.map((t) => (
              <Row key={`${t.from}-${t.to}`} gap={1.5}>
                <View style={{ flex: 1 }}>
                  <Txt>
                    {nameOf(t.from)} pays {nameOf(t.to)}
                  </Txt>
                  <Money value={t.amount} variant="small" tone="muted" />
                </View>
                <Button title="Settle" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/settle', params: { from: t.from, to: t.to, amount: String(t.amount) } })} />
              </Row>
            ))}
          </Card>
        ) : null}
      </Section>

      <Section title="Money">
        <Group>
          <ListRow icon="business-outline" title="Accounts and wallets" subtitle={accounts.length ? `${accounts.length} added` : 'Optional: helps match bank SMS'} chevron onPress={() => router.push('/accounts')} />
          <ListRow icon="trending-up-outline" title="Investments" subtitle="Gold, shares, funds… by person and joint" chevron onPress={() => router.push('/investments')} />
          <ListRow icon="pie-chart-outline" title="Budgets" chevron onPress={() => router.push('/budgets')} />
          <ListRow icon="pricetags-outline" title="Categories" chevron onPress={() => router.push('/categories')} />
          <ListRow icon="flash-outline" title="Rules" subtitle="e.g. screenshots with “credit card” go on your HDFC card" chevron onPress={() => router.push('/rules')} />
          <ListRow icon="wallet-outline" title="Regular income" subtitle={incomes.length ? `${incomes.length} added` : 'Salary, or rent you receive'} chevron onPress={() => router.push('/income')} />
          <ListRow icon="receipt-outline" title="Tax saver" subtitle="Deductions this year, old regime" chevron onPress={() => router.push('/tax')} />
        </Group>
      </Section>

      <Section title="App">
        <Group>
          <ListRow icon="lock-closed-outline" title="Lock, privacy and look" subtitle="PIN, fingerprint, screenshots, theme" chevron onPress={() => router.push('/settings')} />
          <ListRow icon="chatbubble-ellipses-outline" title="Bank SMS" subtitle="Paste a message or teach your bank's format" chevron onPress={() => router.push('/settings/sms')} />
          <ListRow icon="sparkles-outline" title="Assistant" subtitle="Optional, runs on this phone" chevron onPress={() => router.push('/settings/assistant')} />
          <ListRow icon="bug-outline" title="Report a problem" chevron onPress={() => router.push('/settings/diagnostics')} />
        </Group>
      </Section>
    </Screen>
  );
}

/** One white card holding rows, with a divider between them. */
function Group({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const rows = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      {rows.map((child, i) => (
        <Fragment key={i}>
          {i ? <View style={{ height: 1, backgroundColor: colors.surfaceAlt, marginLeft: space(8.5) }} /> : null}
          {child}
        </Fragment>
      ))}
    </Card>
  );
}

