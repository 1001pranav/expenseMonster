import { holdSync, isSyncHeld, releaseSync, whenSyncReleased } from '../syncHold';

describe('sync hold', () => {
  afterEach(() => releaseSync());

  it('runs immediately when nothing holds sync', () => {
    const fn = jest.fn();
    whenSyncReleased(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('defers work while a screenshot is being handled and runs it once on release', () => {
    const fn = jest.fn();
    holdSync();
    whenSyncReleased(fn);
    expect(isSyncHeld()).toBe(true);
    expect(fn).not.toHaveBeenCalled();
    releaseSync();
    expect(fn).toHaveBeenCalledTimes(1);
    releaseSync();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('never stays held forever', () => {
    jest.useFakeTimers();
    holdSync();
    jest.advanceTimersByTime(15 * 60_000);
    expect(isSyncHeld()).toBe(false);
    jest.useRealTimers();
  });
});
