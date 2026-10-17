/** Resolves mission places (landmark ids or MISSIONS.places) to positions on the road. */
import type { City } from '../city/cityData';
import { LANDMARKS, project } from '../city/geo';
import { MISSIONS } from '../config';
import { groundAt } from './ground';
import type { PlaceRef } from './types';

export interface Spot {
  x: number;
  y: number;
  z: number;
  /** Road direction at the spot (radians, 0 faces +z, like the car's heading). */
  heading: number;
  label: string;
}

const LABELS: Record<string, string> = {
  airstrip: 'The Embarcadero airstrip',
  hideout: 'Russian Hill garage',
  hideout2: 'Telegraph Hill warehouse',
  bank: 'Pyramid bank',
};

const cache = new Map<string, Spot>();

/** Road tangent at a point on an edge's polyline. */
function tangentAt(city: City, edge: number, x: number, z: number): number {
  const pts = city.graph.edges[edge]!.pts;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const mx = (pts[i]! + pts[i + 2]!) / 2;
    const mz = (pts[i + 1]! + pts[i + 3]!) / 2;
    const d = (mx - x) ** 2 + (mz - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return Math.atan2(pts[best + 2]! - pts[best]!, pts[best + 3]! - pts[best + 1]!);
}

export function resolvePlace(city: City, ref: PlaceRef): Spot {
  const hit = cache.get(ref);
  if (hit) {
    // Refine the height as the physics world streams in (piers and decks).
    hit.y = groundAt(city, hit.x, hit.z);
    return hit;
  }
  let x: number;
  let z: number;
  let label: string;
  const lm = LANDMARKS.find((l) => l.id === ref);
  const custom = MISSIONS.places[ref];
  if (lm) {
    ({ x, z } = lm);
    label = lm.name;
  } else if (custom) {
    [x, z] = project(custom[0], custom[1]);
    label = LABELS[ref] ?? ref;
  } else {
    throw new Error(`Unknown mission place: ${ref}`);
  }
  let heading = 0;
  // The plane needs a real street (piers' service roads are unnamed and short).
  const road = city.graph.nearest(x, z, MISSIONS.snapRange, ref === 'airstrip');
  if (road) {
    x = road.x;
    z = road.z;
    heading = tangentAt(city, road.edge, x, z);
  }
  const spot = { x, y: groundAt(city, x, z), z, heading, label };
  cache.set(ref, spot);
  return spot;
}

/**
 * Of the two road directions at a spot, the one that stays on the road longest when driving
 * straight — the plane's take-off run.
 */
export function longestStraight(city: City, spot: Spot): number {
  let best = spot.heading;
  let bestRun = -1;
  for (const h of [spot.heading, spot.heading + Math.PI]) {
    let run = 0;
    for (let d = 10; d <= 320; d += 10) {
      const x = spot.x + Math.sin(h) * d;
      const z = spot.z + Math.cos(h) * d;
      if (!city.graph.nearest(x, z, 10)) break;
      run = d;
    }
    if (run > bestRun) {
      bestRun = run;
      best = h;
    }
  }
  return best;
}
