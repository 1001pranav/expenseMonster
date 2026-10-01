import { buildBundle, decodePair, encodePair, validateBundle } from '../sync/bundle';
import { DecryptError, fingerprint, fromBase64, newKey, open, seal, toBase64 } from '../sync/crypto';
import { planMerge } from '../sync/merge';
import { base, txn } from './fixtures';

describe('sync crypto', () => {
  const key = newKey();

  it('round-trips base64', () => {
    for (const len of [0, 1, 2, 3, 31, 32, 100]) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37) & 255);
      expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
    }
  });

  it('seals and opens a bundle', () => {
    const env = seal({ hello: 'world', n: [1, 2, 3] }, key, 'house-1');
    expect(env.startsWith('EMX1.')).toBe(true);
    expect(env).not.toContain('world');
    expect(open(env, key, 'house-1')).toEqual({ hello: 'world', n: [1, 2, 3] });
  });

  it('rejects wrong household, wrong key and tampering', () => {
    const env = seal({ a: 1 }, key, 'house-1');
    expect(() => open(env, key, 'house-2')).toThrow(DecryptError);
    expect(() => open(env, newKey(), 'house-1')).toThrow(DecryptError);
    const bytes = fromBase64(env.slice(5));
    bytes[20] ^= 1;
    expect(() => open(`EMX1.${toBase64(bytes)}`, key, 'house-1')).toThrow(DecryptError);
    expect(() => open('hello', key, 'house-1')).toThrow('Not an ExpenseMonster file');
  });

  it('pairs via QR payload', () => {
    const qr = encodePair({ householdId: 'h1', householdName: 'Home', deviceId: 'd1', deviceName: 'Pixel' }, key);
    const { payload, key: k } = decodePair(qr);
    expect(payload.householdId).toBe('h1');
    expect(fingerprint(k)).toBe(fingerprint(key));
    expect(() => decodePair('{"t":"other"}')).toThrow();
  });
});

describe('bundle + merge', () => {
  it('only exports household rows changed since last send', () => {
    const rows = {
      transactions: [
        txn({ id: 't1', scope: 'household', updatedAt: '2026-09-02T00:00:00Z' }),
        txn({ id: 't2', scope: 'personal', updatedAt: '2026-09-02T00:00:00Z' }),
        txn({ id: 't3', scope: 'household', updatedAt: '2026-08-01T00:00:00Z' }),
      ],
    };
    const b = buildBundle(rows, { householdId: 'h', deviceId: 'd', deviceName: 'A', since: '2026-09-01T00:00:00Z' });
    expect(b.tables.transactions!.map((r) => r.id)).toEqual(['t1']);
    const backup = buildBundle(rows, { householdId: 'h', deviceId: 'd', deviceName: 'A', since: null, kind: 'backup' });
    expect(backup.tables.transactions).toHaveLength(3);
    expect(validateBundle(JSON.parse(JSON.stringify(b)))).toBeTruthy();
    expect(() => validateBundle({ v: 1, householdId: 'h', tables: { evil: [] } })).toThrow();
  });

  it('applies last-write-wins with tombstones and is idempotent', () => {
    const local = new Map([
      ['a', base({ id: 'a', updatedAt: '2026-09-01T00:00:00Z', deviceId: 'me' })],
      ['b', base({ id: 'b', updatedAt: '2026-09-05T00:00:00Z', deviceId: 'me' })],
    ]);
    const incoming = [
      base({ id: 'a', updatedAt: '2026-09-03T00:00:00Z', deviceId: 'peer', deletedAt: '2026-09-03T00:00:00Z' }),
      base({ id: 'b', updatedAt: '2026-09-04T00:00:00Z', deviceId: 'peer' }),
      base({ id: 'c', updatedAt: '2026-09-04T00:00:00Z', deviceId: 'peer' }),
    ];
    const plan = planMerge(local, incoming, '2026-09-02T00:00:00Z');
    expect(plan.inserts.map((r) => r.id)).toEqual(['c']);
    expect(plan.updates.map((r) => r.id)).toEqual(['a']);
    expect(plan.updates[0].deletedAt).not.toBeNull();
    expect(plan.skipped).toBe(1);
    expect(plan.conflicts).toBe(1); // b edited on both phones since last sync; newer local kept

    for (const r of [...plan.inserts, ...plan.updates]) local.set(r.id, r);
    const again = planMerge(local, incoming, '2026-09-02T00:00:00Z');
    expect(again.inserts).toHaveLength(0);
    expect(again.updates).toHaveLength(0);
  });

  it('breaks timestamp ties deterministically by device id', () => {
    const local = new Map([['x', base({ id: 'x', updatedAt: '2026-09-01T00:00:00Z', deviceId: 'aaa' })]]);
    const plan = planMerge(local, [base({ id: 'x', updatedAt: '2026-09-01T00:00:00Z', deviceId: 'bbb' })], null);
    expect(plan.updates).toHaveLength(1);
  });
});
