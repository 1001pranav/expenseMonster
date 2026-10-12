/**
 * Turn a failed Supabase RPC response into a message a person can act on. The raw PostgREST body
 * is JSON like {"code":"PGRST202","message":"Could not find the function …"}.
 */
export function describeRpcError(fn: string, status: number, body: string): string {
  let err: { code?: string; message?: string } = {};
  try {
    err = JSON.parse(body) ?? {};
  } catch {
    // Not JSON (proxy or gateway page): fall through to the generic message.
  }
  const migration = fn.startsWith('emx_vault_') ? '20261008000000_emx_vault.sql' : '20261010000000_emx_records.sql';
  if (err.code === 'PGRST202' || (status === 404 && /function/i.test(err.message ?? ''))) {
    return `The cloud server is not set up for this feature yet. Run supabase/migrations/${migration} in the Supabase SQL editor.`;
  }
  if (status === 401 || status === 403 || err.code === 'PGRST301' || /api key/i.test(err.message ?? '')) {
    return 'The cloud server refused this app (API key). Check EXPO_PUBLIC_SUPABASE_ANON_KEY in the build.';
  }
  // Errors raised on purpose by our SQL functions (errcode P0001) are already readable.
  if (err.code === 'P0001' && err.message) return err.message;
  return `Cloud request failed (${status})${err.message ? `: ${err.message.slice(0, 160)}` : body ? `: ${body.slice(0, 160)}` : ''}`;
}
