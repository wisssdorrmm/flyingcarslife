import * as THREE from 'three';
import {
  BLOCKS,
  buildingOffset,
  CURB_HEIGHT,
  END_BUILDING_DEPTH,
  EXTENT,
  ROADS,
  type Block,
} from './cityPlan';

/** Footprint side facing a direction: n = −z, s = +z, e = +x, w = −x. */
export type Side = 'n' | 's' | 'e' | 'w';
export type WallVariant = 'plaster_cream' | 'plaster_grey' | 'red_brick' | 'dark_brick' | 'stucco';
export type WindowStyle = 'centered_large' | 'centered_double' | 'centered_small';

export interface BuildingSpec {
  id: string;
  /** Block this building belongs to (used for level-of-detail grouping). */
  blockId: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  floors: number;
  /** Sides that get a full facade; the rest are plain party walls. */
  streetSides: Side[];
  variant: WallVariant;
  windows: WindowStyle;
  /** Upper-floor window row: '01' floor-length, '02' sill-height. */
  windowRow: '01' | '02';
  shopfront: boolean;
  /** Set when a business/landmark occupies this building (see places/placement.ts). */
  placeId?: string;
}

/** Facade kit module sizes (meters). */
export const BAY = 3;
export const FLOOR_HEIGHT = 3.5;
export const WALL_HEIGHT = 3;

/** Facade frame for a footprint side: origin, run direction (local +x) and outward normal (local +z). */
export function facadeFrame(
  b: Pick<BuildingSpec, 'x0' | 'x1' | 'z0' | 'z1'>,
  side: Side,
): { origin: THREE.Vector3; rotY: number; length: number } {
  const y = CURB_HEIGHT;
  switch (side) {
    case 's':
      return { origin: new THREE.Vector3(b.x0, y, b.z1), rotY: 0, length: b.x1 - b.x0 };
    case 'n':
      return { origin: new THREE.Vector3(b.x1, y, b.z0), rotY: Math.PI, length: b.x1 - b.x0 };
    case 'e':
      return { origin: new THREE.Vector3(b.x1, y, b.z1), rotY: Math.PI / 2, length: b.z1 - b.z0 };
    case 'w':
      return { origin: new THREE.Vector3(b.x0, y, b.z0), rotY: -Math.PI / 2, length: b.z1 - b.z0 };
  }
}

/** Index of the entrance bay on a facade of `bays` bays (the middle one). */
export const entranceBay = (bays: number) => Math.floor(bays / 2);

/** Height from the building's base to the top of its roof crown. */
export function buildingHeight(b: Pick<BuildingSpec, 'floors'>): number {
  return (b.floors - 1) * FLOOR_HEIGHT + WALL_HEIGHT + 0.75;
}

const VARIANTS: WallVariant[] = [
  'plaster_cream',
  'plaster_grey',
  'red_brick',
  'dark_brick',
  'stucco',
];
const WINDOWS: WindowStyle[] = ['centered_large', 'centered_double', 'centered_small'];
/** Depth of buildings along a block side (meters). */
const SIDE_DEPTH = 18;

/** Small deterministic PRNG so the city is identical on every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, items: readonly T[]): T {
  return items[Math.floor(r() * items.length)] as T;
}

function int(r: () => number, min: number, max: number): number {
  return min + Math.floor(r() * (max - min + 1));
}

/** Taller buildings toward the middle of downtown. */
function floorsAt(r: () => number, x: number, z: number, corner: boolean): number {
  const centrality = 1 - Math.min(1, Math.hypot(x, z) / 220);
  return (corner ? 5 : 3) + Math.round(centrality * 2) + int(r, 0, 3);
}

/**
 * Lines every street-facing side of a block with buildings: a corner building wherever two
 * streets meet, then each side filled edge to edge. Block lengths are whole bays, so no gaps.
 */
