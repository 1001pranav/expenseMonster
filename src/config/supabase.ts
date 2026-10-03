/**
 * Supabase project for the optional cloud sync, compiled into the app at build time from:
 * - local builds: `.env.local` (git-ignored; copy `.env.example`)
 * - GitHub Actions: the `APP_ENV` repository secret, holding the same lines as `.env.local`
 *
 * Expo inlines EXPO_PUBLIC_* variables into the JavaScript bundle, so the built APK carries the
 * values; nothing is read at runtime. Both are public by design (the server only exposes
 * emx_push / emx_pull and stores encrypted bundles). Use the publishable / anon key, NEVER the
 * service_role / secret key: a test fails the build if one is set.
 *
 * Unset → the cloud sync option is hidden.
 */
export const SUPABASE = {
  // Direct `process.env.EXPO_PUBLIC_…` access is required for Expo to inline the value.
  url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};
