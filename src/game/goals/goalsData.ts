/** Goal definitions: photo spots (the landmarks) and time trials between landmarks. */
import { GOALS } from '../config';
import type { City } from '../city/cityData';
import { LANDMARKS, type Landmark } from '../city/geo';
import { pathLength, type Pt2 } from '../city/roadGraph';

export const PHOTO_SPOTS: Landmark[] = LANDMARKS;

export interface TrialDef {
  id: string;
  name: string;
  from: string;
  to: string;
}

export const TRIALS: TrialDef[] = [
  { id: 'wharf-dash', name: 'Wharf Dash', from: 'pier39', to: 'aquatic' },
  { id: 'hill-climb', name: 'Telegraph Hill Climb', from: 'washsq', to: 'coit' },
  { id: 'downtown-run', name: 'Downtown Run', from: 'levis', to: 'pyramid' },
];

export interface Trial extends TrialDef {
  start: Pt2;
  checkpoints: Pt2[];
  length: number;
  medals: { gold: number; silver: number; bronze: number };
}

const landmark = (id: string) => LANDMARKS.find((l) => l.id === id)!;

/** Routes each trial on the road graph and drops checkpoints along it. */
export function buildTrials(city: City): Trial[] {
  return TRIALS.map((t) => {
    const a = landmark(t.from);
    const b = landmark(t.to);
    const route = city.graph.route(a, b);
    const length = pathLength(route);
    const checkpoints: Pt2[] = [];
    let acc = 0;
    for (let i = 1; i < route.length; i++) {
      acc += Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.z - route[i - 1]!.z);
      if (acc >= GOALS.checkpointSpacing || i === route.length - 1) {
        checkpoints.push(route[i]!);
        acc = 0;
      }
    }
    const par = length / GOALS.parSpeed;
    return {
      ...t,
      start: route[0] ?? a,
      checkpoints,
      length,
      medals: { gold: par * 0.85, silver: par, bronze: par * 1.3 },
    };
  });
}

export type Medal = 'gold' | 'silver' | 'bronze' | null;

export function medalFor(t: Trial, time: number): Medal {
  return time <= t.medals.gold
    ? 'gold'
    : time <= t.medals.silver
      ? 'silver'
      : time <= t.medals.bronze
        ? 'bronze'
        : null;
}
