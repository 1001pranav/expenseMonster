import '@/polyfills';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';
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
import { cloudSyncSoon, type CloudResult } from '@/services/cloud';
import { ACTION_PAID, ACTION_SNOOZE, configureNotifications, rescheduleAll, scheduleSoon, snooze } from '@/services/notifications';
import { hasPin } from '@/services/secure';
import { isOwnBiometricTransition } from '@/services/unlock';
import { Button, Txt } from '@/ui/components/core';
import { ToastHost, toast } from '@/ui/components/feedback';
import { LockScreen } from '@/ui/LockScreen';
import { space, useTheme } from '@/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Not reset on background: the biometric unlock prompt can background the app on some phones and
            would drop a screenshot shared from GPay / PhonePe / BHIM. Router clears it once handled. */}
        <ShareIntentProvider options={{ resetOnBackground: false }}>
          <App />
        </ShareIntentProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function App() {
  const { colors, dark } = useTheme();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Sora_600SemiBold, Sora_700Bold });
  const ready = useStore((s) => s.ready);
  const identity = useStore((s) => s.identity);
  const settings = useStore((s) => s.settings);
  const version = useStore((s) => s.version);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(true);
  const [pinSet, setPinSet] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const unlock = useCallback(() => setLocked(false), []);

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

  // Lock again after the configured time in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      // The fingerprint dialog itself can background the app on some phones: that isn't leaving.
      if (isOwnBiometricTransition()) return;
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active') {
        const away = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0;
        backgroundedAt.current = null;
        if ((pinSet || settings.biometric) && away > settings.autoLockMinutes * 60_000) setLocked(true);
        // A new month may have started while the app was in the background.
        generateFixedBills().catch(() => {});
        cloudSyncSoon(0, onCloudResult);
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

  // Optional cloud sync: upload edits shortly after they happen (no-op unless the user turned it on).
  useEffect(() => {
    if (ready && identity.onboarded && !locked) cloudSyncSoon(10_000, onCloudResult);
  }, [ready, version, identity.onboarded, locked, settings.cloudSync]);

  useEffect(() => {
    if (!ready || locked || !identity.onboarded) return;
    rescheduleAll().catch(() => {});
    // Only on unlock / first ready.
  }, [ready, locked, identity.onboarded]);

  if (!fontsLoaded || (!ready && !error)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.heroBase, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#FFFFFF" />
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
          <LockScreen hasPin={pinSet} onUnlock={unlock} />
        </View>
      ) : null}
    </View>
  );
}

let knownConflicts = 0;
function onCloudResult(r: CloudResult) {
  const grew = r.pendingConflicts > knownConflicts;
  knownConflicts = r.pendingConflicts;
  if (grew) toast(`${r.pendingConflicts} entries changed on two phones. Resolve them in Sync.`, { tone: 'error' });
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
  // resetShareIntent is a new function every render, so this effect re-runs until the reset lands:
  // remember the share already handled so one screenshot doesn't open two Scan screens.
  const handled = useRef<typeof shareIntent | null>(null);

  useEffect(() => {
    if (!hasShareIntent || handled.current === shareIntent) return;
    handled.current = shareIntent;
    const files = shareIntent.files ?? [];
    const isImage = (f: (typeof files)[number]) => f.mimeType?.startsWith('image/') || /\.(?:png|jpe?g|webp|heic)$/i.test(f.fileName ?? f.path ?? '');
    const file = files.find((f) => f.fileName?.endsWith('.emx')) ?? files.find(isImage);
    if (file?.path) {
      const uri = file.path.startsWith('file://') || file.path.startsWith('content://') ? file.path : `file://${file.path}`;
      if (file.fileName?.endsWith('.emx')) router.push({ pathname: '/sync', params: { file: uri } });
      else {
        router.push({ pathname: '/scan', params: { uri } });
        if (files.length > 1) toast('Scanning the first screenshot; share the others one at a time');
      }
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
