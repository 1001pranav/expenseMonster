/**
 * Supabase project for the optional cloud sync, compiled into every build.
 *
 * Both values are public by design: anyone can read them out of the APK. That is safe because
 * the database only accepts calls to emx_push / emx_pull and only ever stores end-to-end
 * encrypted bundles (see supabase/migrations).
 *
 * - url: Supabase dashboard → Project Settings → Data API → Project URL
 * - anonKey: Project Settings → API Keys → the "publishable" key (sb_publishable_…) or the
 *   legacy "anon public" key (eyJ…).
 *
 * NEVER put the service_role / secret key here: it bypasses every protection on the server.
 * Leave both empty to ship without cloud sync (the option is then hidden in the app).
 */
export const SUPABASE = {
  url: '',
  anonKey: '',
};
