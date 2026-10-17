/**
 * Where street furniture goes across the whole city grid. Shared by the renderers (Fixtures,
 * Props, StreetSigns) and the physics colliders, so what you see and what you bump into match.
 */
import * as THREE from 'three';
import { STYLE } from '../config';
import type { SignalPhase } from '../systems/trafficSignals';
import {
  CURB_HEIGHT as Y,
  EXTENT,
  halfWidth,
  INTERSECTIONS,
  ROADS,
  roadsAlong,
  type Intersection,
  type Road,
} from './cityPlan';
import { placement } from './instancing';

/** Rotation about Y that points local +x along a ground direction. */
export const yawFor = (dx: number, dz: number) => Math.atan2(-dz, dx);

export type PropName = 'hydrant' | 'trashCan' | 'bench' | 'utilityBox' | 'manhole' | 'tree';

/** World position for a point in road space (u along the road, v across it). */
function roadPoint(r: Road, u: number, v: number): [number, number] {
  return r.axis === 'x' ? [u, r.coord + v] : [r.coord + v, u];
}

/** Ground direction pointing from side `side` of a road toward its centerline. */
function towardCenter(r: Road, side: number): [number, number] {
  return r.axis === 'x' ? [0, -side] : [-side, 0];
}

/** True if `u` along road `r` is clear of every crossing by at least `margin` past its curb. */
function clearOfCrossings(r: Road, u: number, margin: number): boolean {
  if (Math.abs(u) > EXTENT - 4) return false;
  return roadsAlong(r.axis === 'x' ? 'z' : 'x').every(
    (c) => Math.abs(u - c.coord) > halfWidth(c) + margin,
  );
}

// ---------------------------------------------------------------------------
// Street lights
// ---------------------------------------------------------------------------

