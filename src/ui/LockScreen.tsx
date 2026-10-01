import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/db/store';
import { verifyPin } from '@/services/secure';
import { eraseEverything } from '@/services/wipe';
import { Button, Txt } from './components/core';
import { Keypad } from './components/feedback';
import { space, useTheme } from './theme';

const MAX_FAILURES = 10;

export function LockScreen({ hasPin, onUnlock }: { hasPin: boolean; onUnlock: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useStore((s) => s.settings);
  const name = useStore((s) => s.tables.members.find((m) => m.id === s.identity.selfMemberId)?.name);
  const shake = useSharedValue(0);
  const dotsStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tryBiometric = useCallback(async () => {
    const available = settings.biometric && (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
    if (!available) {
      // No PIN and no usable biometrics: nothing to unlock with, so don't trap the user.
      if (!hasPin) onUnlock();
      return;
    }
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock ExpenseMonster',
      cancelLabel: hasPin ? 'Use PIN' : 'Cancel',
      disableDeviceFallback: hasPin,
    });
    if (res.success) onUnlock();
  }, [settings.biometric, hasPin, onUnlock]);

  useEffect(() => {
    tryBiometric();
  }, [tryBiometric]);

  const submit = async (value: string) => {
    setBusy(true);
    const { ok, failures } = await verifyPin(value);
    setBusy(false);
    if (ok) return onUnlock();
    setPin('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    shake.set(withSequence(withTiming(-12, { duration: 50 }), withTiming(12, { duration: 50 }), withTiming(-8, { duration: 50 }), withTiming(8, { duration: 50 }), withTiming(0, { duration: 50 })));
    if (settings.wipeAfterFailures && failures >= MAX_FAILURES) {
      await eraseEverything();
      return;
    }
    const left = MAX_FAILURES - failures;
    setError(settings.wipeAfterFailures && left <= 3 ? `Wrong PIN. ${left} tries before all data is erased.` : 'Wrong PIN');
  };

  const onKey = (k: string) => {
    if (busy) return;
    setError(null);
    if (k === 'clear') return setPin('');
    if (k === 'del') return setPin((p) => p.slice(0, -1));
    if (k === '.') return;
    const next = (pin + k).slice(0, 6);
    setPin(next);
    if (next.length === 6) submit(next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space(8), paddingBottom: insets.bottom + space(3), paddingHorizontal: space(4), justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', gap: space(2) }}>
        <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="lock-closed" size={32} color={colors.primaryText} />
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Txt variant="h2">{name ? `Welcome back, ${name.split(' ')[0]}` : 'Welcome back'}</Txt>
          <Txt tone="muted">{hasPin ? 'Enter your 6-digit PIN' : 'Unlock to continue'}</Txt>
        </View>
        {hasPin ? (
          <Animated.View style={[{ flexDirection: 'row', gap: 14, marginTop: space(1) }, dotsStyle]} accessibilityLabel={`${pin.length} of 6 digits entered`}>
            {Array.from({ length: 6 }, (_, i) => (
              <View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: error ? colors.expense : i < pin.length ? colors.primary : 'transparent', borderWidth: 1.5, borderColor: error ? colors.expense : i < pin.length ? colors.primary : colors.textFaint }} />
            ))}
          </Animated.View>
        ) : null}
        <Txt variant="small" tone="expense" style={{ minHeight: 18 }}>
          {error ?? ''}
        </Txt>
      </View>
      {hasPin ? <Keypad onKey={onKey} /> : null}
      {settings.biometric ? <Button title="Use fingerprint / face" icon="finger-print" variant="ghost" onPress={tryBiometric} /> : null}
    </View>
  );
}
