import { newKey } from '../sync/crypto';
import { keyIdOf, newDeviceKeys, openGrant, sealGrant } from '../sync/grant';

describe('key grants', () => {
  const key = newKey();
  const keyId = keyIdOf(key);
  const b = newDeviceKeys();
  const removed = newDeviceKeys();
  const to = { householdId: 'house', recipient: 'B' };
  const sealed = sealGrant(key, b.publicKey, to);

  it('opens only on the phone it was sealed to', () => {
    expect(openGrant(sealed, b, { ...to, keyId })).toEqual(key);
    // The removed phone sees the grant (it can still read the old key's records) but can't open it.
    expect(() => openGrant(sealed, removed, { ...to, keyId })).toThrow();
  });

  it('is bound to its household, recipient and key', () => {
    expect(() => openGrant(sealed, b, { ...to, recipient: 'C', keyId })).toThrow();
    expect(() => openGrant(sealed, b, { ...to, householdId: 'other', keyId })).toThrow();
    expect(() => openGrant(sealed, b, { ...to, keyId: keyIdOf(newKey()) })).toThrow();
    expect(() => openGrant('garbage', b, { ...to, keyId })).toThrow();
  });

  it('names keys without revealing them', () => {
    expect(keyId).toMatch(/^[0-9a-f]{32}$/);
    expect(keyIdOf(key)).toBe(keyId);
    expect(keyIdOf(newKey())).not.toBe(keyId);
  });
});