export function streetLightPlacements(): THREE.Matrix4[] {
  const out: THREE.Matrix4[] = [];
  for (const r of ROADS) {
    const v = halfWidth(r) + 0.45;
    for (let u = -EXTENT + 12; u <= EXTENT - 12; u += 33) {
      if (!clearOfCrossings(r, u, 8)) continue;
      for (const side of [-1, 1]) {
        // Stagger the two sides by half a spacing.
        const uu = side > 0 ? u : u + 16.5;
        if (!clearOfCrossings(r, uu, 8)) continue;
        const [x, z] = roadPoint(r, uu, side * v);
        const [dx, dz] = towardCenter(r, side);
        out.push(placement(x, Y, z, yawFor(dx, dz)));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Traffic signals: four mast arms per intersection, on the far side of each approach.
// ---------------------------------------------------------------------------

export interface MastArm {
  phase: SignalPhase;
  /** Seconds added to the clock so neighboring intersections aren't in sync. */
  offset: number;
  pole: [number, number];
  /** Ground direction the arm reaches out over the road. */
  dir: [number, number];
  /** Distances along the arm where signal heads hang. */
  heads: number[];
  /** Direction the lenses face (toward approaching traffic). */
  face: [number, number];
}

export const POLE_OFFSET = 1.7;
export const ARM_HEIGHT = 6.4;
export const HEAD_CENTER = 5.75;

/** Head distances along an arm: one over each lane heading toward the signal. */
function headDistances(approach: Road, crossHalf: number): number[] {
  const reach = crossHalf + POLE_OFFSET;
  const heads: number[] = [];
  for (let k = 0; k < approach.lanesPerSide; k++) {
    heads.push(reach - (k + 0.5) * approach.laneWidth);
  }
  if (approach.lanesPerSide === 1) heads.push(reach - approach.laneWidth - 0.9);
  return heads.sort((a, b) => a - b);
}

function armsFor(I: Intersection): MastArm[] {
  const ew = halfWidth(I.ew);
  const ns = halfWidth(I.ns);
  const o = POLE_OFFSET;
  const { x, z, signalOffset: offset } = I;
  return [
    // Eastbound traffic drives on the south half; its signals hang from the SE pole.
    {
      phase: 'A',
      offset,
      pole: [x + ns + o, z + ew + o],
      dir: [0, -1],
      heads: headDistances(I.ew, ew),
      face: [-1, 0],
    },
    {
      phase: 'A',
      offset,
      pole: [x - ns - o, z - ew - o],
      dir: [0, 1],
      heads: headDistances(I.ew, ew),
      face: [1, 0],
    },
    // Northbound traffic drives on the east half.
    {
      phase: 'B',
      offset,
      pole: [x + ns + o, z - ew - o],
      dir: [-1, 0],
      heads: headDistances(I.ns, ns),
      face: [0, 1],
    },
    {
      phase: 'B',
      offset,
      pole: [x - ns - o, z + ew + o],
      dir: [1, 0],
      heads: headDistances(I.ns, ns),
      face: [0, -1],
    },
  ];
}

export const MAST_ARMS: MastArm[] = INTERSECTIONS.flatMap(armsFor);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Roads with leafy street trees (the rest of the city gets palms, see palmPlacements). */
const TREE_ROADS = new Set(['oak', 'cedar']);

export function propPlacements(): Record<PropName, THREE.Matrix4[]> {
  const out: Record<PropName, THREE.Matrix4[]> = {
    hydrant: [],
    trashCan: [],
    bench: [],
    utilityBox: [],
    manhole: [],
    tree: [],
  };
  let n = 0;
  const jitter = () => ((n++ * 7919) % 100) / 100;

  for (const r of ROADS) {
    const hw = halfWidth(r);
    // Trees in tree pits, offset from the street lights.
    if (TREE_ROADS.has(r.id)) {
      for (let u = -EXTENT + 20; u <= EXTENT - 20; u += 15) {
        if (!clearOfCrossings(r, u, 10)) continue;
        for (const side of [-1, 1]) {
          const [x, z] = roadPoint(r, u + side * 3, side * (hw + 1.3));
          out.tree.push(placement(x, Y, z, jitter() * Math.PI * 2, 1.25 + jitter() * 0.25));
        }
      }
    }
    // A bench on each side of every block face on Main St, facing the road.
    if (r.id === 'main') {
      for (let u = -EXTENT + 30; u <= EXTENT - 30; u += 55) {
        if (!clearOfCrossings(r, u, 14)) continue;
        for (const side of [-1, 1]) {
          const [x, z] = roadPoint(r, u, side * (hw + 1.1));
          out.bench.push(placement(x, Y, z, side > 0 ? Math.PI : 0));
        }
      }
    }
    // One manhole cover per segment, in a travel lane.
    for (let u = -EXTENT + 55; u <= EXTENT; u += 110) {
      const [x, z] = roadPoint(r, u, r.laneWidth * 0.5);
      out.manhole.push(placement(x, 0.005, z, 0));
    }
  }

  // Corner furniture at every intersection.
  for (const I of INTERSECTIONS) {
    const ew = halfWidth(I.ew);
    const ns = halfWidth(I.ns);
    for (const [sx, sz] of [
      [1, 1],
      [-1, -1],
    ] as const) {
      out.hydrant.push(
        placement(I.x + sx * (ns + 7), Y, I.z + sz * (ew + 0.55), sx > 0 ? 0 : Math.PI),
      );
      out.trashCan.push(placement(I.x - sx * (ns + 5), Y, I.z + sz * (ew + 0.6), sx * 0.7));
    }
    out.trashCan.push(placement(I.x + ns + 0.8, Y, I.z - ew - 7.5, 1.2));
    out.utilityBox.push(placement(I.x + ns + 3.2, Y, I.z - ew - 3.6, Math.PI / 2));
  }
  return out;
}

/** Street-name sign blades: two per intersection corner pole (NE and SW), one for each street. */
export interface SignBlade {
  road: Road;
  position: [number, number, number];
  /** Rotation about Y so the blade runs parallel to its street. */
  rotY: number;
}

export function signBlades(): SignBlade[] {
  const out: SignBlade[] = [];
  for (const arm of MAST_ARMS) {
    const I = INTERSECTIONS.find(
      (i) => Math.abs(i.x - arm.pole[0]) < 20 && Math.abs(i.z - arm.pole[1]) < 20,
    );
    if (!I) continue;
    const [px, pz] = arm.pole;
    // Blades hang beside the pole (not through it), reaching toward the intersection, just
    // below the mast arm; the east–west street on top.
    const reach = 0.75 + 0.22;
    const sx = Math.sign(I.x - px) || 1;
    const sz = Math.sign(I.z - pz) || 1;
    out.push({ road: I.ew, position: [px + sx * reach, Y + 4.55, pz], rotY: 0 });
    out.push({ road: I.ns, position: [px, Y + 4.2, pz + sz * reach], rotY: Math.PI / 2 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Palms (CLAUDE.md §10): short fat date palms in downtown tree pits, tall thin fan palms
// lining the avenues and the waterfront.
// ---------------------------------------------------------------------------

/** Roads lined with short date palms, and with tall fan palms. */
const SHORT_PALM_ROADS = new Set(['main', 'market']);
const TALL_PALM_ROADS = new Set([...roadsAlong('z').map((r) => r.id), 'waterfront']);

export interface PalmPlacements {
  tall: THREE.Matrix4[];
  short: THREE.Matrix4[];
}

/** Nominal model heights (palmModel.ts builds the palms at these). */
export const TALL_PALM_HEIGHT = 16;
export const SHORT_PALM_HEIGHT = 5.5;

let palmCache: PalmPlacements | null = null;

export function palmPlacements(): PalmPlacements {
  if (palmCache) return palmCache;
  const out: PalmPlacements = { tall: [], short: [] };
  // Keep clear of everything else on the sidewalk.
  const p = new THREE.Vector3();
  const occupied: [number, number, number][] = [];
  for (const m of streetLightPlacements()) {
    p.setFromMatrixPosition(m);
    occupied.push([p.x, p.z, 2.5]);
  }
  for (const arm of MAST_ARMS) occupied.push([arm.pole[0], arm.pole[1], 3]);
  const props = propPlacements();
  for (const name of ['hydrant', 'trashCan', 'bench', 'utilityBox'] as const) {
    for (const m of props[name]) {
      p.setFromMatrixPosition(m);
      occupied.push([p.x, p.z, 2]);
    }
  }
  const free = (x: number, z: number) =>
    occupied.every(([ox, oz, r]) => (x - ox) ** 2 + (z - oz) ** 2 > r * r);

  let n = 0;
  const jitter = () => ((n++ * 7919) % 100) / 100;
  for (const r of ROADS) {
    const tall = TALL_PALM_ROADS.has(r.id);
    const short = SHORT_PALM_ROADS.has(r.id);
    if (!tall && !short) continue;
    const hw = halfWidth(r);
    const spacing = short ? 15 : 16;
    for (let u = -EXTENT + 20; u <= EXTENT - 20; u += spacing) {
      if (!clearOfCrossings(r, u, 10)) continue;
      for (const side of [-1, 1]) {
        const uu = u + side * 4;
        if (!clearOfCrossings(r, uu, 10)) continue;
        const [x, z] = roadPoint(r, uu, side * (hw + 1.3));
        if (!free(x, z)) continue;
        // Random yaw also randomizes each palm's lean direction.
        const yaw = jitter() * Math.PI * 2;
        // Models are authored at a nominal height; instance scale picks the real height.
        const [lo, hi] = short ? STYLE.palms.shortHeight : STYLE.palms.tallHeight;
        const scale = (lo + jitter() * (hi - lo)) / (short ? SHORT_PALM_HEIGHT : TALL_PALM_HEIGHT);
        (short ? out.short : out.tall).push(placement(x, Y, z, yaw, scale));
      }
    }
  }
  palmCache = out;
  return out;
}
