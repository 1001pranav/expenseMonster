import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { formatDay, toYMD } from '@/domain/dates';
import { saveSettings } from '@/db/repo';
import { useStore } from '@/db/store';
import { useTable } from '@/data/hooks';
import { importBankSms, requestSmsPermission, smsCaptureAvailable } from '@/services/smsInbox';
import { GradientTile } from '@/ui/components/Aurora';
import { Button, Card, Chip, IconCircle, ListRow, Row, Section, Txt, type IconName } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { SwitchRow } from '@/ui/components/forms';
import { Screen, goBack } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

const PERIODS = [
  { months: 1, label: '1 month' },
  { months: 3, label: '3 months' },
  { months: 6, label: '6 months' },
];

const PROMISES: { icon: IconName; state?: 'good'; title: string; body: string }[] = [
  { icon: 'checkmark', state: 'good', title: 'Read', body: 'Bank, card and bill messages only' },
  { icon: 'close', title: 'Skipped', body: 'Personal chats, OTPs, offers, failed payments' },
  { icon: 'lock-closed-outline', title: 'Stays on this phone', body: 'The message text is never kept or uploaded' },
];

/**
 * Bank messages reach the app when the user pastes one or, in builds made with SMS capture, after
 * they tap "Allow and import" here: only then does Android ask for SMS access. After that, new bank
 * SMS are read each time the app opens (never in the background) unless the user turns it off.
 * Taught formats help the parser recognise either.
 */