function blockBuildings(b: Block, r: () => number, out: BuildingSpec[]): void {
  const faces = { n: !!b.roads.n, s: !!b.roads.s, w: !!b.roads.w, e: !!b.roads.e };
  const style = () => ({
    variant: pick(r, VARIANTS),
    windows: pick(r, WINDOWS),
    windowRow: r() < 0.5 ? ('01' as const) : ('02' as const),
  });
  let n = 0;
  const push = (spec: Omit<BuildingSpec, 'id' | 'blockId'>) =>
    out.push({ id: `${b.id}#${n++}`, blockId: b.id, ...spec });

  // Corner footprints as [bays along x, bays along z].
  const span = (): [number, number] => [int(r, 6, 8), int(r, 6, 8)];
  const corner = {
    nw: faces.n && faces.w ? span() : null,
    ne: faces.n && faces.e ? span() : null,
    sw: faces.s && faces.w ? span() : null,
    se: faces.s && faces.e ? span() : null,
  };
  type CornerKey = keyof typeof corner;
  const C = (k: CornerKey, axis: 0 | 1) => (corner[k]?.[axis] ?? 0) * BAY;

  for (const [k, sides] of [
    ['nw', ['n', 'w']],
    ['ne', ['n', 'e']],
    ['sw', ['s', 'w']],
    ['se', ['s', 'e']],
  ] as const) {
    const c = corner[k];
    if (!c) continue;
    const w = c[0] * BAY;
    const d = c[1] * BAY;
    const x0 = k.endsWith('w') ? b.x0 : b.x1 - w;
    const z0 = k.startsWith('n') ? b.z0 : b.z1 - d;
    push({
      x0,
      x1: x0 + w,
      z0,
      z1: z0 + d,
      floors: floorsAt(r, x0, z0, true),
      streetSides: [...sides],
      ...style(),
      shopfront: true,
    });
  }

  // Fill one side between `from` and `to` (along its axis) with 4–8 bay buildings.
  const fill = (side: Side, from: number, to: number) => {
    let u = from;
    while (to - u >= BAY - 0.01) {
      const left = Math.round((to - u) / BAY);
      let bays = Math.min(int(r, 4, 8), left);
      // Never leave a sliver of fewer than 3 bays at the end.
      if (left - bays > 0 && left - bays < 3) bays = left;
      const u1 = u + bays * BAY;
      const rect =
        side === 'n'
          ? { x0: u, x1: u1, z0: b.z0, z1: b.z0 + SIDE_DEPTH }
          : side === 's'
            ? { x0: u, x1: u1, z0: b.z1 - SIDE_DEPTH, z1: b.z1 }
            : side === 'w'
              ? { x0: b.x0, x1: b.x0 + SIDE_DEPTH, z0: u, z1: u1 }
              : { x0: b.x1 - SIDE_DEPTH, x1: b.x1, z0: u, z1: u1 };
      push({
        ...rect,
        floors: floorsAt(r, (rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2, false),
        streetSides: [side],
        ...style(),
        shopfront: r() < 0.65,
      });
      u = u1;
    }
  };
  if (faces.n) fill('n', b.x0 + C('nw', 0), b.x1 - C('ne', 0));
  if (faces.s) fill('s', b.x0 + C('sw', 0), b.x1 - C('se', 0));
  // East/west sides run between the north/south rows.
  const rowDepth = (k: CornerKey, facing: boolean) =>
    corner[k] ? C(k, 1) : facing ? SIDE_DEPTH : 0;
  if (faces.w) fill('w', b.z0 + rowDepth('nw', faces.n), b.z1 - rowDepth('sw', faces.s));
  if (faces.e) fill('e', b.z0 + rowDepth('ne', faces.n), b.z1 - rowDepth('se', faces.s));
}

/** Buildings across the end of every road, so no street ever runs out into empty space. */
function endBuildings(r: () => number, out: BuildingSpec[]): void {
  for (const road of ROADS) {
    const half = buildingOffset(road);
    for (const s of [-1, 1] as const) {
      const near = s * EXTENT;
      const far = s * (EXTENT + END_BUILDING_DEPTH);
      const a0 = Math.min(near, far);
      const a1 = Math.max(near, far);
      const rect =
        road.axis === 'x'
          ? { x0: a0, x1: a1, z0: road.coord - half, z1: road.coord + half }
          : { x0: road.coord - half, x1: road.coord + half, z0: a0, z1: a1 };
      const side: Side = road.axis === 'x' ? (s > 0 ? 'w' : 'e') : s > 0 ? 'n' : 's';
      const id = `end-${road.id}-${s > 0 ? 'p' : 'm'}`;
      out.push({
        id,
        blockId: id,
        ...rect,
        floors: int(r, 6, 9),
        streetSides: [side],
        variant: pick(r, VARIANTS),
        windows: pick(r, WINDOWS),
        windowRow: '02',
        shopfront: true,
      });
    }
  }
}

/** Every building in the city. Deterministic for a given seed. */
export function generateBuildings(seed = 7): BuildingSpec[] {
  const r = rng(seed);
  const out: BuildingSpec[] = [];
  for (const b of BLOCKS) blockBuildings(b, r, out);
  endBuildings(r, out);
  return out;
}

let cached: BuildingSpec[] | null = null;
/** Shared, memoized city buildings (renderers, colliders and points of interest all use these). */
export function cityBuildings(): BuildingSpec[] {
  return (cached ??= generateBuildings());
}
