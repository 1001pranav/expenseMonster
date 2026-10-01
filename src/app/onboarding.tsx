import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { insert, saveIdentity, saveSettings } from '@/db/repo';
import { MEMBER_COLORS } from '@/db/seed';
import { useStore } from '@/db/store';
import { isSmsAvailable } from '../../modules/sms-reader';
import { ensurePermission } from '@/services/notifications';
import { setPin } from '@/services/secure';
import { Button, Card, ListRow, Row, Txt, type IconName } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { SwitchRow, TextField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/Screen';
import { radius, space, useTheme } from '@/ui/theme';

const STEPS = 4;

export default function Onboarding() {
  const { colors } = useTheme();
  const identity = useStore((s) => s.identity);
  const [step, setStep] = useState(0);
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

  const next = async () => {
    if (step === 0) {
      if (!name.trim()) return toast('What should we call you?', { tone: 'error' });
      if (!identity.selfMemberId) {
        const me = await insert('members', { name: name.trim(), upiId: null, phone: null, color: MEMBER_COLORS[0], scope: 'household' });
        await saveIdentity({ selfMemberId: me.id, deviceName: `${name.trim()}'s phone`, householdName: household.trim() || 'Our home' });
      } else {
        await saveIdentity({ householdName: household.trim() || 'Our home' });
      }
    }
    if (step === 1) {
      if (pin && !/^\d{6}$/.test(pin)) return toast('PIN must be 6 digits (or leave empty)', { tone: 'error' });
      if (pin) await setPin(pin);
      await saveSettings({ biometric: bio });
    }
    if (step < STEPS - 1) setStep(step + 1);
    else finish();
  };

  const finish = async () => {
    await saveIdentity({ onboarded: true });
    router.replace('/');
  };

  const dots = (
    <Row gap={0.75} style={{ justifyContent: 'center' }}>
      {Array.from({ length: STEPS }, (_, i) => (
        <View key={i} style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i <= step ? colors.primary : colors.border }} />
      ))}
    </Row>
  );

  return (
    <Screen
      footer={
        <View style={{ gap: space(1.5) }}>
          {dots}
          <Row gap={1}>
            {step > 0 ? <Button title="Back" variant="secondary" onPress={() => setStep(step - 1)} /> : null}
            <Button title={step === STEPS - 1 ? 'Start using ExpenseMonster' : 'Continue'} onPress={next} style={{ flex: 1 }} size="lg" />
          </Row>
          {step > 0 && step < STEPS - 1 ? <Button title="Skip" variant="ghost" size="sm" onPress={() => setStep(step + 1)} /> : null}
        </View>
      }
      contentStyle={{ paddingTop: space(4) }}
    >
      {step === 0 ? (
        <>
          <Hero icon="wallet" title="Your household's money, on your phone only" body="Expenses, loans, EMIs, credit cards, bills and insurance. No account, no server, no ads." />
          <TextField label="Your name" value={name} onChangeText={setName} placeholder="Pranav" autoCapitalize="words" autoFocus />
          <TextField label="Household name" value={household} onChangeText={setHousehold} placeholder="The Sharmas" autoCapitalize="words" />
        </>
      ) : null}

      {step === 1 ? (
        <>
          <Hero icon="lock-closed" title="Lock it" body="Your data is already encrypted on this phone. Add a lock so nobody can open the app on your unlocked phone." />
          <TextField label="6-digit PIN (optional)" value={pin} onChangeText={(v) => setPinValue(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secure />
          {bioAvailable ? <SwitchRow icon="finger-print" label="Unlock with fingerprint / face" value={bio} onChange={setBio} /> : null}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Hero icon="people" title="Joining your family?" body="If someone at home already uses ExpenseMonster, scan the QR code on their phone (Household → Sync → Show my QR)." />
          <Card padded={false} style={{ overflow: 'hidden' }}>
            <ListRow icon="scan" iconColor={colors.primary} title="Scan family QR code" subtitle="Share bills, loans and expenses" chevron onPress={() => router.push('/sync/scan')} />
          </Card>
          <Txt variant="small" tone="muted" style={{ textAlign: 'center' }}>
            Starting fresh? Just continue. You can pair later.
          </Txt>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Hero icon="notifications" title="Never miss a due date" body="Reminders before every EMI, card bill, utility bill and insurance renewal. Generated on this phone." />
          <Card padded={false} style={{ overflow: 'hidden' }}>
            <ListRow
              icon="notifications-outline"
              iconColor={colors.warn}
              title="Allow reminders"
              subtitle="Local notifications"
              chevron
              onPress={async () => toast((await ensurePermission()) ? 'Reminders on' : 'You can enable them later in Settings', { tone: 'success' })}
            />
            {Platform.OS === 'android' && isSmsAvailable() ? (
              <ListRow icon="chatbubble-ellipses-outline" iconColor={colors.info} title="Read bank SMS (optional)" subtitle="Suggests transactions for you to approve" chevron onPress={() => router.push('/settings/sms')} />
            ) : null}
          </Card>
          <Card tone="alt" style={{ gap: 6 }}>
            <Txt variant="bodyStrong">Tip: share screenshots</Txt>
            <Txt variant="small" tone="muted">
              After paying in GPay or PhonePe, tap Share → ExpenseMonster. The amount, payee and UPI reference are read on the phone.
            </Txt>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function Hero({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space(1.5), marginBottom: space(1) }}>
      <View style={{ width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={30} color={colors.primaryText} />
      </View>
      <Txt variant="h1">{title}</Txt>
      <Txt tone="muted">{body}</Txt>
    </View>
  );
}
