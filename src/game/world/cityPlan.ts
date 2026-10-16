/**
 * Harbor City downtown grid. Single source of truth for roads, blocks, intersections and names.
 * +X east, +Z south, +Y up, meters.
 *
 * Widths are chosen so every block frontage is a whole number of 3 m facade bays:
 *   street: 6 m half-width + 5.5 m sidewalk = 11.5 m to the building line
 *   Main St: 8.5 m half-width + 6 m sidewalk = 14.5 m
 *   110 m pitch → inner blocks 87 m (29 bays) or 84 m (28 bays); edge blocks 60 m (20 bays).
 */

export type RoadAxis = 'x' | 'z';

export interface Road {
  id: string;
  name: string;
  /** 'x' = runs east–west (fixed z); 'z' = runs north–south (fixed x). */
  axis: RoadAxis;
  /** The fixed coordinate of the centerline. */
  coord: number;
  parking: number;
  laneWidth: number;
  lanesPerSide: number;
  sidewalk: number;
}

export const CURB_HEIGHT = 0.15;
export const CORNER_RADIUS = 4;
export const CROSSWALK_WIDTH = 3.2;
export const STOP_LINE_GAP = 1.2;
/** Roads run from −EXTENT to +EXTENT; buildings close off each road end just beyond. */
export const EXTENT = 181.5;
/** Depth of the buildings that close each road end. */
export const END_BUILDING_DEPTH = 15;

const street = (id: string, name: string, axis: RoadAxis, coord: number): Road => ({
  id,
  name,
  axis,
  coord,
  parking: 2.5,
  laneWidth: 3.5,
  lanesPerSide: 1,
  sidewalk: 5.5,
});

export const ROADS: Road[] = [
  street('harbor', 'Harbor St', 'x', -110),
  {
    id: 'main',
    name: 'Main St',
    axis: 'x',
    coord: 0,
    parking: 2.5,
    laneWidth: 3,
    lanesPerSide: 2,
    sidewalk: 6,
  },
  street('market', 'Market St', 'x', 110),
  street('bayview', 'Bayview Ave', 'z', -110),
  street('first', '1st Ave', 'z', 0),
  street('liberty', 'Liberty Ave', 'z', 110),
];

export const halfWidth = (r: Road) => r.parking + r.laneWidth * r.lanesPerSide;
/** Distance from the centerline to the building line. */
export const buildingOffset = (r: Road) => halfWidth(r) + r.sidewalk;

export const roadsAlong = (axis: RoadAxis) =>
  ROADS.filter((r) => r.axis === axis).sort((a, b) => a.coord - b.coord);

export interface Intersection {
  /** Road running east–west (fixed z). */
  ew: Road;
  /** Road running north–south (fixed x). */
  ns: Road;
  x: number;
  z: number;
  /** Offset so neighboring signals aren't all in sync. */
  signalOffset: number;
}

export const INTERSECTIONS: Intersection[] = roadsAlong('x').flatMap((ew, i) =>
  roadsAlong('z').map((ns, j) => ({
    ew,
    ns,
    x: ns.coord,
    z: ew.coord,
    signalOffset: (i * 3 + j) * 7.3,
  })),
);

/** A city block between roads (or between a road and the map edge). */
export interface Block {
  id: string;
  /** Building-line rectangle (where facades stand). */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Raised sidewalk slab rectangle (curb to curb). */
  sx0: number;
  sx1: number;
  sz0: number;
  sz1: number;
  /** Road on each side, or null at the map edge. n = −z, s = +z, w = −x, e = +x. */
  roads: { n: Road | null; s: Road | null; w: Road | null; e: Road | null };
}

function buildBlocks(): Block[] {
  const xs = roadsAlong('z');
  const zs = roadsAlong('x');
  const xBands: [Road | null, Road | null][] = [];
  const zBands: [Road | null, Road | null][] = [];
  [null, ...xs].forEach((r, i) => xBands.push([r, xs[i] ?? null]));
  [null, ...zs].forEach((r, i) => zBands.push([r, zs[i] ?? null]));
  // Edge slabs reach under the end buildings so nothing ever floats.
  const edge = EXTENT + END_BUILDING_DEPTH + 5;
  const out: Block[] = [];
  for (const [w, e] of xBands) {
    for (const [n, s] of zBands) {
      out.push({
        id: `${w?.id ?? 'edge'}-${e?.id ?? 'edge'}/${n?.id ?? 'edge'}-${s?.id ?? 'edge'}`,
        x0: w ? w.coord + buildingOffset(w) : -EXTENT,
        x1: e ? e.coord - buildingOffset(e) : EXTENT,
        z0: n ? n.coord + buildingOffset(n) : -EXTENT,
        z1: s ? s.coord - buildingOffset(s) : EXTENT,
        sx0: w ? w.coord + halfWidth(w) : -edge,
        sx1: e ? e.coord - halfWidth(e) : edge,
        sz0: n ? n.coord + halfWidth(n) : -edge,
        sz1: s ? s.coord - halfWidth(s) : edge,
        roads: { n, s, w, e },
      });
    }
  }
  return out;
}

export const BLOCKS: Block[] = buildBlocks();

/** The road whose pavement or sidewalk contains (x, z), and the cross street if at an intersection. */
export function locate(x: number, z: number): { road: Road | null; cross: Road | null } {
  const on = ROADS.filter((r) => {
    const across = r.axis === 'x' ? z : x;
    const along = r.axis === 'x' ? x : z;
    return Math.abs(across - r.coord) <= buildingOffset(r) && Math.abs(along) <= EXTENT;
  }).sort(
    (a, b) =>
      Math.abs((a.axis === 'x' ? z : x) - a.coord) - Math.abs((b.axis === 'x' ? z : x) - b.coord),
  );
  return { road: on[0] ?? null, cross: on[1] ?? null };
}
