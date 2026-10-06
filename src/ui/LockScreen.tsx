import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/db/store';
import { verifyPin } from '@/services/secure';
import { eraseEverything } from '@/services/wipe';
import { Aurora, BrandMark } from './components/Aurora';
import { Txt } from './components/core';
import { Keypad } from './components/feedback';
import { radius, space, useTheme } from './theme';

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

  const inFlight = useRef(false);

  const tryBiometric = useCallback(async () => {
    try {
      const available = settings.biometric && (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
      if (!available) {
        // No PIN and no usable biometrics: nothing to unlock with, so don't trap the user.
        if (!hasPin) onUnlock();
        return;
      }
      // A prompt that Android dropped (app switching from the share sheet) stays "in progress" and
      // blocks every later attempt, so cancel it before asking again.
      if (inFlight.current) await LocalAuthentication.cancelAuthenticate().catch(() => {});
      inFlight.current = true;
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock ExpenseMonster',
        cancelLabel: hasPin ? 'Use PIN' : 'Cancel',
        disableDeviceFallback: hasPin,
      });
      if (res.success) onUnlock();
    } catch {
      // The button below lets the user try again.
    } finally {
      inFlight.current = false;
    }
  }, [settings.biometric, hasPin, onUnlock]);

  // Prompt once per lock, and only once the app is in front: a prompt shown while the app is still
  // coming up from GPay / PhonePe / BHIM's share sheet is cancelled by Android.
  useEffect(() => {
    if (AppState.currentState === 'active') {
      tryBiometric();
      return;
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      sub.remove();
      tryBiometric();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <View style={{ flex: 1, backgroundColor: colors.heroBase, paddingTop: insets.top + space(8), paddingBottom: insets.bottom + space(3), paddingHorizontal: space(4), justifyContent: 'space-between' }}>
      <Aurora variant="calm" />
      <View style={{ alignItems: 'center', gap: space(2) }}>
        <BrandMark size={96} />
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Txt variant="h1" style={{ color: '#FFFFFF' }}>
            {name ? `Welcome back, ${name.split(' ')[0]}` : 'Welcome back'}
          </Txt>
          <Txt style={{ color: 'rgba(255,255,255,0.7)' }}>{hasPin ? 'Enter your 6-digit PIN' : 'Unlock to continue'}</Txt>
        </View>
        {hasPin ? (
          <Animated.View style={[{ flexDirection: 'row', gap: 14, marginTop: space(1) }, dotsStyle]} accessibilityLabel={`${pin.length} of 6 digits entered`}>
            {Array.from({ length: 6 }, (_, i) => (
              <View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: error ? colors.heroGlowB : i < pin.length ? '#FFFFFF' : 'transparent', borderWidth: 1.5, borderColor: error ? colors.heroGlowB : i < pin.length ? '#FFFFFF' : 'rgba(255,255,255,0.45)' }} />
            ))}
          </Animated.View>
        ) : null}
        <Txt variant="small" style={{ minHeight: 18, color: '#FFB3C7' }}>
          {error ?? ''}
        </Txt>
      </View>
      {hasPin ? <Keypad onKey={onKey} onDark /> : null}
      {settings.biometric ? (
        <Pressable
          onPress={tryBiometric}
          accessibilityRole="button"
          style={({ pressed }) => ({ height: 52, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: pressed ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' })}
        >
          <Ionicons name="finger-print" size={20} color="#FFFFFF" />
          <Txt variant="bodyStrong" style={{ color: '#FFFFFF' }}>
            Use fingerprint / face
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}
