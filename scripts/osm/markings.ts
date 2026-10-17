/**
 * Road paint, draped just above the asphalt: double yellow center lines, dashed white lane lines,
 * stop lines and continental crosswalks at junctions, plus cable-car rails. One vertex-colored mesh.
 */
import { along, rightOf, slice, type Pt, type Ring } from './geom';
import type { Height } from './ground';
import { MeshBuilder } from './mesh';
import { LANE_WIDTH, type Edge } from './roads';

const WHITE = [0.93, 0.93, 0.91];
const YELLOW = [0.96, 0.76, 0.16];
const STEEL = [0.46, 0.46, 0.48];
const SLOT = [0.12, 0.12, 0.13];
const LIFT = 0.03;
const CROSSWALK = 3.2;

type Sample = { p: Pt; dir: Pt };

/** Ribbon along samples at a lateral offset (+ = right of travel direction). */
function ribbon(
  m: MeshBuilder,
  samples: Sample[],
  offset: number,
  width: number,
  color: number[],
  h: Height,
  lift = LIFT,
): void {
  let prev: [number, number] | null = null;
  for (const { p, dir } of samples) {
    const r = rightOf(dir);
    const lx = p[0] + r[0] * (offset - width / 2);
    const lz = p[1] + r[1] * (offset - width / 2);
    const rx = p[0] + r[0] * (offset + width / 2);
    const rz = p[1] + r[1] * (offset + width / 2);
    const a = m.vert(lx, h(lx, lz) + lift, lz, undefined, color);
    const b = m.vert(rx, h(rx, rz) + lift, rz, undefined, color);
    // Facing up (+y): r × forward = +y, so prev-left → prev-right → right → left.
    if (prev) m.quad(prev[0], prev[1], b, a);
    prev = [a, b];
  }
}

function solid(
  m: MeshBuilder,
  pts: Ring,
  d0: number,
  d1: number,
  offset: number,
  width: number,
  color: number[],
  h: Height,
): void {
  if (d1 - d0 < 0.3) return;
  ribbon(m, slice(pts, d0, d1, 3), offset, width, color, h);
}

function dashed(
  m: MeshBuilder,
  pts: Ring,
  d0: number,
  d1: number,
  offset: number,
  color: number[],
  h: Height,
): void {
  const DASH = 3;
  const GAP = 6;
  for (let d = d0 + 1; d + DASH <= d1; d += DASH + GAP) {
    ribbon(m, slice(pts, d, d + DASH, 3), offset, 0.12, color, h);
  }
}

/** A bar across the road at distance d (depth along the road), between two lateral offsets. */
function bar(
  m: MeshBuilder,
  pts: Ring,
  d: number,
  depth: number,
  o0: number,
  o1: number,
  color: number[],
  h: Height,
): void {
  const samples = [along(pts, d), along(pts, d + depth)];
  ribbon(m, samples, (o0 + o1) / 2, o1 - o0, color, h);
}

export function buildMarkings(
  edges: Edge[],
  trams: Ring[],
  h: Height,
  inTile: (p: Pt) => boolean,
): MeshBuilder {
  const m = new MeshBuilder();
  for (const e of edges) {
    if (!inTile(along(e.pts, e.length / 2).p)) continue;
    const { road, pts, length: L } = e;
    const half = road.width / 2;
    const painted = road.cls !== 'service';
    // Crosswalks + stop lines only where there's room for them.
    const crossA = painted && e.junctionA && L > e.cutA + e.cutB + 2 * CROSSWALK + 6;
    const crossB = painted && e.junctionB && L > e.cutA + e.cutB + 2 * CROSSWALK + 6;
    const startA = e.cutA + (crossA ? CROSSWALK + 1.4 : 0.5);
    const endB = L - e.cutB - (crossB ? CROSSWALK + 1.4 : 0.5);

    for (const [cross, cut, atStart] of [
      [crossA, e.cutA, true],
      [crossB, e.cutB, false],
    ] as const) {
      if (!cross) continue;
      const d = atStart ? cut : L - cut - CROSSWALK;
      // Continental stripes run along the road.
      for (let o = -half + 0.7; o <= half - 0.7; o += 1.2)
        bar(m, pts, d, CROSSWALK, o - 0.3, o + 0.3, WHITE, h);
      // Stop line just before the crosswalk, across the lanes heading into the junction.
      const s = atStart ? cut + CROSSWALK + 0.6 : L - cut - CROSSWALK - 1.05;
      if (road.oneway) {
        if (!atStart) bar(m, pts, s, 0.45, -half + 0.3, half - 0.3, WHITE, h);
      } else if (atStart) bar(m, pts, s, 0.45, -half + 0.3, -0.15, WHITE, h);
      else bar(m, pts, s, 0.45, 0.15, half - 0.3, WHITE, h);
    }

    if (!painted || endB - startA < 2) continue;
    if (road.oneway) {
      for (let k = 1; k < road.lanes; k++)
        dashed(m, pts, startA, endB, road.laneOffset + (k - road.lanes / 2) * LANE_WIDTH, WHITE, h);
    } else {
      if (road.width >= 7) {
        solid(m, pts, startA, endB, -0.13, 0.1, YELLOW, h);
        solid(m, pts, startA, endB, 0.13, 0.1, YELLOW, h);
      }
      const fwd = road.lanesFwd;
      const back = road.lanes - fwd;
      for (let k = 1; k < fwd; k++) dashed(m, pts, startA, endB, k * LANE_WIDTH, WHITE, h);
      for (let k = 1; k < back; k++) dashed(m, pts, startA, endB, -k * LANE_WIDTH, WHITE, h);
    }
  }

  // Cable-car / streetcar track: two rails and the cable slot between them.
  for (const t of trams) {
    let L = 0;
    for (let i = 1; i < t.length; i++)
      L += Math.hypot(t[i]![0] - t[i - 1]![0], t[i]![1] - t[i - 1]![1]);
    if (L < 1 || !inTile(along(t, L / 2).p)) continue;
    const s = slice(t, 0, L, 2);
    ribbon(m, s, -0.54, 0.08, STEEL, h, LIFT + 0.005);
    ribbon(m, s, 0.54, 0.08, STEEL, h, LIFT + 0.005);
    ribbon(m, s, 0, 0.035, SLOT, h, LIFT + 0.005);
  }
  return m;
}
