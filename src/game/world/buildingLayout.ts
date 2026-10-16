import { crossBuildingLine, LAYOUT, mainBuildingLine } from './layout';

/** Footprint side facing a direction: n = −z, s = +z, e = +x, w = −x. */
export type Side = 'n' | 's' | 'e' | 'w';
export type WallVariant = 'plaster_cream' | 'plaster_grey' | 'red_brick' | 'dark_brick' | 'stucco';
export type WindowStyle = 'centered_large' | 'centered_double' | 'centered_small';

export interface BuildingSpec {
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
  /** Far buildings skip window-frame geometry. */
  lowDetail: boolean;
}

/** Facade kit module sizes (meters). */
export const BAY = 3;
export const FLOOR_HEIGHT = 3.5;
export const WALL_HEIGHT = 3;

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

function rect(sx: number, sz: number, a0: number, a1: number, b0: number, b1: number) {
  const xs = [sx * a0, sx * a1].sort((p, q) => p - q) as [number, number];
  const zs = [sz * b0, sz * b1].sort((p, q) => p - q) as [number, number];
  return { x0: xs[0], x1: xs[1], z0: zs[0], z1: zs[1] };
}

function isFar(b: Pick<BuildingSpec, 'x0' | 'x1' | 'z0' | 'z1'>): boolean {
  const dx = Math.max(0, Math.min(Math.abs(b.x0), Math.abs(b.x1)) * (b.x0 * b.x1 > 0 ? 1 : 0));
  const dz = Math.max(0, Math.min(Math.abs(b.z0), Math.abs(b.z1)) * (b.z0 * b.z1 > 0 ? 1 : 0));
  return Math.hypot(dx, dz) > LAYOUT.detailRadius;
}

/** Lines every street frontage of the four quadrants with buildings. */
export function generateBuildings(seed = 7): BuildingSpec[] {
  const r = rng(seed);
  const out: Omit<BuildingSpec, 'lowDetail'>[] = [];
  const extent = LAYOUT.buildingExtent;

  for (const sx of [1, -1] as const) {
    for (const sz of [1, -1] as const) {
      const mainSide: Side = sz < 0 ? 's' : 'n';
      const crossSide: Side = sx < 0 ? 'e' : 'w';
      const style = () => ({
        variant: pick(r, VARIANTS),
        windows: pick(r, WINDOWS),
        windowRow: r() < 0.5 ? ('01' as const) : ('02' as const),
      });

      // Corner building: faces both streets.
      const cornerBays = int(r, 7, 9);
      const cornerDepth = 6;
      out.push({
        ...rect(
          sx,
          sz,
          crossBuildingLine,
          crossBuildingLine + cornerBays * BAY,
          mainBuildingLine,
          mainBuildingLine + cornerDepth * BAY,
        ),
        floors: int(r, 5, 7),
        streetSides: [mainSide, crossSide],
        ...style(),
        shopfront: true,
      });

      // Along Main Street.
      let u = crossBuildingLine + cornerBays * BAY;
      while (u + 4 * BAY <= extent) {
        const bays = Math.min(int(r, 4, 8), Math.floor((extent - u) / BAY));
        out.push({
          ...rect(sx, sz, u, u + bays * BAY, mainBuildingLine, mainBuildingLine + 18),
          floors: int(r, 3, 6),
          streetSides: [mainSide],
          ...style(),
          shopfront: r() < 0.7,
        });
        u += bays * BAY;
      }

      // Along 1st Avenue.
      let v = mainBuildingLine + cornerDepth * BAY;
      while (v + 4 * BAY <= extent) {
        const bays = Math.min(int(r, 4, 7), Math.floor((extent - v) / BAY));
        out.push({
          ...rect(sx, sz, crossBuildingLine, crossBuildingLine + 15, v, v + bays * BAY),
          floors: int(r, 3, 6),
          streetSides: [crossSide],
          ...style(),
          shopfront: r() < 0.5,
        });
        v += bays * BAY;
      }
    }
  }

  // Close off each street end so views terminate in buildings, not sky.
  const end = LAYOUT.streetLength;
  for (const s of [1, -1] as const) {
    const span = 14 * BAY;
    out.push({
      ...rect(s, 1, end, end + 15, -span / 2, span / 2),
      floors: int(r, 6, 8),
      streetSides: [s > 0 ? 'w' : 'e'],
      variant: pick(r, VARIANTS),
      windows: pick(r, WINDOWS),
      windowRow: '02',
      shopfront: true,
    });
    out.push({
      ...rect(1, s, -span / 2, span / 2, end, end + 15),
      floors: int(r, 6, 8),
      streetSides: [s > 0 ? 'n' : 's'],
      variant: pick(r, VARIANTS),
      windows: pick(r, WINDOWS),
      windowRow: '02',
      shopfront: true,
    });
  }
  return out.map((b) => ({ ...b, lowDetail: isFar(b) }));
}
