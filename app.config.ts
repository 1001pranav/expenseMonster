import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Which build this is, shown in the diagnostics log so a log can be matched to its code, e.g.
 * "pr15 3f2a9c1". On GitHub Actions it comes from the run's own variables (a pull request's head
 * commit, not the temporary merge commit); a local build uses the checked-out commit.
 */
function buildId(): string {
  const env = process.env;
  let sha = '';
  let ref = 'local';
  if (env.GITHUB_ACTIONS) {
    const pr = env.GITHUB_REF?.match(/^refs\/pull\/(\d+)\//)?.[1];
    ref = pr ? `pr${pr}` : (env.GITHUB_REF_NAME ?? 'ci');
    sha = env.GITHUB_SHA ?? '';
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const event = JSON.parse(require('fs').readFileSync(env.GITHUB_EVENT_PATH ?? '', 'utf8')) as { pull_request?: { head?: { sha?: string } } };
      sha = event.pull_request?.head?.sha ?? sha;
    } catch {
      // Not a pull request event, or no event file: keep GITHUB_SHA.
    }
  }
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
  return `${ref} ${sha.slice(0, 7)}`;
}

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