export default function SmsSettings() {
  const { colors } = useTheme();
  const formats = useTable('sms_formats');
  const senders = useTable('sms_senders');
  const accounts = useTable('accounts');
  const cards = useTable('cards');
  const importedTo = useStore((s) => s.settings.smsImportedTo);
  const checkOnOpen = useStore((s) => s.settings.smsCheckOnOpen);
  const [importing, setImporting] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [pickPeriod, setPickPeriod] = useState(false);
  const [months, setMonths] = useState(3);
  const firstTime = smsCaptureAvailable && !importedTo;

  const run = async (since: number) => {
    const perm = await requestSmsPermission();
    setBlocked(perm === 'blocked');
    if (perm !== 'granted') return toast('Android did not allow reading SMS. Pasting still works.', { tone: 'error' });
    setImporting(true);
    try {
      const { read, added, saved, startedAt } = await importBankSms(since);
      await saveSettings({ smsImportedTo: startedAt });
      setPickPeriod(false);
      const waiting = added - saved;
      toast(
        !added ? (read ? 'Those bank SMS are already in' : 'No new bank SMS found') : waiting ? `${added} added, ${waiting} to check in Check captures` : `${added} bank SMS saved`,
        { tone: 'success' },
      );
      if (waiting) router.push('/review');
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const fromMonths = (m: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    return run(d.getTime());
  };

  const checkSwitch = (
    <SwitchRow icon="chatbubble-ellipses-outline" label="Check for new ones when I open the app" description="Never in the background" value={checkOnOpen} onChange={(v) => saveSettings({ smsCheckOnOpen: v })} />
  );
  const blockedNote = blocked ? (
    <Card tone="alt" style={{ gap: space(1) }}>
      <Txt variant="small" tone="muted">
        Android isn't asking any more. Open App info and allow SMS. If the app was installed outside Play, first tap ⋮ → Allow restricted settings there.
      </Txt>
      <Button title="Open App info" icon="settings-outline" variant="secondary" size="sm" onPress={() => Linking.openSettings()} />
    </Card>
  ) : null;

  return (
    <Screen
      title="Bank SMS"
      back
      footer={
        firstTime ? (
          <Row gap={1}>
            <Button
              title="Not now"
              variant="secondary"
              size="lg"
              style={{ flex: 1 }}
              onPress={() => {
                saveSettings({ smsOfferDismissed: true });
                goBack();
              }}
            />
            <Button title="Allow and import" icon="download-outline" size="lg" loading={importing} style={{ flex: 1.5 }} onPress={() => fromMonths(months)} />
          </Row>
        ) : undefined
      }
    >
      {firstTime ? (
        <>
          <View style={{ alignItems: 'center', gap: space(1.25), paddingHorizontal: space(2) }}>
            <GradientTile icon="chatbubble-ellipses-outline" size={64} radius={20} iconSize={30} />
            <Txt variant="h3" style={{ textAlign: 'center' }}>
              Record bank payments from SMS
            </Txt>
            <Txt tone="muted" style={{ textAlign: 'center' }}>
              They wait in Check captures for you to approve. Nothing is saved on its own.
            </Txt>
          </View>
          <Card style={{ gap: space(1.75) }}>
            {PROMISES.map((p) => (
              <Row key={p.title} gap={1.5}>
                <IconCircle name={p.icon} state={p.state} />
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong">{p.title}</Txt>
                  <Txt variant="small" tone="muted">
                    {p.body}
                  </Txt>
                </View>
              </Row>
            ))}
          </Card>
          <View style={{ gap: 6 }}>
            <Txt variant="small" tone="muted" style={{ paddingHorizontal: 2 }}>
              Bring in bank SMS from the last
            </Txt>
            <Row gap={1} wrap>
              {PERIODS.map((p) => (
                <Chip key={p.months} label={p.label} selected={months === p.months} onPress={() => setMonths(p.months)} />
              ))}
            </Row>
          </View>
          {checkSwitch}
          {blockedNote}
          <Txt variant="small" tone="muted" style={{ textAlign: 'center' }}>
            {importing ? 'Reading your bank SMS…' : 'Android asks for permission after you tap Allow.'}
          </Txt>
        </>
      ) : smsCaptureAvailable ? (
        <Card style={{ gap: space(1.5) }}>
          <Txt tone="muted">
            ExpenseMonster reads only bank and payment messages that look like a payment, never OTPs or personal messages, and doesn't keep their text.
          </Txt>
          {importedTo && !pickPeriod ? (
            <>
              <Button title="Import new bank SMS" icon="download-outline" loading={importing} onPress={() => run(importedTo)} />
              <Txt variant="small" tone="muted">
                Reads messages since your last import on {formatDay(toYMD(new Date(importedTo)))}.
              </Txt>
              <Button title="Import a longer period" variant="ghost" size="sm" disabled={importing} onPress={() => setPickPeriod(true)} />
            </>
          ) : (
            <>
              <Txt variant="bodyStrong">Import bank SMS from the last</Txt>
              <Row gap={1} wrap>
                {PERIODS.map((p) => (
                  <Chip key={p.months} label={p.label} onPress={() => !importing && fromMonths(p.months)} />
                ))}
              </Row>
              {importing ? <Txt variant="small" tone="muted">Reading your bank SMS…</Txt> : null}
            </>
          )}
          {checkSwitch}
          {blockedNote}
        </Card>
      ) : (
        <Card>
          <Txt tone="muted">ExpenseMonster doesn't read your messages. To record a bank SMS, copy it in your Messages app and paste it here.</Txt>
        </Card>
      )}

      {/* The first-time screen is only the opt-in (design 0a); pasting and formats come after. */}
      {firstTime ? null : (
        <>
        <Section title="Paste a message" style={{ marginTop: space(1) }}>
          <Card padded={false} style={{ overflow: 'hidden' }}>
            <ListRow icon="clipboard-outline" iconColor={colors.info} title="Paste a bank SMS" subtitle="Works without any permission" chevron onPress={() => router.push('/paste-sms')} />
          </Card>
        </Section>

        <Section title="Bank numbers & senders" action="Add" onAction={() => router.push('/settings/sms-sender')}>
          <Txt variant="small" tone="muted" style={{ paddingHorizontal: 4 }}>
            Mark which senders are your bank (a phone number too) and which account or card they're about, or block one.
          </Txt>
          {senders.length ? (
            <Card padded={false} style={{ overflow: 'hidden' }}>
              {senders.map((s) => {
                const linked = s.cardId ? cards.find((c) => c.id === s.cardId)?.name : s.accountId ? accounts.find((a) => a.id === s.accountId)?.name : null;
                return (
                  <ListRow
                    key={s.id}
                    icon={s.kind === 'bank' ? 'business-outline' : 'ban-outline'}
                    iconColor={s.kind === 'bank' ? colors.primary : colors.expense}
                    title={s.name ? `${s.name} · ${s.sender}` : s.sender}
                    subtitle={s.kind === 'blocked' ? 'Blocked' : linked ? `Bank · ${linked}` : 'Bank'}
                    chevron
                    onPress={() => router.push({ pathname: '/settings/sms-sender', params: { id: s.id } })}
                  />
                );
              })}
            </Card>
          ) : (
            <Button title="Mark a bank number" icon="business-outline" variant="secondary" onPress={() => router.push('/settings/sms-sender')} />
          )}
        </Section>

        <Section title="Your bank's formats" action="Teach new" onAction={() => router.push('/settings/sms-format')}>
          <Txt variant="small" tone="muted" style={{ paddingHorizontal: 4 }}>
            If your bank's messages aren't recognised, teach the format once from a sample. Formats are shared with family phones when you sync.
          </Txt>
          {formats.length ? (
            <Card padded={false} style={{ overflow: 'hidden' }}>
              {formats.map((f) => (
                <ListRow
                  key={f.id}
                  icon={f.direction === 'debit' ? 'arrow-up' : 'arrow-down'}
                  iconColor={f.direction === 'debit' ? colors.expense : colors.income}
                  title={f.name}
                  subtitle={`${f.sender ? `From ${f.sender}` : 'Any sender'}${f.isCard ? ' · credit card' : ''}${f.active ? '' : ' · off'}`}
                  chevron
                  onPress={() => router.push({ pathname: '/settings/sms-format', params: { id: f.id } })}
                />
              ))}
            </Card>
          ) : (
            <Button title="Teach a format" icon="school-outline" variant="secondary" onPress={() => router.push('/settings/sms-format')} />
          )}
        </Section>
        </>
      )}
    </Screen>
  );
}
