/** 2D polygon helpers for the city generator (Clipper for booleans/offsets, earcut for triangles). */
import { createRequire } from 'node:module';
import type * as ClipperTypes from 'clipper-lib';
import earcut from 'earcut';

// clipper-lib is CommonJS without a default export in its typings.
const ClipperLib = createRequire(import.meta.url)('clipper-lib') as typeof ClipperTypes;

export type Pt = [number, number];
export type Ring = Pt[];
/** A polygon with holes. */
export interface Poly {
  outer: Ring;
  holes: Ring[];
}

/** Clipper works on integers: 1 unit = 1 cm. */
const S = 100;
type CPath = { X: number; Y: number }[];

const toC = (r: Ring): CPath => r.map(([x, z]) => ({ X: Math.round(x * S), Y: Math.round(z * S) }));
const fromC = (p: CPath): Ring => p.map((q) => [q.X / S, q.Y / S]);

/** Every ring of a polygon set (outer + holes) as Clipper paths; fill rule non-zero needs orientation. */
function polysToC(polys: Poly[]): CPath[] {
  const out: CPath[] = [];
  for (const p of polys) {
    const o = toC(p.outer);
    if (!ClipperLib.Clipper.Orientation(o)) o.reverse();
    out.push(o);
    for (const h of p.holes) {
      const c = toC(h);
      if (ClipperLib.Clipper.Orientation(c)) c.reverse();
      out.push(c);
    }
  }
  return out;
}

function treeToPolys(tree: ClipperTypes.PolyTree): Poly[] {
  const out: Poly[] = [];
  const walk = (node: ClipperTypes.PolyNode) => {
    for (const child of node.Childs()) {
      if (!child.IsHole()) {
        const poly: Poly = { outer: fromC(child.Contour()), holes: [] };
        for (const hole of child.Childs()) {
          poly.holes.push(fromC(hole.Contour()));
          walk(hole); // islands inside holes
        }
        out.push(poly);
      }
    }
  };
  walk(tree);
  return out;
}

function boolOp(type: ClipperTypes.ClipType, subj: Poly[], clip: Poly[]): Poly[] {
  const c = new ClipperLib.Clipper();
  c.AddPaths(polysToC(subj), ClipperLib.PolyType.ptSubject, true);
  if (clip.length) c.AddPaths(polysToC(clip), ClipperLib.PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(type, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return treeToPolys(tree);
}

export const union = (a: Poly[], b: Poly[] = []) => boolOp(ClipperLib.ClipType.ctUnion, a, b);
export const intersect = (a: Poly[], b: Poly[]) =>
  a.length && b.length ? boolOp(ClipperLib.ClipType.ctIntersection, a, b) : [];
export const subtract = (a: Poly[], b: Poly[]) =>
  !a.length ? [] : !b.length ? a : boolOp(ClipperLib.ClipType.ctDifference, a, b);

/** Grows (delta > 0) or shrinks a polygon set with rounded corners. */
export function offset(polys: Poly[], delta: number): Poly[] {
  const co = new ClipperLib.ClipperOffset(2, 0.08 * S);
  co.AddPaths(polysToC(polys), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const tree = new ClipperLib.PolyTree();
  co.Execute(tree, delta * S);
  return treeToPolys(tree);
}

/** Buffers open polylines (one width each) into polygons with round caps, unioned. */
export function bufferLines(lines: { pts: Ring; half: number }[]): Poly[] {
  const all: CPath[] = [];
  for (const { pts, half } of lines) {
    if (pts.length < 2) continue;
    const co = new ClipperLib.ClipperOffset(2, 0.08 * S);
    co.AddPath(toC(pts), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound);
    const sol: CPath[] = [];
    co.Execute(sol, half * S);
    all.push(...sol);
  }
  const c = new ClipperLib.Clipper();
  c.AddPaths(all, ClipperLib.PolyType.ptSubject, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(
    ClipperLib.ClipType.ctUnion,
    tree,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero,
  );
  return treeToPolys(tree);
}

export function rect(x0: number, z0: number, x1: number, z1: number): Poly {
  return {
    outer: [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ],
    holes: [],
  };
}

/** Triangulates a polygon with holes. Returns flat vertex list + triangle indices into it. */
export function triangulate(p: Poly): { verts: Pt[]; tris: number[] } {
  const verts: Pt[] = [];
  const flat: number[] = [];
  const holes: number[] = [];
  const push = (r: Ring) => {
    for (const v of r) {
      verts.push(v);
      flat.push(v[0], v[1]);
    }
  };
  push(p.outer);
  for (const h of p.holes) {
    holes.push(verts.length);
    push(h);
  }
  return { verts, tris: earcut(flat, holes.length ? holes : undefined, 2) };
}

/** Signed area; positive = counter-clockwise in a y-up frame (clockwise seen from +y in x/z). */
export function signedArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    a += (r[j]![0] - r[i]![0]) * (r[j]![1] + r[i]![1]);
  }
  return a / 2;
}

export function area(p: Poly): number {
  return Math.abs(signedArea(p.outer)) - p.holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0);
}

export function centroid(r: Ring): Pt {
  let x = 0;
  let z = 0;
  for (const p of r) {
    x += p[0];
    z += p[1];
  }
  return [x / r.length, z / r.length];
}

export function pointInRing([x, z]: Pt, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i]!;
    const [xj, zj] = r[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polylineLength(pts: Ring): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    l += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  }
  return l;
}

