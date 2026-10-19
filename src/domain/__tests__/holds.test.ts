import { acceptsControl, dayRange, ruleFor, screenIncoming } from '../sync/holds';
import { invalidReason } from '../sync/validate';
import type { HouseholdInfo, SyncHold } from '../types';
import { base, txn } from './fixtures';

const hold = (over: Partial<SyncHold>): SyncHold => ({ ...base({ deviceId: 'HEAD' }), holdDevice: null, since: null, until: null, tbl: null, recordId: null, decision: 'hold', note: null, ...over });
const COLUMNS = { id: 'TEXT PRIMARY KEY NOT NULL', updatedAt: 'TEXT NOT NULL', scope: "TEXT NOT NULL DEFAULT 'personal'", type: 'TEXT NOT NULL', amount: 'INTEGER NOT NULL DEFAULT 0', confidence: 'REAL', note: 'TEXT' };

describe('validating rows from other phones', () => {
  const ok = txn({});
  it('accepts a normal row, and a column the sender did not have yet', () => {
    expect(invalidReason('transactions', ok as never, COLUMNS)).toBeNull();
    const { confidence: _, ...older } = ok;
    expect(invalidReason('transactions', older as never, COLUMNS)).toBeNull();
  });
  it('rejects wrong types, missing required values and unknown kinds', () => {
    expect(invalidReason('transactions', { ...ok, amount: '100' } as never, COLUMNS)).toBe('amount is not a whole number');
    expect(invalidReason('transactions', { ...ok, amount: 1.5 } as never, COLUMNS)).toBe('amount is not a whole number');
    expect(invalidReason('transactions', { ...ok, type: null } as never, COLUMNS)).toBe('type is missing');
    expect(invalidReason('transactions', { ...ok, type: 'refund' } as never, COLUMNS)).toBe('type "refund" is unknown');
    expect(invalidReason('transactions', { ...ok, confidence: Infinity } as never, COLUMNS)).toBe('confidence is not a number');
    expect(invalidReason('transactions', { ...ok, updatedAt: 'yesterday' } as never, COLUMNS)).toBe('updatedAt is not a date');
    expect(invalidReason('transactions', { ...ok, scope: 'everyone' } as never, COLUMNS)).toBe('scope is unknown');
  });
});

describe('household head rules', () => {
  const row = txn({ id: 't1', deviceId: 'B', updatedAt: '2026-10-12T08:00:00.000Z' });

  it('lets the most specific rule decide', () => {
    const phone = hold({ holdDevice: 'B' });
    const oct12 = { since: '2026-10-11T18:30:00.000Z', until: '2026-10-12T18:30:00.000Z' }; // 12 Oct in India
    const day = hold({ holdDevice: 'B', ...oct12, decision: 'discard' });
    const entry = hold({ tbl: 'transactions', recordId: 't1', decision: 'merge' });
    expect(ruleFor('transactions', row, [phone])).toBe(phone);
    expect(ruleFor('transactions', row, [phone, day])).toBe(day);
    expect(ruleFor('transactions', row, [phone, day, entry])).toBe(entry);
    expect(ruleFor('transactions', { ...row, updatedAt: '2026-10-12T19:00:00.000Z' }, [day])).toBeUndefined(); // 13 Oct, 00:30 IST
    expect(ruleFor('transactions', { ...row, updatedAt: '2026-10-11T20:00:00.000Z' }, [day])).toBe(day); // 12 Oct, 01:30 IST
    expect(ruleFor('transactions', row, [hold(oct12)])?.since).toBe(oct12.since); // any phone that day
    expect(ruleFor('transactions', row, [{ ...phone, deletedAt: 'x' }])).toBeUndefined();
    expect(ruleFor('household', row, [phone])).toBeUndefined(); // the household itself is never held
    expect(ruleFor('transactions', { ...row, scope: 'personal' }, [phone])).toBeUndefined(); // nor private entries
  });

  it('turns a local day into the UTC range of its midnights', () => {
    const { since, until } = dayRange('2026-10-12');
    expect(new Date(since).getDate()).toBe(12);
    expect(new Date(since).getHours()).toBe(0);
    expect(Date.parse(until) - Date.parse(since)).toBe(86_400_000);
  });

  it('follows only the head; anyone may claim a free role, and the earlier of two claims wins', () => {
    const claim = (by: string, at: string) => ({ ...base({ deviceId: by, createdAt: at, updatedAt: at }), id: 'household', headDeviceId: by }) as HouseholdInfo;
    const headA = claim('A', '2026-10-01T00:00:00.000Z');
    expect(acceptsControl('household', headA, undefined)).toBe(true);
    expect(acceptsControl('sync_holds', hold({ deviceId: 'A' }), headA)).toBe(true);
    expect(acceptsControl('sync_holds', hold({ deviceId: 'C' }), headA)).toBe(false);
    expect(acceptsControl('sync_holds', hold({ deviceId: 'A' }), undefined)).toBe(false);
    // Two claims made before the phones heard of each other: every phone keeps the earlier one.
    const laterB = claim('B', '2026-10-02T00:00:00.000Z');
    expect(acceptsControl('household', laterB, headA)).toBe(false);
    expect(acceptsControl('household', headA, laterB)).toBe(true);
    // Once settled (edited), only the head can change it.
    const handedOver = { ...headA, headDeviceId: 'C', updatedAt: '2026-10-05T00:00:00.000Z' };
    expect(acceptsControl('household', { ...laterB, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }, handedOver)).toBe(false);
    // A phone publishes only its own device record.
    expect(acceptsControl('devices', { ...base({ deviceId: 'B' }), id: 'B' }, headA)).toBe(true);
    expect(acceptsControl('devices', { ...base({ deviceId: 'B' }), id: 'A' }, headA)).toBe(false);
  });

  it("screens a row: malformed first, then the head's rules", () => {
    const ctx = { household: undefined, holds: [hold({ holdDevice: 'B' })], invalid: (_t: string, r: object) => (typeof (r as { amount?: unknown }).amount === 'number' ? null : 'bad') };
    expect(screenIncoming('transactions', row, ctx)).toEqual({ kind: 'aside', reason: 'held' });
    expect(screenIncoming('transactions', { ...row, deviceId: 'C' }, ctx)).toEqual({ kind: 'apply' });
    expect(screenIncoming('transactions', { ...row, deviceId: 'C', amount: 'x' } as never, ctx)).toEqual({ kind: 'aside', reason: 'invalid' });
  });
});
