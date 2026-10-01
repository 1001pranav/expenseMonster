import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
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
        <Txt variant="h2">ExpenseMonster is locked</Txt>
        {hasPin ? (
          <View style={{ flexDirection: 'row', gap: 14, marginTop: space(1) }} accessibilityLabel={`${pin.length} of 6 digits entered`}>
            {Array.from({ length: 6 }, (_, i) => (
              <View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: i < pin.length ? colors.primary : colors.border }} />
            ))}
          </View>
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
