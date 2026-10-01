import '@/polyfills';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { generateFixedBills } from '@/data/actions';
import { useStore } from '@/db/store';
import { bootstrap } from '@/services/bootstrap';
import { scanSms } from '@/services/capture';
import { ACTION_PAID, ACTION_SNOOZE, configureNotifications, rescheduleAll, scheduleSoon, snooze } from '@/services/notifications';
import { hasPin } from '@/services/secure';
import { Button, Txt } from '@/ui/components/core';
import { ToastHost, toast } from '@/ui/components/feedback';
import { LockScreen } from '@/ui/LockScreen';
import { space, useTheme } from '@/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ShareIntentProvider options={{ resetOnBackground: true }}>
          <App />
        </ShareIntentProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function App() {
  const { colors, dark } = useTheme();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const ready = useStore((s) => s.ready);
  const identity = useStore((s) => s.identity);
  const settings = useStore((s) => s.settings);
  const version = useStore((s) => s.version);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(true);
  const [pinSet, setPinSet] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  const start = useCallback(() => {
    bootstrap()
      .then(async () => {
        const pin = await hasPin();
        setPinSet(pin);
        const st = useStore.getState();
        setLocked(st.identity.onboarded && (pin || st.settings.biometric));
        // Reminders are important but must never stop the app from opening.
        await configureNotifications().catch(() => {});
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(start, [start]);

  useEffect(() => {
    if (fontsLoaded && (ready || error)) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, ready, error]);

  // Lock again after the configured time in the background; pick up new SMS on return.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active') {
        const away = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0;
        backgroundedAt.current = null;
        if ((pinSet || settings.biometric) && away > settings.autoLockMinutes * 60_000) setLocked(true);
        if (useStore.getState().settings.smsEnabled) scanSms().catch(() => {});
        // A new month may have started while the app was in the background.
        generateFixedBills().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [pinSet, settings.biometric, settings.autoLockMinutes]);

  // FLAG_SECURE: blocks screenshots and hides content in the recent-apps switcher.
  useEffect(() => {
    if (!ready) return;
    if (settings.screenSecure) ScreenCapture.preventScreenCaptureAsync('app').catch(() => {});
    else ScreenCapture.allowScreenCaptureAsync('app').catch(() => {});
  }, [ready, settings.screenSecure]);

  // Rebuild local reminders whenever data changes (debounced).
  useEffect(() => {
    if (ready && identity.onboarded) scheduleSoon();
  }, [ready, version, identity.onboarded]);

  useEffect(() => {
    if (!ready || locked || !identity.onboarded) return;
    if (settings.smsEnabled) scanSms().catch(() => {});
    rescheduleAll().catch(() => {});
    // Only on unlock / first ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, locked, identity.onboarded]);

  if (!fontsLoaded || (!ready && !error)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space(4), gap: space(2) }}>
        <Txt variant="h2">Couldn't open your data</Txt>
        <Txt tone="muted" style={{ textAlign: 'center' }}>
          {error}
        </Txt>
        <Button
          title="Try again"
          onPress={() => {
            setError(null);
            start();
          }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add" options={{ presentation: 'transparentModal', animation: 'fade' }} />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
      </Stack>
      {identity.onboarded && !locked ? <Router /> : null}
      {!identity.onboarded ? <OnboardingRedirect /> : null}
      <ToastHost />
      {locked && identity.onboarded ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <LockScreen hasPin={pinSet} onUnlock={() => setLocked(false)} />
        </View>
      ) : null}
    </View>
  );
}

function OnboardingRedirect() {
  useEffect(() => {
    const t = setTimeout(() => router.replace('/onboarding'), 0);
    return () => clearTimeout(t);
  }, []);
  return null;
}

/** Deep links from notifications and the Android share sheet (screenshots shared from GPay/PhonePe). */
function Router() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!hasShareIntent) return;
    const file = shareIntent.files?.[0];
    if (file?.path) {
      const uri = file.path.startsWith('file://') || file.path.startsWith('content://') ? file.path : `file://${file.path}`;
      if (file.fileName?.endsWith('.emx')) router.push({ pathname: '/sync', params: { file: uri } });
      else if (file.mimeType?.startsWith('image/')) router.push({ pathname: '/scan', params: { uri } });
    }
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  useEffect(() => {
    if (!lastResponse) return;
    const data = lastResponse.notification.request.content.data as { href?: string; dueKey?: string } | undefined;
    if (lastResponse.actionIdentifier === ACTION_SNOOZE) {
      snooze(lastResponse.notification.request).then(() => toast('Snoozed for a day'));
    } else if (lastResponse.actionIdentifier === ACTION_PAID && data?.dueKey) {
      router.push({ pathname: '/pay', params: { due: data.dueKey } });
    } else if (data?.dueKey && lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
      router.push({ pathname: '/pay', params: { due: data.dueKey, upi: '1' } });
    } else if (data?.href) {
      router.push(data.href as never);
    }
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [lastResponse]);

  return null;
}
