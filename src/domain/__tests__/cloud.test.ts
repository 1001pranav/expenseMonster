import { FULL_PUSH_DAYS, describeRpcError, fullPushDue, mailboxId } from '../sync/cloud';
import { newKey } from '../sync/crypto';

describe('cloud mailbox', () => {
  const key = newKey();

  it('is a stable 64-char hex id for the same key and household', () => {
    const id = mailboxId(key, 'house-1');
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(mailboxId(key, 'house-1')).toBe(id);
  });

  it('differs per household and per key', () => {
    const id = mailboxId(key, 'house-1');
    expect(mailboxId(key, 'house-2')).not.toBe(id);
    expect(mailboxId(newKey(), 'house-1')).not.toBe(id);
  });

  it('does not contain the key', () => {
    const hex = Array.from(key, (b) => b.toString(16).padStart(2, '0')).join('');
    expect(mailboxId(key, 'house-1')).not.toBe(hex);
  });
});

describe('fullPushDue', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  it('is due when never done or too old', () => {
    expect(fullPushDue(null, now)).toBe(true);
    expect(fullPushDue(new Date(now.getTime() - (FULL_PUSH_DAYS + 1) * 86_400_000).toISOString(), now)).toBe(true);
  });
  it('is not due when recent', () => {
    expect(fullPushDue(new Date(now.getTime() - 86_400_000).toISOString(), now)).toBe(false);
  });
});

describe('describeRpcError', () => {
  it('points at the missing migration when the function does not exist', () => {
    const body = JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.emx_vault_put(...) in the schema cache' });
    expect(describeRpcError('emx_vault_put', 404, body)).toContain('20261008000000_emx_vault.sql');
    expect(describeRpcError('emx_push', 404, body)).toContain('20261002000000_emx_cloud_sync.sql');
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
