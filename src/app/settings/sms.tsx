import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { saveSettings } from '@/db/repo';
import { useStore } from '@/db/store';
import { useTable } from '@/data/hooks';
import { isSmsAvailable } from '../../../modules/sms-reader';
import { scanSms } from '@/services/capture';
import { Button, Card, Chip, ListRow, Pill, Row, Section, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

/**
 * SMS reading is optional. Nothing is read until the user taps "Allow" and Android grants the
 * permission; without it everything works manually (add, scan screenshot, paste SMS).
 */
export default function SmsSettings() {
  const { colors } = useTheme();
  const enabled = useStore((s) => s.settings.smsEnabled);
  const formats = useTable('sms_formats');
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const canRead = Platform.OS === 'android' && isSmsAvailable();

  const enable = async () => {
    setBusy(true);
    try {
      const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
        title: 'Read bank SMS?',
        message: 'ExpenseMonster reads bank, card and bill SMS on this phone to suggest transactions for you to approve. Nothing is uploaded.',
        buttonPositive: 'Allow',
        buttonNegative: 'Keep manual',
      });
      if (res === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return setBlocked(true);
      if (res !== PermissionsAndroid.RESULTS.GRANTED) return toast('OK, staying manual. You can paste SMS or scan screenshots anytime.');
      await saveSettings({ smsEnabled: true, smsPromptDismissed: true });
      const s = await scanSms({ initialDays: days });
      toast(`Found ${s.added} transactions and ${s.bills} bills. Review them now.`, { tone: 'success' });
      router.replace('/review');
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Bank SMS" back>
      <Card style={{ gap: space(1) }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="h3">Automatic SMS reading</Txt>
          <Pill label={enabled ? 'On' : 'Off · manual'} tone={enabled ? 'income' : 'muted'} />
        </Row>
        <Txt tone="muted">
          Optional. If you allow it, bank and card messages are read on this phone and suggested in Review. OTPs, offers and failed payments are ignored, and the SMS text is never saved.{'\n\n'}If you don't, nothing is read: add entries yourself, scan payment screenshots, or paste a bank SMS.
        </Txt>
      </Card>

      {!canRead ? (
        <Card>
          <Txt>{Platform.OS !== 'android' ? "iOS doesn't let apps read SMS." : 'This build was made without SMS access (Play Store version).'} You can still paste messages.</Txt>
        </Card>
      ) : enabled ? (
        <Row gap={1}>
          <Button title="Check now" icon="refresh" onPress={() => router.replace('/review?scan=1')} style={{ flex: 1 }} />
          <Button title="Turn off" variant="secondary" onPress={() => saveSettings({ smsEnabled: false })} style={{ flex: 1 }} />
        </Row>
      ) : blocked ? (
        <Card style={{ gap: space(1) }}>
          <Txt>Android is blocking the permission request. Allow SMS in the app's settings, then come back.</Txt>
          <Button title="Open app settings" variant="secondary" onPress={() => Linking.openSettings()} />
        </Card>
      ) : (
        <Card style={{ gap: space(1.25) }}>
          <Txt variant="small" tone="muted">
            On first use, import messages from the last
          </Txt>
          <Row gap={1}>
            {[7, 30, 90].map((d) => (
              <Chip key={d} label={`${d} days`} selected={days === d} onPress={() => setDays(d)} />
            ))}
          </Row>
          <Button title="Allow SMS reading" icon="chatbubble-ellipses" onPress={enable} loading={busy} />
        </Card>
      )}
      {enabled ? (
        <Txt variant="small" tone="faint">
          Turning off stops reading. To fully revoke, also remove the SMS permission in Android Settings → Apps → ExpenseMonster.
        </Txt>
      ) : null}

      <Section title="Paste a message" style={{ marginTop: space(1) }}>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <ListRow icon="clipboard-outline" iconColor={colors.info} title="Paste a bank SMS" subtitle="Works without any permission" chevron onPress={() => router.push('/paste-sms')} />
        </Card>
      </Section>

      <Section title="Your bank's formats" action="Teach new" onAction={() => router.push('/settings/sms-format')}>
        <Txt variant="small" tone="muted" style={{ paddingHorizontal: 4 }}>
          If your bank's messages aren't picked up, teach the format once from a sample. Formats are shared with family phones when you sync.
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
