import { DecryptError, newKey, seal } from '../sync/crypto';
import { backupSpace, householdSpace, openRecord, planRecord, recordKey, sealRecord } from '../sync/records';
import { txn } from './fixtures';

describe('household space', () => {
  const key = newKey();

  it('derives stable, distinct ids that reveal nothing of the key', () => {
    const s = householdSpace(key, 'house-1');
    expect(s.id).toMatch(/^[0-9a-f]{64}$/);
    expect(s.token).toMatch(/^[0-9a-f]{64}$/);
    expect(s.id).not.toBe(s.token);
    expect(householdSpace(key, 'house-1').id).toBe(s.id);
    expect(householdSpace(key, 'house-2').id).not.toBe(s.id);
    expect(householdSpace(newKey(), 'house-1').id).not.toBe(s.id);
    const hex = Array.from(key, (b) => b.toString(16).padStart(2, '0')).join('');
    expect([s.id, s.token]).not.toContain(hex);
  });

  it('hides the record type and id behind the key', () => {
    const s = householdSpace(key, 'house-1');
    const k = recordKey(s, 'transactions', 'abc');
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(k).not.toBe(recordKey(s, 'loans', 'abc'));
    expect(k).not.toContain('abc');
  });
});

describe('sealed records', () => {
  const s = householdSpace(newKey(), 'house-1');
  const row = txn({ id: 'r1', payee: 'Big Bazaar' });

  it('round-trips and hides the content', () => {
    const p = sealRecord(s, 'transactions', row);
    expect(p).not.toContain('Big Bazaar');
    expect(openRecord(s, recordKey(s, 'transactions', 'r1'), p)).toEqual({ t: 'transactions', r: row });
  });

  it('refuses a payload moved to another record or household', () => {
    const p = sealRecord(s, 'transactions', row);
    expect(() => openRecord(s, recordKey(s, 'transactions', 'other'), p)).toThrow(DecryptError);
    const other = householdSpace(newKey(), 'house-1');
    expect(() => openRecord(other, recordKey(other, 'transactions', 'r1'), p)).toThrow(DecryptError);
  });

  it('refuses a payload whose content names a different record than its key', () => {
    // Sealed for key K but claiming to be another row: only someone with the household key could
    // make this, but the check keeps one record from overwriting another.
    const k = recordKey(s, 'transactions', 'r1');
    const forged = seal({ t: 'transactions', r: txn({ id: 'r2' }) }, s.key, `emx-rec-v1:${s.id}:${k}`);
    expect(() => openRecord(s, k, forged)).toThrow('does not match');
  });
});

describe('planRecord', () => {
  const local = txn({ id: 'a', amount: 100, updatedAt: '2026-01-02T00:00:00.000Z', deviceId: 'me' });
  const theirs = txn({ id: 'a', amount: 200, updatedAt: '2026-01-01T00:00:00.000Z', deviceId: 'you' });

  it('inserts unknown records and ignores identical ones', () => {
    expect(planRecord(undefined, theirs, false, 'ask').kind).toBe('insert');
    expect(planRecord(local, { ...local, updatedAt: '2030-01-01T00:00:00.000Z' }, true, 'ask').kind).toBe('same');
  });

  it('takes the server version when this phone did not edit, even if its clock says older', () => {
    expect(planRecord(local, theirs, false, 'newest')).toEqual({ kind: 'update', autoResolved: false });
  });

  it('treats edits on both sides as a conflict and applies the policy', () => {
    expect(planRecord(local, theirs, true, 'ask').kind).toBe('conflict');
    expect(planRecord(local, theirs, true, 'incoming')).toEqual({ kind: 'update', autoResolved: true });
    expect(planRecord(local, theirs, true, 'newest').kind).toBe('keep');
    expect(planRecord(theirs, local, true, 'newest')).toEqual({ kind: 'update', autoResolved: true });
  });
});

describe('backup space', () => {
  it('is separate from the household space and from other backups', () => {
    const k = newKey();
    expect(backupSpace(k, 'v1').id).not.toBe(householdSpace(k, 'v1').id);
    expect(backupSpace(k, 'v1').id).not.toBe(backupSpace(k, 'v2').id);
    expect(backupSpace(k, 'v1').id).toBe(backupSpace(k, 'v1').id);
  });
});
