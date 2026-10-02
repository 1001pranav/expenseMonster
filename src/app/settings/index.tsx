import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { saveSettings } from '@/db/repo';
import { useStore } from '@/db/store';
import { isSmsAvailable } from '../../../modules/sms-reader';
import { ensurePermission, rescheduleAll } from '@/services/notifications';
import { clearPin, hasPin, setPin } from '@/services/secure';
import { eraseEverything } from '@/services/wipe';
import { Button, Card, Chip, Divider, ListRow, Row, Section, Txt } from '@/ui/components/core';
import { Sheet, toast } from '@/ui/components/feedback';
import { Segmented, SwitchRow, TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { space, useTheme } from '@/ui/theme';

export default function Settings() {
  const { colors } = useTheme();
  const settings = useStore((s) => s.settings);
  const [pinSet, setPinSet] = useState(false);
  const [pinSheet, setPinSheet] = useState(false);
  const [pin, setPinValue] = useState('');
  const [pin2, setPin2] = useState('');
  const [bioAvailable, setBioAvailable] = useState(false);
  const [eraseSheet, setEraseSheet] = useState(false);
  const [eraseText, setEraseText] = useState('');

  useEffect(() => {
    hasPin().then(setPinSet);
    Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]).then(([h, e]) => setBioAvailable(h && e));
  }, []);

  const savePin = async () => {
    if (!/^\d{6}$/.test(pin)) return toast('PIN must be 6 digits', { tone: 'error' });
    if (pin !== pin2) return toast("PINs don't match", { tone: 'error' });
    await setPin(pin);
    setPinSet(true);
    setPinSheet(false);
    setPinValue('');
    setPin2('');
    toast('PIN set', { tone: 'success' });
  };

  return (
    <Screen title="Settings" back>
      <Section title="Security">
        <Card style={{ gap: 0 }}>
          <ListRow icon="keypad" iconColor={colors.primary} title={pinSet ? 'Change PIN' : 'Set a 6-digit PIN'} subtitle="Stored as a salted hash in the Android Keystore" chevron onPress={() => setPinSheet(true)} />
          {pinSet ? (
            <Button
              title="Remove PIN"
              variant="ghost"
              size="sm"
              onPress={async () => {
                await clearPin();
                setPinSet(false);
                toast('PIN removed');
              }}
            />
          ) : null}
          <Divider />
          <SwitchRow icon="finger-print" label="Fingerprint / face unlock" description={bioAvailable ? undefined : 'No biometrics enrolled on this phone'} value={settings.biometric && bioAvailable} onChange={(v) => saveSettings({ biometric: v })} />
          <View style={{ gap: 8, paddingVertical: space(1) }}>
            <Txt variant="small" tone="muted">
              Lock after leaving the app
            </Txt>
            <Row gap={1} wrap>
              {[0, 1, 5, 15].map((m) => (
                <Chip key={m} compact label={m === 0 ? 'Immediately' : `${m} min`} selected={settings.autoLockMinutes === m} onPress={() => saveSettings({ autoLockMinutes: m })} />
              ))}
            </Row>
          </View>
          <SwitchRow icon="eye-off" label="Block screenshots" description="Also hides amounts in the recent-apps view" value={settings.screenSecure} onChange={(v) => saveSettings({ screenSecure: v })} />
          <SwitchRow icon="trash-bin" label="Erase after 10 wrong PINs" value={settings.wipeAfterFailures} onChange={(v) => saveSettings({ wipeAfterFailures: v })} />
          <SwitchRow icon="image" label="Delete screenshots after approval" description="Keeps only the numbers you approved" value={settings.deleteCapturesAfterApproval} onChange={(v) => saveSettings({ deleteCapturesAfterApproval: v })} />
        </Card>
      </Section>

      <Section title="Capture & reminders">
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <ListRow
            icon="chatbubble-ellipses"
            iconColor={colors.info}
            title="Bank SMS capture"
            subtitle={Platform.OS !== 'android' ? 'Not possible on iOS' : !isSmsAvailable() ? 'Not included in this build' : settings.smsEnabled ? 'On' : 'Off'}
            chevron
            onPress={() => router.push('/settings/sms')}
          />
          <Divider inset={space(9)} />
          <ListRow
            icon="notifications"
            iconColor={colors.warn}
            title="Reminders"
            subtitle="Allow notifications and rebuild schedule"
            chevron
            onPress={async () => {
              if (!(await ensurePermission())) return toast('Notifications are blocked in Android settings', { tone: 'error' });
              const n = await rescheduleAll();
              toast(`${n} reminders scheduled`, { tone: 'success' });
            }}
          />
        </Card>
        <Card>
          <SwitchRow icon="moon" label="Evening review nudge" description="9 PM reminder when captures are waiting" value={settings.reviewNudge} onChange={(v) => saveSettings({ reviewNudge: v })} />
          <SwitchRow icon="people" label="Share new entries with family by default" description="Off = new entries are private" value={settings.defaultTxnScope === 'household'} onChange={(v) => saveSettings({ defaultTxnScope: v ? 'household' : 'personal' })} />
        </Card>
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

      <Section title="Privacy">
        <Card tone="alt" style={{ gap: 6 }}>
          <Txt variant="small" tone="muted">
            • Everything is stored on this phone in an encrypted database.{'\n'}• Nothing is uploaded unless you turn on cloud sync, and then only encrypted household entries the server cannot read.{'\n'}• Screenshots and SMS are read on the phone; raw SMS text is never saved.{'\n'}• Sync files are encrypted with your household key.
          </Txt>
        </Card>
        <Button title="Erase all data on this phone" variant="danger" icon="warning" onPress={() => setEraseSheet(true)} />
      </Section>

      <Sheet visible={pinSheet} onClose={() => setPinSheet(false)} title={pinSet ? 'Change PIN' : 'Set PIN'}>
        <TextField label="New 6-digit PIN" value={pin} onChangeText={(v) => setPinValue(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secure />
        <TextField label="Repeat PIN" value={pin2} onChangeText={(v) => setPin2(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secure />
        <Button title="Save PIN" onPress={savePin} />
      </Sheet>

      <Sheet visible={eraseSheet} onClose={() => setEraseSheet(false)} title="Erase everything?">
        <Txt tone="muted">Deletes all transactions, loans, cards, bills, keys and screenshots from this phone. This can't be undone. Make a backup first if you need one.</Txt>
        <TextField label='Type "ERASE" to confirm' value={eraseText} onChangeText={setEraseText} autoCapitalize="characters" />
        <Button title="Erase all data" variant="danger" disabled={eraseText !== 'ERASE'} onPress={eraseEverything} />
      </Sheet>
    </Screen>
  );
}
