import { router } from 'expo-router';
import { useState } from 'react';
import { Linking } from 'react-native';
import { formatDay, toYMD } from '@/domain/dates';
import { saveSettings } from '@/db/repo';
import { useStore } from '@/db/store';
import { useTable } from '@/data/hooks';
import { importBankSms, requestSmsPermission, smsCaptureAvailable } from '@/services/smsInbox';
import { Button, Card, Chip, ListRow, Row, Section, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

const PERIODS = [
  { months: 1, label: '1 month' },
  { months: 3, label: '3 months' },
  { months: 6, label: '6 months' },
];

/**
 * Bank messages reach the app when the user pastes one or, in builds made with SMS capture, when they
 * tap Import here: only then is the inbox read (bank senders only, never OTPs; services/smsInbox.ts).
 * Taught formats help the parser recognise either.
 */
export default function SmsSettings() {
  const { colors } = useTheme();
  const formats = useTable('sms_formats');
  const importedTo = useStore((s) => s.settings.smsImportedTo);
  const [importing, setImporting] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [pickPeriod, setPickPeriod] = useState(false);

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
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const fromMonths = (months: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return run(d.getTime());
  };

  return (
    <Screen title="Bank SMS" back>
      {smsCaptureAvailable ? (
        <Card style={{ gap: space(1.5) }}>
          <Txt tone="muted">
            ExpenseMonster reads your SMS only when you tap Import, never in the background. It keeps just bank and payment messages that look like a payment, never OTPs or personal messages, and doesn't keep their text.
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
          {blocked ? (
            <>
              <Txt variant="small" tone="muted">
                Android isn't asking any more. Open App info and allow SMS. If the app was installed outside Play, first tap ⋮ → Allow restricted settings there.
              </Txt>
              <Button title="Open App info" icon="settings-outline" variant="secondary" size="sm" onPress={() => Linking.openSettings()} />
            </>
          ) : null}
        </Card>
      ) : (
        <Card>
          <Txt tone="muted">ExpenseMonster doesn't read your messages. To record a bank SMS, copy it in your Messages app and paste it here.</Txt>
        </Card>
      )}

      <Section title="Paste a message" style={{ marginTop: space(1) }}>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <ListRow icon="clipboard-outline" iconColor={colors.info} title="Paste a bank SMS" subtitle="Works without any permission" chevron onPress={() => router.push('/paste-sms')} />
        </Card>
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
                subtitle={`${f.sender ? `From ${f.sender}` : 'Any sender'}${f.isCard ? ' · credit card' : ''}`}
                chevron
                onPress={() => router.push({ pathname: '/settings/sms-format', params: { id: f.id } })}
              />
            ))}
          </Card>
        ) : (
          <Button title="Teach a format" icon="school-outline" variant="secondary" onPress={() => router.push('/settings/sms-format')} />
        )}
      </Section>
    </Screen>
  );
}
