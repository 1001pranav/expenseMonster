import { buildBundle } from '../sync/bundle';
import { DecryptError, keyFromPassphrase } from '../sync/crypto';
import { contentDigest, formatRecoveryCode, newSalt, newVaultId, newWriteToken, openVault, parseRecoveryCode, saltBytes, sealVault } from '../sync/vault';
import { txn } from './fixtures';

describe('recovery code', () => {
  it('round-trips a vault id', () => {
    for (let i = 0; i < 50; i++) {
      const id = newVaultId();
      expect(id).toMatch(/^[0-9a-f]{30}$/);
      const code = formatRecoveryCode(id);
      expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(parseRecoveryCode(code)).toBe(id);
    }
  });

  it('forgives case, spacing and look-alike letters', () => {
    const id = 'ff00ff00ff00ff00ff00ff00ff0011';
    const code = formatRecoveryCode(id);
    const typed = ` ${code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l')} `;
    expect(parseRecoveryCode(typed)).toBe(id);
  });

  it('rejects codes of the wrong length or alphabet', () => {
    expect(parseRecoveryCode('')).toBeNull();
    expect(parseRecoveryCode('ABCD-EFGH')).toBeNull();
    expect(parseRecoveryCode('UUUU-UUUU-UUUU-UUUU-UUUU-UUUU')).toBeNull();
  });
});

describe('vault envelope', () => {
  const bundle = buildBundle({ transactions: [txn({ id: 'a', scope: 'personal' })] }, { householdId: 'h', deviceId: 'd', deviceName: 'Phone', since: null, kind: 'backup' });

  it('opens only with the password-derived key and only for its own vault', async () => {
    const salt = newSalt();
    const key = await keyFromPassphrase('correct horse battery', saltBytes(salt), 1000);
    const id = newVaultId();
    const token = newWriteToken();
    const payload = sealVault({ v: 1, token, bundle }, key, id);
    expect(payload).not.toContain('Phone');
    expect(openVault(payload, key, id)).toEqual({ v: 1, token, bundle });

    const wrong = await keyFromPassphrase('correct horse battery!', saltBytes(salt), 1000);
    expect(() => openVault(payload, wrong, id)).toThrow(DecryptError);
    expect(() => openVault(payload, key, newVaultId())).toThrow(DecryptError);
  });

  it('keeps private rows (a backup, not a household delta)', () => {
    expect(bundle.tables.transactions).toHaveLength(1);
  });
});

describe('contentDigest', () => {
  const a = txn({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' });
  const b = txn({ id: 'b', updatedAt: '2026-01-02T00:00:00.000Z' });

  it('ignores row and key order', () => {
    const reordered = Object.fromEntries(Object.entries(a).reverse()) as typeof a;
    expect(contentDigest({ transactions: [a, b] })).toBe(contentDigest({ transactions: [b, reordered] }));
  });

  it('changes when a row changes or is added', () => {
    const base = contentDigest({ transactions: [a, b] });
    expect(contentDigest({ transactions: [a, { ...b, amount: b.amount + 1 }] })).not.toBe(base);
    expect(contentDigest({ transactions: [a, b, txn({ id: 'c' })] })).not.toBe(base);
    expect(contentDigest({ transactions: [a], categories: [] })).not.toBe(base);
  });
});
