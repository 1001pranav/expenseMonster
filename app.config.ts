import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * INTERNET is kept for the optional Supabase cloud sync (project in src/config/supabase.ts) and the
 * optional assistant model download. Both are off until the user turns them on; the sync server
 * only ever receives end-to-end encrypted bundles.
 *
 * Build variants (set in eas.json or the shell):
 * - SMS=1                   → include READ_SMS for automatic bank-SMS capture. Off by default:
 *   Play Protect's enhanced fraud protection (India) blocks sideloaded installs of any app that
 *   asks for SMS access, so only use this for builds installed over ADB. Without it, bank SMS
 *   reach the app through the share sheet or by pasting.
 * - STORE=play              → Play Store flavour. Never includes READ_SMS (Google restricts it to
 *   default SMS apps). Screenshot capture still works.
 */
const playStore = process.env.STORE === 'play';
const withSms = process.env.SMS === '1' && !playStore;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'ExpenseMonster',
  slug: 'expense-monster',
  version: '1.0.0',
  scheme: 'expensemonster',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.expensemonster.app',
    infoPlist: {
      NSCameraUsageDescription: 'Used only to scan the pairing QR code of a family member’s phone.',
      NSPhotoLibraryUsageDescription: 'Used to read payment screenshots you choose. Images stay on this phone.',
      NSFaceIDUsageDescription: 'Unlock ExpenseMonster with Face ID.',
    },
  },
  android: {
    package: 'com.expensemonster.app',
    adaptiveIcon: {
      backgroundColor: '#1B1448',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Nothing is backed up to Google's cloud: the DB key lives in the Keystore and wouldn't restore anyway.
    allowBackup: false,
    permissions: ['android.permission.USE_BIOMETRIC', 'android.permission.CAMERA', ...(withSms ? ['android.permission.READ_SMS'] : [])],
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      ...(withSms ? [] : ['android.permission.READ_SMS']),
    ],
  },
  plugins: [
    'expo-router',
    ['expo-sqlite', { useSQLCipher: true }],
    'expo-secure-store',
    'expo-sharing',
    'expo-font',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 160, backgroundColor: '#1B1448' }],
    ['expo-notifications', { color: '#5B3DF5' }],
    ['expo-local-authentication', { faceIDPermission: 'Unlock ExpenseMonster with Face ID.' }],
    ['expo-camera', { cameraPermission: 'Used only to scan the pairing QR code of a family member’s phone.', recordAudioAndroid: false }],
    ['expo-image-picker', { photosPermission: 'Used to read payment screenshots you choose. Images stay on this phone.', cameraPermission: 'Used only to scan the pairing QR code.', microphonePermission: false }],
    // Galleries and file managers often share even a single picture as SEND_MULTIPLE, so register for both.
    // text/* lets a bank SMS be shared from Messages without the READ_SMS permission.
    ['expo-share-intent', { androidIntentFilters: ['image/*', 'text/*'], androidMultiIntentFilters: ['image/*'], disableIOS: true }],
    // On-device assistant runtime (LiteRT-LM, ~21 MB). The Gemma weights are not bundled: the
    // user downloads them from Settings → On-device assistant, so the APK stays small.
    ['expo-ai-kit', { llm: true }],
    '@react-native-community/datetimepicker',
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
    // Long-press the app icon: Expense / Scan / Dues / Ask (deep links into the app).
    './plugins/withAndroidShortcuts',
    // Home-screen "Quick add" widget: Expense / Income / Scan buttons, no amounts shown.
    './plugins/withAndroidWidget',
  ],
  experiments: { typedRoutes: false },
  extra: { smsEnabled: withSms },
});
