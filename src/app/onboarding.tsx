import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { OVERALL_BUDGET } from '@/domain/budget';
import { cycleFor, cycleLabel, effectivePayday, type BudgetPeriod } from '@/domain/cycle';
import { formatINR, type Paise } from '@/domain/money';
import { insert, saveIdentity, saveSettings } from '@/db/repo';
import { MEMBER_COLORS } from '@/db/seed';
import { getState, useStore } from '@/db/store';
import { useToday } from '@/data/hooks';
import { vaultAvailable } from '@/services/vault';
import { setPin } from '@/services/secure';
import { BrandMark } from '@/ui/components/Aurora';
import { Button, Chip, Row, Txt, type IconName } from '@/ui/components/core';
import { toast } from '@/ui/components/feedback';
import { AmountField, Segmented, SwitchRow, TextField } from '@/ui/components/forms';
import { DayGrid, ordinal } from '@/ui/components/PaydaySheet';
import { Screen } from '@/ui/components/Screen';
import { fonts, space, useTheme } from '@/ui/theme';

type Start = 'fresh' | 'join';
/** Fresh: promise → month → lock (3 screens). Joining a family phone adds a name and the code scan. */
type Step = 'start' | 'name' | 'month' | 'lock';

/** Shortcuts on the budget step: round numbers to tap instead of typing. */
const QUICK = [20_000_00, 30_000_00, 50_000_00];

/**
 * First run, at most three screens: what the app promises, one monthly number (which makes
 * safe-to-spend work on day one), and an optional lock. Then straight into Quick Add, because
 * logging a first expense is what makes the app useful. SMS access, cards, bills and family are
 * asked for later, when each becomes relevant: asking before showing any value loses people.
 */
