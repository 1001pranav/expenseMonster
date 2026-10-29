import { monthGrid, pickDate, pickedRange } from '../datePick';

describe('picking dates on one calendar', () => {
  it('one tap is a day; the same day again keeps it a day', () => {
    const one = pickDate(null, '2026-10-12');
    expect(one).toEqual({ start: '2026-10-12', end: null });
    expect(pickedRange(one)).toEqual({ from: '2026-10-12', to: '2026-10-12' });
    const same = pickDate(one, '2026-10-12');
    expect(same).toEqual({ start: '2026-10-12', end: '2026-10-12' });
    expect(pickedRange(same)).toEqual({ from: '2026-10-12', to: '2026-10-12' });
  });

  it('a second, different day makes a range in either order', () => {
    expect(pickDate({ start: '2026-10-12', end: null }, '2026-10-20')).toEqual({ start: '2026-10-12', end: '2026-10-20' });
    expect(pickDate({ start: '2026-10-12', end: null }, '2026-09-30')).toEqual({ start: '2026-09-30', end: '2026-10-12' });
  });

  it('a tap after a finished pick starts over', () => {
    expect(pickDate({ start: '2026-10-12', end: '2026-10-20' }, '2026-10-05')).toEqual({ start: '2026-10-05', end: null });
    expect(pickDate({ start: '2026-10-12', end: '2026-10-12' }, '2026-10-05')).toEqual({ start: '2026-10-05', end: null });
  });

  it('lays a month out in Sunday-first weeks', () => {
    // 1 October 2026 is a Thursday.
    const weeks = monthGrid('2026-10');
    expect(weeks[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(weeks.at(-1)).toEqual(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
    expect(weeks).toHaveLength(5);
    // February 2026 starts on a Sunday and fills exactly four weeks.
    expect(monthGrid('2026-02')).toHaveLength(4);
    expect(monthGrid('2026-02')[0][0]).toBe('2026-02-01');
  });
});
