import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { saveSettings } from '@/db/repo';
import { useStore } from '@/db/store';
import { clearPin, hasPin, setPin } from '@/services/secure';
import { eraseEverything } from '@/services/wipe';
import { Button, Card, Chip, Divider, ListRow, Row, Section, Txt } from '@/ui/components/core';
import { Sheet, toast } from '@/ui/components/feedback';
import { SwitchRow, TextField } from '@/ui/components/forms';
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
    <Screen title="App lock and privacy" back>
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
        </Card>
      </Section>

      <Section title="Privacy">
        <SwitchRow icon="eye-off-outline" label="Hide amounts" description="Shows ₹ •••• everywhere until you tap the eye on Home" value={settings.hideAmounts} onChange={(v) => saveSettings({ hideAmounts: v })} />
        <SwitchRow icon="people-outline" label="Share new entries with family by default" description="Off: new entries are private to you" value={settings.defaultTxnScope === 'household'} onChange={(v) => saveSettings({ defaultTxnScope: v ? 'household' : 'personal' })} />
      </Section>

      <Section title="How your data is kept">
        <Txt variant="small" tone="muted" style={{ paddingHorizontal: 4 }}>
          • Everything is stored on this phone in an encrypted database.{'\n'}• Nothing is uploaded unless you turn on cloud sync or cloud backup, and then only encrypted data the server cannot read.{'\n'}• Screenshots and SMS are read on the phone; SMS text stays on this phone only until you approve or reject the capture, and is never synced or backed up.{'\n'}• Sync files are encrypted with your household key.{'\n'}• The optional assistant runs on this phone; questions and data are never sent anywhere.
        </Txt>
      </Section>

      <Section title="Erase">
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
