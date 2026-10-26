import { expandExtra, foldUnknown, hasAdoptableExtra, isPlausibleTable, replacesHeld } from '../sync/forward';
import { base } from './fixtures';

const COLS = ['id', 'updatedAt', 'amount', 'extra'];

describe('forward compatibility', () => {
  it('keeps fields from a newer version and sends them on unchanged', () => {
    const incoming = { id: 'a', updatedAt: 't1', amount: 100, holdingId: 'h1', grams: 10500 };
    const stored = foldUnknown(incoming, COLS);
    expect(stored).toEqual({ id: 'a', updatedAt: 't1', amount: 100, extra: JSON.stringify({ holdingId: 'h1', grams: 10500 }) });
    // Edited here (amount changed, extra carried along), then sent to another phone.
    expect(expandExtra({ ...stored, amount: 150 })).toEqual({ id: 'a', updatedAt: 't1', amount: 150, holdingId: 'h1', grams: 10500 });
  });

  it('stores no extra when every field is known, and a received row replaces the old extra', () => {
    expect(foldUnknown<Record<string, unknown>>({ id: 'a', updatedAt: 't', amount: 1 }, COLS).extra).toBeNull();
    // A received row is complete: an extra field it no longer has is gone, not resurrected.
    expect(foldUnknown({ id: 'a', updatedAt: 't', amount: 1, extra: '{"old":1}' }, COLS).extra).toBeNull();
  });

  it('lets known columns win over extra, and survives damaged extra', () => {
    expect(expandExtra({ id: 'a', amount: 2, extra: '{"amount":1,"x":3}' })).toEqual({ id: 'a', amount: 2, x: 3 });
    expect(expandExtra({ id: 'a', extra: 'not json' })).toEqual({ id: 'a' });
    expect(expandExtra({ id: 'a', extra: null })).toEqual({ id: 'a' });
  });

  it('notices extra fields that a newer schema now has columns for', () => {
    expect(hasAdoptableExtra({ extra: '{"grams":1}' }, [...COLS, 'grams'])).toBe(true);
    expect(hasAdoptableExtra({ extra: '{"grams":1}' }, COLS)).toBe(false);
    expect(hasAdoptableExtra({ extra: null }, COLS)).toBe(false);
  });

  it('accepts new table names but not damage', () => {
    expect(isPlausibleTable('holdings')).toBe(true);
    expect(isPlausibleTable('investment_trades')).toBe(true);
    expect(isPlausibleTable('x"; DROP TABLE')).toBe(false);
    expect(isPlausibleTable(undefined)).toBe(false);
  });

  it('keeps the latest version of a held record', () => {
    const older = { ...base(), id: 'r', updatedAt: '2026-01-02T00:00:00Z' };
    const newer = { ...older, updatedAt: '2026-01-03T00:00:00Z' };
    expect(replacesHeld(undefined, older, false)).toBe(true);
    expect(replacesHeld(newer, older, false)).toBe(false);
    expect(replacesHeld(older, newer, false)).toBe(true);
    // From the cloud the later record is the newer version, even with an older clock.
    expect(replacesHeld(newer, older, true)).toBe(true);
  });
});
