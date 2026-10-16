import { TRAFFIC_SIGNALS as T } from '../config';

export type SignalPhase = 'A' | 'B';
export type SignalColor = 'red' | 'yellow' | 'green';

const CYCLE = T.greenA + T.yellowA + T.allRedA + T.greenB + T.yellowB + T.allRedB;

/**
 * Signal color for a phase at a given time (seconds). Pure function of time, so the
 * renderer, AI traffic and (later) multiplayer clients all agree without syncing state.
 */
export function signalColor(phase: SignalPhase, time: number): SignalColor {
  const t = ((time % CYCLE) + CYCLE) % CYCLE;
  const aGreenEnd = T.greenA;
  const aYellowEnd = aGreenEnd + T.yellowA;
  const bStart = aYellowEnd + T.allRedA;
  const bGreenEnd = bStart + T.greenB;
  const bYellowEnd = bGreenEnd + T.yellowB;
  if (phase === 'A') {
    if (t < aGreenEnd) return 'green';
    if (t < aYellowEnd) return 'yellow';
    return 'red';
  }
  if (t >= bStart && t < bGreenEnd) return 'green';
  if (t >= bGreenEnd && t < bYellowEnd) return 'yellow';
  return 'red';
}
