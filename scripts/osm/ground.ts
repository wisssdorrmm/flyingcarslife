/**
 * Ground meshes per tile: asphalt (roads), pavement (sidewalks + lots, raised by a curb), grass,
 * sand, pier decks, plus vertical curb faces and pier sides. Polygons are cut into a 4 m grid so
 * they drape over the terrain.
 */
import { CURB, TILE_SIZE } from '../../src/game/city/format';
import { intersect, rect, subtract, triangulate, signedArea, type Poly, type Ring } from './geom';
import { MeshBuilder } from './mesh';

const CELL = 4;
/** Ground cells entirely below this are under the bay: not generated. */
const UNDERWATER = -0.6;

export interface GroundLayers {
  asphalt: Poly[];
  grass: Poly[];
  sand: Poly[];
  piers: Poly[];
  buildings: Poly[];
}

export type Height = (x: number, z: number) => number;

/** Splits polygons into grid cells (global CELL grid) inside the given box. */
function cells(polys: Poly[], x0: number, z0: number, x1: number, z1: number): Poly[] {
  const out: Poly[] = [];
  if (!polys.length) return out;
  for (let z = Math.floor(z0 / CELL) * CELL; z < z1; z += CELL) {
    const strip = intersect(polys, [rect(x0, Math.max(z, z0), x1, Math.min(z + CELL, z1))]);
    if (!strip.length) continue;
    let sx0 = Infinity;
    let sx1 = -Infinity;
    for (const p of strip) {
      for (const [x] of p.outer) {
        sx0 = Math.min(sx0, x);
        sx1 = Math.max(sx1, x);
      }
    }
    for (let x = Math.floor(sx0 / CELL) * CELL; x < sx1; x += CELL) {
      const box = rect(
        Math.max(x, x0),
        Math.max(z, z0),
        Math.min(x + CELL, x1),
        Math.min(z + CELL, z1),
      );
      out.push(...intersect(strip, [box]));
    }
  }
  return out;
}

/** Triangulated, draped, upward-facing surface at height(x, z) + lift. */
function drape(
  m: MeshBuilder,
  polys: Poly[],
  height: Height,
  lift: number,
  skipUnderwater: boolean,
): void {
  for (const p of polys) {
    const { verts, tris } = triangulate(p);
    const ys = verts.map(([x, z]) => height(x, z));
    if (skipUnderwater && ys.every((y) => y < UNDERWATER)) continue;
    const ids = verts.map(([x, z], i) => m.vert(x, ys[i]! + lift, z));
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t]!;
      const b = tris[t + 1]!;
      const c = tris[t + 2]!;
      const [ax, az] = verts[a]!;
      const [bx, bz] = verts[b]!;
      const [cx, cz] = verts[c]!;
      // Normal must point up: (b−a)×(c−a) has y = (bz−az)(cx−ax) − (bx−ax)(cz−az).
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      if (Math.abs(ny) < 1e-8) continue;
      if (ny > 0) m.tri(ids[a]!, ids[b]!, ids[c]!);
      else m.tri(ids[a]!, ids[c]!, ids[b]!);
    }
  }
}

/** Edges of polygon rings, with the polygon material on the left (+1) or right (−1). */
function* ringEdges(polys: Poly[], x0: number, z0: number, x1: number, z1: number) {
  const onBorder = (a: [number, number], b: [number, number]) =>
    (Math.abs(a[0] - b[0]) < 1e-3 && (Math.abs(a[0] - x0) < 1e-3 || Math.abs(a[0] - x1) < 1e-3)) ||
    (Math.abs(a[1] - b[1]) < 1e-3 && (Math.abs(a[1] - z0) < 1e-3 || Math.abs(a[1] - z1) < 1e-3));
  for (const p of polys) {
    const side = signedArea(p.outer) > 0 ? 1 : -1;
    for (const r of [p.outer, ...p.holes] as Ring[]) {
      for (let i = 0; i < r.length; i++) {
        const a = r[i]!;
        const b = r[(i + 1) % r.length]!;
        if (onBorder(a, b)) continue;
        yield { a, b, side };
      }
    }
  }
}