export default function Onboarding() {
  const identity = useStore((s) => s.identity);
  const today = useToday();
  const [step, setStep] = useState<Step>('start');
  const [start, setStart] = useState<Start>('fresh');
  const [name, setName] = useState('');
  const [budget, setBudget] = useState<Paise | null>(null);
  const [budgetKey, setBudgetKey] = useState(0);
  const [period, setPeriod] = useState<BudgetPeriod>('calendar');
  const [payday, setPayday] = useState(1);
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
      await saveIdentity({ selfMemberId: me.id, deviceName: `${name.trim()}'s phone` });
    }
    setStep('lock');
    // Joining: scan the family phone's code now; the lock step waits underneath.
    router.push('/sync/scan');
  };

  const finish = async () => {
    if (pin && !/^\d{6}$/.test(pin)) return toast('The PIN needs 6 digits, or leave it empty', { tone: 'error' });
    if (pin) await setPin(pin);
    if (start === 'fresh') {
      // Starting fresh skips the name: one person on one phone doesn't need one yet. It shows as
      // "You" in the app and can be changed from the initial on Home before inviting family.
      if (!getState().identity.selfMemberId) {
        const me = await insert('members', { name: 'Me', upiId: null, phone: null, color: MEMBER_COLORS[0], scope: 'household' });
        await saveIdentity({ selfMemberId: me.id });
      }
      // Saved here, not on the budget step, so going Back and forward can't add it twice.
      const hasOverall = getState().tables.budgets.some((b) => b.categoryId === OVERALL_BUDGET && !b.deletedAt);
      if (budget && !hasOverall) await insert('budgets', { categoryId: OVERALL_BUDGET, month: '*', amount: budget, scope: 'household' });
      await saveSettings(period === 'payday' && payday > 1 ? { budgetPeriod: 'payday', payday } : { budgetPeriod: 'calendar' });
    }
    await saveSettings({ biometric: bio });
    await saveIdentity({ onboarded: true });
    router.replace('/');
    // Straight into logging: the first entry is what makes Home mean something.
    if (start === 'fresh') setTimeout(() => router.push({ pathname: '/quick-add', params: { first: '1' } }), 350);
  };

  if (step === 'start') {
    return (
      <Screen contentStyle={{ paddingTop: space(5), gap: space(3) }}>
        <View style={{ gap: space(2), paddingHorizontal: 4 }}>
          <BrandMark size={64} />
          <Txt style={{ fontWeight: fonts.bold, fontSize: 30, lineHeight: 36 }}>Your money, on your phone only.</Txt>
        </View>
        <View style={{ gap: space(1.75), paddingHorizontal: 4 }}>
          <PromiseRow icon="cloud-offline-outline" title="Works offline" body="No account to create, nothing to sign up for." />
          <PromiseRow icon="lock-closed-outline" title="Encrypted on this phone" body="Your entries are stored encrypted, on this device." />
          <PromiseRow icon="eye-off-outline" title="Nothing leaves it" body="Unless you turn on backup or family sync, and then only encrypted." />
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ gap: space(1) }}>
          <Button
            title="Get started"
            size="lg"
            onPress={() => {
              setStart('fresh');
              setStep('month');
            }}
          />
          <Button
            title="Join my family's phone"
            variant="secondary"
            icon="qr-code-outline"
            onPress={() => {
              setStart('join');
              setStep('name');
            }}
          />
          {vaultAvailable ? <Button title="Restore from a backup" variant="ghost" onPress={() => router.push({ pathname: '/settings/cloud-backup', params: { restore: '1' } })} /> : null}
        </View>
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
            <Button title="Continue and scan the code" onPress={saveName} style={{ flex: 1 }} size="lg" />
          </Row>
        }
      >
        <Txt style={{ fontWeight: fonts.bold, fontSize: 26, lineHeight: 32 }}>What should your family see you as?</Txt>
        <TextField label="Your name" value={name} onChangeText={setName} placeholder="For example, Asha" autoCapitalize="words" autoFocus />
        <Txt tone="muted">Next, scan the code on the other phone. They open it by tapping the initial at the top of Home, then Family phones, then Show QR.</Txt>
      </Screen>
    );
  }

  if (step === 'month') {
    const preview = cycleFor(today, effectivePayday(period, payday));
    return (
      <Screen
        back={false}
        contentStyle={{ paddingTop: space(3) }}
        footer={
          <Row gap={1}>
            <Button title="Back" variant="secondary" onPress={() => setStep('start')} />
            <Button title={budget ? 'Continue' : 'Skip for now'} variant={budget ? 'primary' : 'secondary'} onPress={() => setStep('lock')} style={{ flex: 1 }} size="lg" />
          </Row>
        }
      >
        <StepLabel n={2} />
        <Txt style={{ fontWeight: fonts.bold, fontSize: 26, lineHeight: 32 }}>How much do you want to spend in a month?</Txt>
        <Txt tone="muted">One number. Home turns it into what's safe to spend each day. You can split it by category later.</Txt>
        <AmountField key={budgetKey} label="Monthly spending" value={budget} onChange={setBudget} placeholder="30,000" />
        <Row gap={1} wrap>
          {QUICK.map((q) => (
            <Chip
              key={q}
              compact
              label={formatINR(q, { decimals: 'never' })}
              selected={budget === q}
              onPress={() => {
                setBudget(q);
                setBudgetKey((k) => k + 1);
              }}
            />
          ))}
        </Row>

        <View style={{ gap: space(1.25), marginTop: space(1) }}>
          <Txt variant="bodyStrong">When does your month start?</Txt>
          <Segmented
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'calendar', label: 'On the 1st' },
              { value: 'payday', label: 'On pay day' },
            ]}
          />
          {period === 'payday' ? (
            <>
              <Txt variant="small" tone="muted">
                Which day does your salary arrive? Paid on the 29th–31st? Pick 28.
              </Txt>
              <DayGrid value={payday} onChange={setPayday} />
            </>
          ) : null}
          <Txt variant="small" tone="muted">
            {period === 'payday' && payday === 1 ? 'Pick your salary day above.' : `This month: ${cycleLabel(preview)}${period === 'payday' ? `, from the ${ordinal(payday)}` : ''}.`}
          </Txt>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      back={false}
      contentStyle={{ paddingTop: space(3) }}
      footer={
        <View style={{ gap: space(1) }}>
          <Button title={start === 'fresh' ? 'Done, log my first expense' : 'Start using ExpenseMonster'} onPress={finish} size="lg" />
          {start === 'fresh' ? <Button title="Back" variant="ghost" onPress={() => setStep('month')} /> : null}
        </View>
      }
    >
      {start === 'fresh' ? <StepLabel n={3} /> : null}
      <Txt style={{ fontWeight: fonts.bold, fontSize: 26, lineHeight: 32 }}>Lock the app?</Txt>
      <Txt tone="muted">Your data is already encrypted. A lock stops anyone who picks up your unlocked phone from opening it.</Txt>
      {bioAvailable ? <SwitchRow icon="finger-print" label="Unlock with fingerprint or face" value={bio} onChange={setBio} /> : null}
      <TextField label="6-digit PIN (optional)" value={pin} onChangeText={(v) => setPinValue(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secure />
      <Txt variant="small" tone="muted">
        You can change this any time in Settings.
      </Txt>
    </Screen>
  );
}

function StepLabel({ n }: { n: number }) {
  return (
    <Txt variant="caption" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: fonts.semibold }} accessibilityLabel={`Step ${n} of 3`}>
      {`Step ${n} of 3`}
    </Txt>
  );
}

function PromiseRow({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <Row gap={1.5} style={{ alignItems: 'flex-start' }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={20} color={colors.textMuted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        <Txt variant="small" tone="muted">
          {body}
        </Txt>
      </View>
    </Row>
  );
}