/** Point and unit direction at distance `d` along a polyline. */
export function along(pts: Ring, d: number): { p: Pt; dir: Pt } {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg < 1e-6) continue;
    if (acc + seg >= d || i === pts.length - 1) {
      const t = Math.min(Math.max((d - acc) / seg, 0), 1);
      return {
        p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        dir: [(b[0] - a[0]) / seg, (b[1] - a[1]) / seg],
      };
    }
    acc += seg;
  }
  const p = pts[0]!;
  return { p, dir: [1, 0] };
}

/** Sub-polyline between distances d0 and d1, resampled at most `step` apart. */
export function slice(pts: Ring, d0: number, d1: number, step: number): { p: Pt; dir: Pt }[] {
  const out: { p: Pt; dir: Pt }[] = [];
  if (d1 <= d0) return out;
  const n = Math.max(1, Math.ceil((d1 - d0) / step));
  for (let i = 0; i <= n; i++) out.push(along(pts, d0 + ((d1 - d0) * i) / n));
  return out;
}

/** Right-hand normal in our frame (+x east, +z south): facing north (0, −1) → east (1, 0). */
export const rightOf = ([dx, dz]: Pt): Pt => [-dz, dx];

/** Uniform grid of segments for nearest-road queries. */
export class SegmentIndex<T> {
  private cells = new Map<string, { a: Pt; b: Pt; data: T }[]>();
  constructor(private cell = 24) {}
  private key(i: number, k: number) {
    return `${i},${k}`;
  }
  add(a: Pt, b: Pt, data: T): void {
    const c = this.cell;
    const i0 = Math.floor(Math.min(a[0], b[0]) / c);
    const i1 = Math.floor(Math.max(a[0], b[0]) / c);
    const k0 = Math.floor(Math.min(a[1], b[1]) / c);
    const k1 = Math.floor(Math.max(a[1], b[1]) / c);
    for (let i = i0; i <= i1; i++) {
      for (let k = k0; k <= k1; k++) {
        const key = this.key(i, k);
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, (list = []));
        list.push({ a, b, data });
      }
    }
  }
  /** Nearest segment within `radius`: distance, closest point and payload. */
  nearest(p: Pt, radius: number): { d: number; q: Pt; data: T } | null {
    const c = this.cell;
    let best: { d: number; q: Pt; data: T } | null = null;
    const r = Math.ceil(radius / c);
    const ci = Math.floor(p[0] / c);
    const ck = Math.floor(p[1] / c);
    for (let i = ci - r; i <= ci + r; i++) {
      for (let k = ck - r; k <= ck + r; k++) {
        for (const s of this.cells.get(this.key(i, k)) ?? []) {
          const q = closestOnSegment(p, s.a, s.b);
          const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
          if (d <= radius && (!best || d < best.d)) best = { d, q, data: s.data };
        }
      }
    }
    return best;
  }
}

export function closestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.min(Math.max(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2, 0), 1) : 0;
  return [a[0] + dx * t, a[1] + dz * t];
}

/** Deterministic PRNG (mulberry32) so regenerating the city gives the same result. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
