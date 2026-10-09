import { describeRpcError } from '../sync/cloud';

describe('describeRpcError', () => {
  it('points at the missing migration when the function does not exist', () => {
    const body = JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.emx_vault_put(...) in the schema cache' });
    expect(describeRpcError('emx_vault_put', 404, body)).toContain('20261008000000_emx_vault.sql');
    expect(describeRpcError('emx_records_push', 404, body)).toContain('20261010000000_emx_records.sql');
  });

  it('explains a rejected API key', () => {
    expect(describeRpcError('emx_pull', 401, JSON.stringify({ message: 'Invalid API key' }))).toContain('API key');
  });

  it('passes through messages raised by our SQL functions', () => {
    expect(describeRpcError('emx_vault_put', 400, JSON.stringify({ code: 'P0001', message: 'Not allowed' }))).toBe('Not allowed');
  });

  it('falls back to status and body for anything else', () => {
    expect(describeRpcError('emx_pull', 502, '<html>Bad gateway</html>')).toBe('Cloud request failed (502): <html>Bad gateway</html>');
  });
});
