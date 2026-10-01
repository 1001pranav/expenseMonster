import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Build variants (set in eas.json or the shell):
 * - APP_VARIANT=production  → release build with the INTERNET permission removed, so the app
 *   physically cannot send data anywhere.
 * - STORE=play              → Play Store flavour without READ_SMS (Google restricts it to
 *   default SMS apps). Screenshot capture still works.
 */
const production = process.env.APP_VARIANT === 'production';
const playStore = process.env.STORE === 'play';

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
    permissions: ['android.permission.USE_BIOMETRIC', 'android.permission.CAMERA', ...(playStore ? [] : ['android.permission.READ_SMS'])],
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      ...(production ? ['android.permission.INTERNET'] : []),
      ...(playStore ? ['android.permission.READ_SMS'] : []),
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
    ['expo-share-intent', { androidIntentFilters: ['image/*'], disableIOS: true }],
    '@react-native-community/datetimepicker',
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
  ],
  experiments: { typedRoutes: false },
  extra: { smsEnabled: !playStore },
});
