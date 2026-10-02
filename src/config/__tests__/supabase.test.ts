import { bytesToUtf8 } from '@noble/ciphers/utils.js';
import { fromBase64 } from '@/domain/sync/crypto';
import { SUPABASE } from '../supabase';

/** Role claim of a legacy JWT key ("anon" / "service_role"), or null if it isn't one. */
function jwtRole(key: string): string | null {
  const payload = key.split('.')[1];
  if (!key.startsWith('eyJ') || !payload) return null;
  try {
    return JSON.parse(bytesToUtf8(fromBase64(payload.replace(/-/g, '+').replace(/_/g, '/')))).role ?? null;
  } catch {
    return null;
  }
}

// This file ships inside every APK, so a server key here would hand out full database access.
describe('committed Supabase config', () => {
  it('never contains a secret / service_role key', () => {
    expect(SUPABASE.anonKey.startsWith('sb_secret_')).toBe(false);
    expect(jwtRole(SUPABASE.anonKey)).not.toBe('service_role');
  });

  it('is either fully set or fully empty', () => {
    expect(Boolean(SUPABASE.url.trim())).toBe(Boolean(SUPABASE.anonKey.trim()));
  });

  it('points at an https Supabase URL when set', () => {
    if (SUPABASE.url) expect(SUPABASE.url).toMatch(/^https:\/\//);
  });
});
