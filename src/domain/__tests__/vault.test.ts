import { buildBundle } from '../sync/bundle';
import { DecryptError, keyFromPassphrase, newKey, seal, toBase64 } from '../sync/crypto';
import { formatRecoveryCode, householdFingerprint, newSalt, newVaultId, newWriteToken, openVault, parseRecoveryCode, saltBytes, sealVault } from '../sync/vault';
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

describe('vault header', () => {
  const household = { id: 'h', name: 'Home', key: 'a2V5', selfMemberId: 'm1', cloudSync: true };

  it('opens only with the password-derived key and only for its own vault', async () => {
    const salt = newSalt();
    const key = await keyFromPassphrase('correct horse battery', saltBytes(salt), 1000);
    const id = newVaultId();
    const header = { v: 2 as const, token: newWriteToken(), dataKey: toBase64(newKey()), household };
    const payload = sealVault(header, key, id);
    expect(payload).not.toContain('a2V5');
    expect(payload).not.toContain(header.dataKey);
    expect(openVault(payload, key, id)).toEqual(header);

    const wrong = await keyFromPassphrase('correct horse battery!', saltBytes(salt), 1000);
    expect(() => openVault(payload, wrong, id)).toThrow(DecryptError);
    expect(() => openVault(payload, key, newVaultId())).toThrow(DecryptError);
  });

  it('still opens a backup made before records, so it can be upgraded', async () => {
    const key = await keyFromPassphrase('correct horse battery', saltBytes(newSalt()), 1000);
    const id = newVaultId();
    const bundle = buildBundle({ transactions: [txn({ id: 'a', scope: 'personal' })] }, { householdId: 'h', deviceId: 'd', deviceName: 'Phone', since: null, kind: 'backup' });
    const legacy = { v: 1, token: newWriteToken(), bundle };
    const payload = seal(legacy, key, `emx-vault-v1:${id}`);
    const opened = openVault(payload, key, id);
    expect(opened.v).toBe(1);
    expect(opened.v === 1 && opened.bundle.tables.transactions).toHaveLength(1);
  });

  it('fingerprints the household so the header is rewritten only when it changes', () => {
    expect(householdFingerprint(household)).toBe(householdFingerprint({ ...household }));
    expect(householdFingerprint({ ...household, cloudSync: false })).not.toBe(householdFingerprint(household));
    expect(householdFingerprint(undefined)).not.toBe(householdFingerprint(household));
  });
});
