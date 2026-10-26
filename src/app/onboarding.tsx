import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { insert, saveIdentity, saveSettings } from '@/db/repo';
import { MEMBER_COLORS } from '@/db/seed';
import { useStore } from '@/db/store';
import { vaultAvailable } from '@/services/vault';
import { setPin } from '@/services/secure';
import { Button, IconCircle, Row, Txt, type IconName } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { SwitchRow, TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { fonts, space, useTheme } from '@/ui/theme';

type Start = 'fresh' | 'join';
type Step = 'start' | 'name' | 'lock';

/**
 * First run asks how you're starting before anything else: starting fresh, joining a family
 * phone (scan its code) or restoring a backup each need different steps. Notifications are
 * asked for later, when the first bill or EMI is added.
 */
export default function Onboarding() {
  const { colors } = useTheme();
  const identity = useStore((s) => s.identity);
  const [step, setStep] = useState<Step>('start');
  const [start, setStart] = useState<Start>('fresh');
  const [name, setName] = useState('');
  const [household, setHousehold] = useState(identity.householdName === 'Our home' ? '' : identity.householdName);
  const [pin, setPinValue] = useState('');
  const [bio, setBio] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);

  useEffect(() => {
    Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]).then(([h, e]) => {
      setBioAvailable(h && e);
      setBio(h && e);
    });
  }, []);

  const saveName = async () => {
    if (!name.trim()) return toast('Enter your name', { tone: 'error' });
    if (!identity.selfMemberId) {
      const me = await insert('members', { name: name.trim(), upiId: null, phone: null, color: MEMBER_COLORS[0], scope: 'household' });
      await saveIdentity({ selfMemberId: me.id, deviceName: `${name.trim()}'s phone`, householdName: household.trim() || 'Our home' });
    } else {
      await saveIdentity({ householdName: household.trim() || 'Our home' });
    }
    setStep('lock');
    // Joining: scan the family phone's code now; the lock step waits underneath.
    if (start === 'join') router.push('/sync/scan');
  };

  const finish = async () => {
    if (pin && !/^\d{6}$/.test(pin)) return toast('The PIN needs 6 digits, or leave it empty', { tone: 'error' });
    if (pin) await setPin(pin);
    await saveSettings({ biometric: bio });
    await saveIdentity({ onboarded: true });
    router.replace('/');
  };

  const choose = (s: Start) => {
    setStart(s);
    setStep('name');
  };

  if (step === 'start') {
    return (
      <Screen contentStyle={{ paddingTop: space(6), gap: space(3) }}>
        <View style={{ gap: space(1.5), paddingHorizontal: 4 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Txt style={{ fontFamily: fonts.display, fontSize: 26, color: colors.primaryText }}>₹</Txt>
          </View>
          <Txt style={{ fontFamily: fonts.display, fontSize: 32, lineHeight: 38, letterSpacing: -1 }}>Your family's money, kept on your phone</Txt>
          <Txt tone="muted">Spending, EMIs, card bills and reminders. No account to create, nothing to sign up for.</Txt>
        </View>
        <View style={{ gap: space(1.25) }}>
          <Txt variant="bodyStrong" tone="muted" style={{ paddingHorizontal: 4 }}>
            How are you starting?
          </Txt>
          <Choice icon="add" title="Start fresh" body="Your name, then an optional lock" selected onPress={() => choose('fresh')} />
          <Choice icon="qr-code-outline" title="Join my family" body="Scan the code on a family member's phone" onPress={() => choose('join')} />
          {vaultAvailable ? <Choice icon="cloud-download-outline" title="Restore a backup" body="On a new phone, with your recovery code" onPress={() => router.push({ pathname: '/settings/cloud-backup', params: { restore: '1' } })} /> : null}
        </View>
        <Txt variant="small" tone="muted" style={{ paddingHorizontal: 4 }}>
          We'll ask about notifications when you add your first bill.
        </Txt>
      </Screen>
    );
  }

  if (step === 'name') {
    return (
      <Screen
        back={false}
        contentStyle={{ paddingTop: space(4) }}
        footer={
          <Row gap={1}>
            <Button title="Back" variant="secondary" onPress={() => setStep('start')} />
            <Button title={start === 'join' ? 'Continue and scan the code' : 'Continue'} onPress={saveName} style={{ flex: 1 }} size="lg" />
          </Row>
        }
      >
        <Txt style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 34 }}>What should we call you?</Txt>
        <TextField label="Your name" value={name} onChangeText={setName} placeholder="For example, Asha" autoCapitalize="words" autoFocus />
        {start === 'fresh' ? <TextField label="Household name (optional)" value={household} onChangeText={setHousehold} placeholder="For example, The Sharmas" autoCapitalize="words" /> : null}
        {start === 'join' ? <Txt tone="muted">Next, scan the code on the other phone. They open it by tapping the initial at the top of Home, then Family phones, then Show QR.</Txt> : null}
      </Screen>
    );
  }

  return (
    <Screen
      contentStyle={{ paddingTop: space(4) }}
      footer={
        <View style={{ gap: space(1) }}>
          <Button title="Start using ExpenseMonster" onPress={finish} size="lg" />
          {pin ? null : (
            <Txt variant="small" tone="muted" style={{ textAlign: 'center' }}>
              You can add a lock later from the initial on Home.
            </Txt>
          )}
        </View>
      }
    >
      <Txt style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 34 }}>Lock the app</Txt>
      <Txt tone="muted">Your data is already encrypted on this phone. A lock stops anyone who picks up your unlocked phone from opening it.</Txt>
      <TextField label="6-digit PIN (optional)" value={pin} onChangeText={(v) => setPinValue(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secure />
      {bioAvailable ? <SwitchRow icon="finger-print" label="Unlock with fingerprint or face" value={bio} onChange={setBio} /> : null}
    </Screen>
  );
}

function Choice({ icon, title, body, selected, onPress }: { icon: IconName; title: string; body: string; selected?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(1.75), padding: space(2), minHeight: 78, borderRadius: 20, backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderWidth: 1.5, borderColor: selected ? colors.primary : colors.border })}
    >
      <IconCircle name={icon} size={44} state={selected ? 'good' : undefined} />
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        <Txt variant="small" tone="muted">
          {body}
        </Txt>
      </View>
    </Pressable>
  );
}
