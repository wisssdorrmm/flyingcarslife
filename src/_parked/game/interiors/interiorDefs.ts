/**
 * Indoor spaces. Each is a set of rectangular rooms in local coordinates (meters): origin at the
 * center of the floor, +z toward the entrance wall, the door in the middle of that wall.
 * Interiors live far outside the city (see slots.ts) and are entered through a street door.
 */

export type InteriorType = 'studio' | 'loft' | 'townhouse' | 'penthouse' | 'club';

export interface Window {
  /** Wall: n = −z (back), e = +x, w = −x. Center along the wall (m) and width (m). */
  wall: 'n' | 'e' | 'w';
  at: number;
  width: number;
}

export interface InnerWall {
  /** Partition from (x0, z0) to (x1, z1) with an opening of `gap` meters at its middle. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  gap: number;
}

export interface InteriorDef {
  type: InteriorType;
  name: string;
  width: number;
  depth: number;
  height: number;
  floor: 'herringbone_parquet' | 'laminate_floor_02' | 'floor_tiles_06' | 'black_painted_planks';
  wall: 'white_plaster_02' | 'painted_plaster_wall';
  wallTint: string;
  windows: Window[];
  innerWalls: InnerWall[];
  /** Ceiling lights (local x, z). */
  lights: [number, number][];
  /** Where you appear after walking in (a few meters inside the door). */
  spawn: [number, number];
}

const DOOR_INSET = 1.6;

export const INTERIORS: Record<InteriorType, InteriorDef> = {
  studio: {
    type: 'studio',
    name: 'Studio apartment',
    width: 9,
    depth: 11,
    height: 3,
    floor: 'laminate_floor_02',
    wall: 'white_plaster_02',
    wallTint: '#f2eee6',
    windows: [
      { wall: 'n', at: -1.8, width: 2.4 },
      { wall: 'e', at: -2, width: 2 },
    ],
    innerWalls: [],
    lights: [
      [0, -2],
      [0, 2.5],
    ],
    spawn: [0, 11 / 2 - DOOR_INSET],
  },
  loft: {
    type: 'loft',
    name: 'Loft apartment',
    width: 14,
    depth: 16,
    height: 3.6,
    floor: 'herringbone_parquet',
    wall: 'painted_plaster_wall',
    wallTint: '#ece7de',
    windows: [
      { wall: 'n', at: -3.5, width: 3.2 },
      { wall: 'n', at: 3.5, width: 3.2 },
      { wall: 'w', at: -2, width: 2.4 },
    ],
    innerWalls: [{ x0: 2, z0: -8, x1: 2, z1: -1, gap: 1.2 }],
    lights: [
      [-3, -4],
      [4.5, -4.5],
      [-3, 3],
      [3, 3.5],
    ],
    spawn: [0, 16 / 2 - DOOR_INSET],
  },
  townhouse: {
    type: 'townhouse',
    name: 'Townhouse',
    width: 16,
    depth: 20,
    height: 3.2,
    floor: 'herringbone_parquet',
    wall: 'white_plaster_02',
    wallTint: '#f4efe6',
    windows: [
      { wall: 'n', at: -4, width: 2.6 },
      { wall: 'n', at: 4, width: 2.6 },
      { wall: 'e', at: -5, width: 2.4 },
      { wall: 'w', at: -5, width: 2.4 },
      { wall: 'e', at: 4, width: 2.4 },
    ],
    innerWalls: [
      { x0: -8, z0: -2, x1: 1, z1: -2, gap: 1.4 },
      { x0: 3, z0: -10, x1: 3, z1: -2, gap: 1.2 },
    ],
    lights: [
      [-4, -6],
      [5.5, -6],
      [-4, 4],
      [4, 5],
      [0, 0],
    ],
    spawn: [0, 20 / 2 - DOOR_INSET],
  },
  penthouse: {
    type: 'penthouse',
    name: 'Penthouse',
    width: 22,
    depth: 24,
    height: 4.2,
    floor: 'herringbone_parquet',
    wall: 'painted_plaster_wall',
    wallTint: '#e8e4dc',
    windows: [
      { wall: 'n', at: -6.5, width: 6 },
      { wall: 'n', at: 0, width: 6 },
      { wall: 'n', at: 6.5, width: 6 },
      { wall: 'e', at: -5, width: 7 },
      { wall: 'w', at: -5, width: 7 },
      { wall: 'e', at: 5, width: 5 },
      { wall: 'w', at: 5, width: 5 },
    ],
    innerWalls: [{ x0: 4, z0: 3, x1: 11, z1: 3, gap: 1.4 }],
    lights: [
      [-6, -6],
      [0, -6],
      [6, -6],
      [-6, 4],
      [0, 4],
      [7, 7],
    ],
    spawn: [0, 24 / 2 - DOOR_INSET],
  },
  club: {
    type: 'club',
    name: 'Neon Harbor Club',
    width: 30,
    depth: 26,
    height: 7,
    floor: 'black_painted_planks',
    wall: 'painted_plaster_wall',
    wallTint: '#2a2833',
    windows: [],
    innerWalls: [],
    lights: [],
    spawn: [0, 26 / 2 - DOOR_INSET],
  },
};

/** Door center (local) on the entrance wall, and its size. */
export const DOOR = { width: 1.4, height: 2.4 };
export const doorPoint = (d: InteriorDef): [number, number] => [0, d.depth / 2 - 0.8];
