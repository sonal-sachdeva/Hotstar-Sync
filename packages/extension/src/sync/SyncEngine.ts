import type { RoomState } from './types';

export const DRIFT_IGNORE = 0.25;    // seconds — below this, do nothing
export const DRIFT_NUDGE_MAX = 1.0;  // seconds — below this, nudge; above, hard-seek
export const NUDGE_RATE = 0.05;      // ±5% speed tweak

export type Correction =
  | { kind: 'none' }
  | { kind: 'nudge'; rate: number }
  | { kind: 'seek'; time: number };

/** Where the room SHOULD be right now, from the authoritative anchor. */
export function expectedPosition(state: RoomState, serverNowMs: number): number {
  if (!state.playing) return state.positionAtEpoch;      // paused: frozen
  const elapsedSec = (serverNowMs - state.anchorServerTime) / 1000;
  return state.positionAtEpoch + elapsedSec * state.rate;
}

/** Given the room and our own player time, decide how to correct. */
export function decideCorrection(
  state: RoomState,
  localTime: number,
  serverNowMs: number,
): Correction {
  const target = expectedPosition(state, serverNowMs);
  const drift = target - localTime;   // + = we're behind, - = we're ahead
  const mag = Math.abs(drift);

  if (mag < DRIFT_IGNORE) return { kind: 'none' };
  if (mag < DRIFT_NUDGE_MAX) {
    const rate = state.rate * (drift > 0 ? 1 + NUDGE_RATE : 1 - NUDGE_RATE);
    return { kind: 'nudge', rate };   // behind → speed up; ahead → slow down
  }
  return { kind: 'seek', time: target };
}

/** NTP-lite: estimate (serverClock − localClock) offset, in ms. */
export function estimateOffset(t0: number, serverT1: number, t2: number): number {
  return serverT1 - (t0 + t2) / 2;
}