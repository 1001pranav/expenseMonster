import { router } from 'expo-router';
import { useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { saveSettings } from '@/db/repo';
import { useStore } from '@/db/store';
import { isSmsAvailable } from '../../../modules/sms-reader';
import { scanSms } from '@/services/capture';
import { Button, Card, Chip, Row, Txt } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { Screen } from '@/ui/components/Screen';
import { space } from '@/ui/theme';

/** Explains exactly what SMS access is used for before asking for the permission. */
export default function SmsSettings() {
  const enabled = useStore((s) => s.settings.smsEnabled);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);

  if (Platform.OS !== 'android' || !isSmsAvailable()) {
    return (
      <Screen title="Bank SMS capture" back>
        <Card>
          <Txt>{Platform.OS !== 'android' ? "iOS doesn't let apps read SMS. Share payment screenshots instead." : 'This build was made without SMS access (Play Store version). Share payment screenshots instead.'}</Txt>
        </Card>
      </Screen>
    );
  }

  const enable = async () => {
    setBusy(true);
    try {
      const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
        title: 'Read bank SMS',
        message: 'ExpenseMonster reads bank and card SMS on this phone to suggest transactions. Nothing is uploaded.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      });
      if (res !== PermissionsAndroid.RESULTS.GRANTED) return toast('Permission not given — you can still share screenshots', { tone: 'error' });
      await saveSettings({ smsEnabled: true });
      const s = await scanSms({ initialDays: days });
      toast(`Found ${s.added} transactions, ${s.bills} bills — review them now`, { tone: 'success' });
      router.replace('/review');
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Bank SMS capture" back>
      <Card style={{ gap: space(1) }}>
        <Txt variant="h3">What happens</Txt>
        <Txt tone="muted">
          • Only messages from bank, card and biller senders (like VM-HDFCBK) are read.{'\n'}• OTPs, promotions and failed payments are ignored.{'\n'}• Each payment is suggested in Review; nothing is recorded until you approve it.{'\n'}• The SMS text itself is never stored, only the amount, date, payee and reference.{'\n'}• Reading happens when you open the app. There is no background service.
        </Txt>
      </Card>
      {enabled ? (
        <>
          <Button title="Check now" icon="refresh" onPress={() => router.replace('/review?scan=1')} />
          <Button title="Turn off" variant="secondary" onPress={() => saveSettings({ smsEnabled: false })} />
          <Txt variant="small" tone="muted">
            To fully revoke access, also remove the SMS permission in Android Settings → Apps → ExpenseMonster.
          </Txt>
        </>
      ) : (
        <>
          <Txt variant="small" tone="muted">
            Import past messages from the last
          </Txt>
          <Row gap={1}>
            {[7, 30, 90].map((d) => (
              <Chip key={d} label={`${d} days`} selected={days === d} onPress={() => setDays(d)} />
            ))}
          </Row>
          <Button title="Allow SMS access" icon="chatbubble-ellipses" size="lg" onPress={enable} loading={busy} />
        </>
      )}
    </Screen>
  );
}