/**
 * Vertical faces along polygon edges from bottom(x,z) to top(x,z), facing into the polygon
 * (`inward`, e.g. curbs seen from the road) or out of it (pier sides seen from the water).
 */
function walls(
  m: MeshBuilder,
  polys: Poly[],
  box: [number, number, number, number],
  bottom: Height,
  top: Height,
  include: (x: number, z: number) => boolean,
  inward: boolean,
): void {
  for (const edge of ringEdges(polys, ...box)) {
    const { a, b } = edge;
    const side = inward ? edge.side : -edge.side;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / CELL));
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const p0: [number, number] = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
      const p1: [number, number] = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
      if (!include((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)) continue;
      const b0 = m.vert(p0[0], bottom(...p0), p0[1]);
      const b1 = m.vert(p1[0], bottom(...p1), p1[1]);
      const u1 = m.vert(p1[0], top(...p1), p1[1]);
      const u0 = m.vert(p0[0], top(...p0), p0[1]);
      // quad(b0, b1, t1, t0) faces left of a→b.
      if (side > 0) m.quad(b0, b1, u1, u0);
      else m.quad(b1, b0, u0, u1);
    }
  }
}

export interface GroundTile {
  asphalt: MeshBuilder;
  pavement: MeshBuilder;
  grass: MeshBuilder;
  sand: MeshBuilder;
  curb: MeshBuilder;
  pier: MeshBuilder;
}

/**
 * `height` is the drivable surface (terrain, or deck on piers); `terrain` ignores piers.
 */
export function buildGround(
  ix: number,
  iz: number,
  layers: GroundLayers,
  height: Height,
  terrain: Height,
): GroundTile {
  const x0 = ix * TILE_SIZE;
  const z0 = iz * TILE_SIZE;
  const x1 = x0 + TILE_SIZE;
  const z1 = z0 + TILE_SIZE;
  const R = [rect(x0, z0, x1, z1)];
  const asphalt = intersect(layers.asphalt, R);
  const piers = subtract(intersect(layers.piers, R), asphalt);
  const grass = subtract(intersect(layers.grass, R), [...asphalt, ...piers]);
  const sand = subtract(intersect(layers.sand, R), [...asphalt, ...piers, ...grass]);
  const pavement = subtract(R, [...asphalt, ...piers, ...grass, ...sand, ...layers.buildings]);

  const out: GroundTile = {
    asphalt: new MeshBuilder(true),
    pavement: new MeshBuilder(true),
    grass: new MeshBuilder(true),
    sand: new MeshBuilder(true),
    curb: new MeshBuilder(true),
    pier: new MeshBuilder(true),
  };
  drape(out.asphalt, cells(asphalt, x0, z0, x1, z1), height, 0, true);
  drape(out.pavement, cells(pavement, x0, z0, x1, z1), height, CURB, true);
  drape(out.grass, cells(grass, x0, z0, x1, z1), height, CURB, true);
  drape(out.sand, cells(sand, x0, z0, x1, z1), height, CURB, false);
  drape(out.pier, cells(piers, x0, z0, x1, z1), height, CURB, false);

  const box: [number, number, number, number] = [x0, z0, x1, z1];
  // Curbs: asphalt edges step up to the sidewalk (skipped where the road meets water/pier ends).
  walls(
    out.curb,
    asphalt,
    box,
    height,
    (x, z) => height(x, z) + CURB,
    (x, z) => height(x, z) > UNDERWATER,
    true,
  );
  // Pier sides: deck edge down into the water, only where the edge is over water.
  walls(
    out.pier,
    intersect(layers.piers, R),
    box,
    () => -3,
    (x, z) => height(x, z) + CURB,
    (x, z) => terrain(x, z) < height(x, z) - 0.4,
    false,
  );
  return out;
}
