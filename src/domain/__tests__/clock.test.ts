import { offsetFromResponse, resetClockForTests, setClockOffset, syncedNowMs, worthUpdating } from '../clock';

describe('sync clock', () => {
  beforeEach(resetClockForTests);

  it('measures how far the phone is behind or ahead of the server', () => {
    // Phone 10 min behind: sent at 1000, received at 1200, server said 600 s later.
    const header = new Date(1100 + 600_000 - 500).toUTCString();
    const off = offsetFromResponse(1000, 1200, header)!;
    expect(Math.abs(off - 600_000)).toBeLessThan(1000);
    expect(offsetFromResponse(1000, 1200, null)).toBeNull();
    expect(offsetFromResponse(1000, 1200, 'garbage')).toBeNull();
  });

  it('stamps with the correction applied', () => {
    setClockOffset(-600_000); // phone 10 min fast
    expect(syncedNowMs(1_000_000)).toBe(400_000);
  });

  it('never goes backwards when the correction shrinks', () => {
    const before = syncedNowMs(1_000_000);
    setClockOffset(-600_000);
    const after = syncedNowMs(1_000_100);
    expect(after).toBeGreaterThan(before);
    expect(syncedNowMs(1_000_100)).toBeGreaterThan(after);
  });

  it('ignores corrections within the header resolution', () => {
    expect(worthUpdating(1500, 0)).toBe(false);
    expect(worthUpdating(-2500, 0)).toBe(true);
  });
});
