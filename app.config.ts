import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Which build this is, shown in the diagnostics log so a log can be matched to its code: CI sets
 * BUILD_REF (e.g. "pr15", "main") and BUILD_SHA; a local build falls back to the checked-out commit.
 */
function buildId(): string {
  let sha = process.env.BUILD_SHA ?? '';
  if (!sha) {
    try {
      // Config files run in Node; the app's TypeScript setup has no Node types, hence require.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { execSync } = require('child_process') as { execSync: (cmd: string, opts: object) => { toString(): string } };
      sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      sha = 'unknown';
    }
  }
  return [process.env.BUILD_REF ?? 'local', sha.slice(0, 7)].join(' ');
}

/**
 * INTERNET is kept for the optional Supabase cloud sync (project in src/config/supabase.ts) and the
 * optional assistant model download. Both are off until the user turns them on; the sync server
 * only ever receives end-to-end encrypted bundles.
 *
 * The app never reads SMS: bank messages come in only when the user pastes one. The SMS
 * permissions are blocked so no library can merge them back into the manifest.
 */

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'ExpenseMonster',
  slug: 'expense-monster',
  version: '1.0.0',
  extra: { ...config.extra, build: buildId() },
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
    permissions: ['android.permission.USE_BIOMETRIC', 'android.permission.CAMERA'],
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.READ_SMS',
      'android.permission.RECEIVE_SMS',
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
    // Shares arrive in a small native activity that forwards them to the running app. Listed before
    // expo-share-intent because manifest mods run last-listed first: this moves the filters it adds.
    './plugins/withShareReceiver',
    ['expo-share-intent', { androidIntentFilters: ['image/*'], androidMultiIntentFilters: ['image/*'], disableIOS: true }],
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
});
