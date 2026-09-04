import { describe, it, expect } from 'vitest';
import { expectedPosition, decideCorrection, estimateOffset, DRIFT_IGNORE } from './SyncEngine';
import type { RoomState } from './types';

const base: RoomState = {
  playing: true, positionAtEpoch: 100, anchorServerTime: 1000, rate: 1, revision: 1,
};

describe('expectedPosition', () => {
  it('is frozen when paused', () => {
    expect(expectedPosition({ ...base, playing: false }, 999999)).toBe(100);
  });
  it('advances by elapsed time when playing', () => {
    // 5s later on the server clock → 5s further in
    expect(expectedPosition(base, 6000)).toBeCloseTo(105);
  });
});

describe('decideCorrection', () => {
  const now = 1000; // no elapsed time → target === positionAtEpoch (100)
  it('ignores tiny drift', () => {
    expect(decideCorrection(base, 100.1, now).kind).toBe('none');
  });
  it('nudges faster when behind', () => {
    const c = decideCorrection(base, 99.5, now); // we're 0.5s behind
    expect(c.kind).toBe('nudge');
    if (c.kind === 'nudge') expect(c.rate).toBeGreaterThan(1);
  });
  it('nudges slower when ahead', () => {
    const c = decideCorrection(base, 100.5, now);
    if (c.kind === 'nudge') expect(c.rate).toBeLessThan(1);
  });
  it('hard-seeks on large drift', () => {
    const c = decideCorrection(base, 90, now); // 10s behind
    expect(c.kind).toBe('seek');
    if (c.kind === 'seek') expect(c.time).toBeCloseTo(100);
  });
});

describe('estimateOffset', () => {
  it('cancels a symmetric round-trip', () => {
    // local sent at 0, arrived back at 200 (200ms RTT); server clock is 5000 at the midpoint
    expect(estimateOffset(0, 5000, 200)).toBe(4900);
  });
});

describe('a drifting follower converges', () => {
  it('reaches the room within the ignore threshold', () => {
    const state: RoomState = { playing: true, positionAtEpoch: 100, anchorServerTime: 0, rate: 1, revision: 1 };
    let local = 90, serverNow = 0, rate = 1;
    for (let step = 0; step < 5; step++) {
      serverNow += 1000;      // one second passes
      local += 1 * rate;      // local playback advances at its current speed
      const c = decideCorrection(state, local, serverNow);
      if (c.kind === 'seek') { local = c.time; rate = state.rate; }
      else if (c.kind === 'nudge') rate = c.rate;
      else rate = state.rate;
    }
    expect(Math.abs(expectedPosition(state, serverNow) - local)).toBeLessThan(DRIFT_IGNORE);
  });
});