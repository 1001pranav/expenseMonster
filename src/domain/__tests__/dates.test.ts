import { addMonths, clampedDate, parseLooseDate, parseTime, relativeDay } from '../dates';

describe('dates', () => {
  it('clamps day 31 in short months and keeps anchor', () => {
    expect(clampedDate(2026, 2, 31)).toBe('2026-02-28');
    expect(clampedDate(2028, 2, 31)).toBe('2028-02-29');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('parses Indian SMS / app date formats', () => {
    const ref = '2026-09-20';
    expect(parseLooseDate('12-09-2026', ref)).toBe('2026-09-12');
    expect(parseLooseDate('12/09/26', ref)).toBe('2026-09-12');
    expect(parseLooseDate('12-Sep-26', ref)).toBe('2026-09-12');
    expect(parseLooseDate('12Sep26', ref)).toBe('2026-09-12');
    expect(parseLooseDate('12 Sep 2026, 10:32 pm', ref)).toBe('2026-09-12');
    expect(parseLooseDate('Sep 12, 2026', ref)).toBe('2026-09-12');
    expect(parseLooseDate('2026-09-12:10:32:45', ref)).toBe('2026-09-12');
    expect(parseLooseDate('15-Oct', ref)).toBe('2026-10-15');
    expect(parseLooseDate('31-02-2026', ref)).toBeNull();
  });

  it('parses times', () => {
    expect(parseTime('10:32 pm')).toBe(22 * 60 + 32);
    expect(parseTime('12:05 AM')).toBe(5);
    expect(parseTime('09:15')).toBe(9 * 60 + 15);
  });

  it('describes relative days', () => {
    expect(relativeDay('2026-09-20', '2026-09-20')).toBe('Today');
    expect(relativeDay('2026-09-21', '2026-09-20')).toBe('Tomorrow');
    expect(relativeDay('2026-09-25', '2026-09-20')).toBe('in 5 days');
    expect(relativeDay('2026-09-17', '2026-09-20')).toBe('3 days ago');
  });
});
