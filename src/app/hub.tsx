import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { memberBalances, simplifyDebts } from '@/domain/settle';
import { diffDays, isoToYMD } from '@/domain/dates';
import { asideRecords, saveSettings } from '@/db/repo';
import { useStore } from '@/db/store';
import { HOUSEHOLD_ID, ownHeld } from '@/services/holds';
import { keyStatus } from '@/services/rotation';
import { loadVaultStatus, type VaultStatus } from '@/services/vault';
import { useMembers, useSelfId, useTable, useToday } from '@/data/hooks';
import { Avatar } from '@/ui/components/Avatar';
import { Button, Card, IconCircle, List, ListRow, Money, Row, Section, Txt } from '@/ui/components/core';
import { Segmented } from '@/ui/components/forms';
import { PaydaySheet, paydayText } from '@/ui/components/PaydaySheet';
import { Screen } from '@/ui/components/Screen';
import { fonts, space, useTheme } from '@/ui/theme';

/**
 * "You and household": every setting, behind the initial on Home, grouped as the spec has it
 * (§2.8): you and family, money, capture, privacy and data, appearance, about. The first row states
 * the brand promise as a fact: encrypted here, and whether a backup exists.
 */
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
  const [vault, setVault] = useState<VaultStatus | null>(null);
  useEffect(() => {
    loadVaultStatus().then(setVault).catch(() => {});
  }, [version]);
  const [paydaySheet, setPaydaySheet] = useState(false);
  const today = useToday();
  const trust = trustLine(settings, vault, today);
  const lockSummary = [settings.biometric ? 'Fingerprint' : null, settings.autoLockMinutes === 0 ? 'locks at once' : `locks after ${settings.autoLockMinutes} min`, settings.screenSecure ? 'screenshots blocked' : null].filter(Boolean).join(' · ');

  return (
    <Screen back>
      <Row gap={1.75} style={{ paddingHorizontal: 4 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: colors.text, alignItems: 'center', justifyContent: 'center' }}>
          <Txt style={{ fontWeight: fonts.display, fontSize: 22 }}>{(me?.name ?? identity.householdName).charAt(0).toUpperCase()}</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="h2">{me?.name ?? 'You'}</Txt>
          <Txt variant="small" tone="muted" numberOfLines={1}>
            {identity.householdName}, on {identity.deviceName}
          </Txt>
        </View>
        {selfId ? <Button title="Edit" variant="ghost" size="sm" onPress={() => router.push({ pathname: '/member/new', params: { id: selfId } })} /> : null}
      </Row>

      <List>
        <ListRow
          leading={<IconCircle name="lock-closed" state={trust.warn ? 'warn' : 'good'} />}
          title="Encrypted on this phone"
          subtitle={<Txt variant="small" tone={trust.warn ? 'warn' : 'muted'}>{trust.text}</Txt>}
          chevron
          onPress={() => router.push('/backup')}
        />
      </List>

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

      <Section title="You and family">
        <List>
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
        </List>
        {transfers.length ? (
          <View style={{ gap: space(1.5), paddingHorizontal: 4 }}>
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
          </View>
        ) : null}
      </Section>

      <Section title="Money">
        <List>
          <ListRow icon="pie-chart-outline" title="Budgets" chevron onPress={() => router.push({ pathname: '/dues', params: { view: 'budgets' } })} />
          <ListRow icon="calendar-outline" title="Budget period" subtitle={paydayText(settings.budgetPeriod, settings.payday)} chevron onPress={() => setPaydaySheet(true)} />
          <ListRow icon="pricetags-outline" title="Categories and rules" subtitle="Hide, merge, reorder; file payees automatically" chevron onPress={() => router.push('/categories')} />
          <ListRow icon="business-outline" title="Accounts and wallets" subtitle={accounts.length ? `${accounts.length} added` : 'Optional: helps match bank SMS'} chevron onPress={() => router.push('/accounts')} />
          <ListRow icon="wallet-outline" title="Regular income" subtitle={incomes.length ? `${incomes.length} added` : 'Salary, or rent you receive'} chevron onPress={() => router.push('/income')} />
          <ListRow icon="trending-up-outline" title="Investments" subtitle="Gold, shares, funds… by person and joint" chevron onPress={() => router.push('/investments')} />
          <ListRow icon="receipt-outline" title="Tax saver" subtitle="Deductions this year, old regime" chevron onPress={() => router.push('/tax')} />
        </List>
        <PaydaySheet visible={paydaySheet} onClose={() => setPaydaySheet(false)} />
      </Section>

      <Section title="Capture">
        <List>
          <ListRow icon="chatbubble-ellipses-outline" title="Bank SMS" subtitle="Read bank messages, or teach your bank's format" chevron onPress={() => router.push('/settings/sms')} />
          <ListRow icon="images-outline" title="Screenshots and reminders" subtitle="Auto-save clear screenshots, bill reminders" chevron onPress={() => router.push('/settings/capture')} />
          <ListRow icon="sparkles-outline" title="Assistant" subtitle="Optional, runs on this phone" chevron onPress={() => router.push('/settings/assistant')} />
        </List>
      </Section>

      <Section title="Privacy and data">
        <List>
          <ListRow icon="lock-closed-outline" title="App lock and privacy" subtitle={lockSummary} chevron onPress={() => router.push('/settings')} />
          <ListRow icon="cloud-upload-outline" title="Backup and export" subtitle={settings.vaultSync ? 'Cloud backup is on' : 'Keep a copy in case this phone is lost'} chevron onPress={() => router.push('/backup')} />
          <ListRow icon="phone-portrait-outline" title="Family phones" subtitle={settings.cloudSync ? 'Updates through the cloud, encrypted' : 'Pair phones and share updates'} chevron onPress={() => router.push('/sync')} />
          {others.length || headId ? <ListRow icon="shield-checkmark-outline" title="Household head and review" subtitle={headId ? `Head: ${headName}` : 'No head yet'} chevron onPress={() => router.push('/sync/review')} /> : null}
        </List>
      </Section>

      <Section title="Appearance">
        <Segmented
          value={settings.theme}
          onChange={(v) => saveSettings({ theme: v })}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Section>

      <Section title="About">
        <List>
          <ListRow icon="bug-outline" title="Report a problem" subtitle="See the error log and send it, if you choose" chevron onPress={() => router.push('/settings/diagnostics')} />
        </List>
        <Txt variant="small" tone="faint" style={{ textAlign: 'center' }}>
          ExpenseMonster {Constants.expoConfig?.version ?? ''}
        </Txt>
      </Section>
    </Screen>
  );
}

/** "Encrypted on this phone" plus what backup and sync are doing: the brand promise as a fact. */
function trustLine(s: { vaultSync: boolean; cloudSync: boolean }, vault: VaultStatus | null, today: string): { text: string; warn: boolean } {
  const parts: string[] = [];
  let warn = false;
  if (!s.vaultSync) parts.push('No backup yet');
  else if (vault && !vault.ok) {
    parts.push('Backup needs attention');
    warn = true;
  } else if (vault) {
    const days = diffDays(today, isoToYMD(vault.at));
    parts.push(days <= 0 ? 'Backed up today' : days === 1 ? 'Backed up yesterday' : `Backed up ${days} days ago`);
    // A backup that hasn't run for over a week is as good as none if the phone is lost.
    warn = days > 7;
  } else parts.push('Backup on');
  if (s.cloudSync) parts.push('Synced with family');
  return { text: parts.join(' · '), warn };
}

