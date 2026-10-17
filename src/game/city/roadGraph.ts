/**
 * Queries over the city's road graph (from index.json): which street a point is on, snapping to
 * roads, and GPS routes that respect one-way streets.
 */
import type { CityIndex, RoadEdge } from './format';
import { districtAt } from './geo';

export interface RoadHit {
  edge: number;
  /** Closest point on the road centerline. */
  x: number;
  z: number;
  /** Distance from the query point, and along the edge from its start node. */
  d: number;
  along: number;
}

export interface Pt2 {
  x: number;
  z: number;
}

const CELL = 40;

export class RoadGraph {
  readonly edges: RoadEdge[];
  readonly streets: string[];
  private nodes: number[];
  private cells = new Map<string, { e: number; i: number }[]>();
  /** node → [edge, toNode, forward][] */
  private adj: { e: number; to: number; fwd: boolean }[][];
  /** Cumulative length at each polyline vertex, per edge. */
  private cum: number[][];

  constructor(index: CityIndex) {
    this.edges = index.edges;
    this.streets = index.streets;
    this.nodes = index.nodes;
    this.adj = Array.from({ length: index.nodes.length / 3 }, () => []);
    this.cum = [];
    index.edges.forEach((e, ei) => {
      this.adj[e.a]!.push({ e: ei, to: e.b, fwd: true });
      if (!e.oneway) this.adj[e.b]!.push({ e: ei, to: e.a, fwd: false });
      const cum = [0];
      for (let i = 2; i < e.pts.length; i += 2) {
        const seg = Math.hypot(e.pts[i]! - e.pts[i - 2]!, e.pts[i + 1]! - e.pts[i - 1]!);
        cum.push(cum.at(-1)! + seg);
        const x0 = Math.min(e.pts[i - 2]!, e.pts[i]!);
        const x1 = Math.max(e.pts[i - 2]!, e.pts[i]!);
        const z0 = Math.min(e.pts[i - 1]!, e.pts[i + 1]!);
        const z1 = Math.max(e.pts[i - 1]!, e.pts[i + 1]!);
        for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
          for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
            const key = `${cx},${cz}`;
            let list = this.cells.get(key);
            if (!list) this.cells.set(key, (list = []));
            list.push({ e: ei, i: i / 2 - 1 });
          }
        }
      }
      this.cum.push(cum);
    });
  }

  node(i: number): Pt2 {
    return { x: this.nodes[i * 3]!, z: this.nodes[i * 3 + 2]! };
  }

  streetName(edge: number): string {
    const n = this.edges[edge]?.name ?? -1;
    return n >= 0 ? this.streets[n]! : '';
  }

  /** Nearest road within `radius` (optionally only named roads). */
  nearest(x: number, z: number, radius = 60, named = false): RoadHit | null {
    let best: RoadHit | null = null;
    const r = Math.ceil(radius / CELL);
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let i = cx - r; i <= cx + r; i++) {
      for (let k = cz - r; k <= cz + r; k++) {
        for (const { e, i: s } of this.cells.get(`${i},${k}`) ?? []) {
          const edge = this.edges[e]!;
          if (named && edge.name < 0) continue;
          const ax = edge.pts[s * 2]!;
          const az = edge.pts[s * 2 + 1]!;
          const bx = edge.pts[s * 2 + 2]!;
          const bz = edge.pts[s * 2 + 3]!;
          const dx = bx - ax;
          const dz = bz - az;
          const l2 = dx * dx + dz * dz;
          const t = l2 ? Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / l2, 0), 1) : 0;
          const qx = ax + dx * t;
          const qz = az + dz * t;
          const d = Math.hypot(x - qx, z - qz);
          if (d <= radius && (!best || d < best.d)) {
            best = { edge: e, x: qx, z: qz, d, along: this.cum[e]![s]! + Math.sqrt(l2) * t };
          }
        }
      }
    }
    return best;
  }

  /** Street you're on, the cross street near a junction, and the neighborhood. */
  locate(x: number, z: number): { street: string; cross: string; district: string } {
    const district = districtAt(x, z).name;
    const hit = this.nearest(x, z, 30, true);
    if (!hit) return { street: '', cross: '', district };
    const street = this.streetName(hit.edge);
    const e = this.edges[hit.edge]!;
    let cross = '';
    // Within ~14 m of a junction: name a different street meeting there.
    const nearA = hit.along < 14;
    const nearB = e.length - hit.along < 14;
    if (nearA || nearB) {
      const n = nearA ? e.a : e.b;
      for (const { e: other } of [...this.adj[n]!, ...this.incoming(n)]) {
        const name = this.streetName(other);
        if (name && name !== street) {
          cross = name;
          break;
        }
      }
    }
    return { street, cross, district };
  }

  private incoming(n: number): { e: number }[] {
    const out: { e: number }[] = [];
    this.edges.forEach((e, i) => {
      if (e.b === n && e.oneway) out.push({ e: i });
    });
    return out;
  }

  /** Points of edge `e` between two distances along it (in either order). */
  private span(e: number, d0: number, d1: number): Pt2[] {
    const edge = this.edges[e]!;
    const cum = this.cum[e]!;
    const lo = Math.min(d0, d1);
    const hi = Math.max(d0, d1);
    const at = (d: number): Pt2 => {
      for (let i = 1; i < cum.length; i++) {
        if (cum[i]! >= d || i === cum.length - 1) {
          const t = (d - cum[i - 1]!) / Math.max(cum[i]! - cum[i - 1]!, 1e-6);
          const k = Math.min(Math.max(t, 0), 1);
          return {
            x: edge.pts[(i - 1) * 2]! + (edge.pts[i * 2]! - edge.pts[(i - 1) * 2]!) * k,
            z: edge.pts[(i - 1) * 2 + 1]! + (edge.pts[i * 2 + 1]! - edge.pts[(i - 1) * 2 + 1]!) * k,
          };
        }
      }
      return { x: edge.pts[0]!, z: edge.pts[1]! };
    };
    const pts: Pt2[] = [at(lo)];
    for (let i = 0; i < cum.length; i++) {
      if (cum[i]! > lo && cum[i]! < hi) pts.push({ x: edge.pts[i * 2]!, z: edge.pts[i * 2 + 1]! });
    }
    pts.push(at(hi));
    return d0 <= d1 ? pts : pts.reverse();
  }

  /**
   * Shortest legal route between two points (snapped to the nearest roads). Returns the path
   * along road centerlines, or [] when unreachable.
   */
  route(from: Pt2, to: Pt2): Pt2[] {
    const s = this.nearest(from.x, from.z, 120);
    const t = this.nearest(to.x, to.z, 200);
    if (!s || !t) return [];
    const se = this.edges[s.edge]!;
    const te = this.edges[t.edge]!;
    if (s.edge === t.edge && (!se.oneway || t.along >= s.along)) {
      return this.span(s.edge, s.along, t.along);
    }
    // Start: leave the snapped edge toward b (and toward a if two-way).
    const n = this.nodes.length / 3;
    const g = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const prevEdge = new Int32Array(n).fill(-1);
    const open: number[] = [];
    const goal = { x: t.x, z: t.z };
    const h = (i: number) =>
      Math.hypot(this.nodes[i * 3]! - goal.x, this.nodes[i * 3 + 2]! - goal.z);
    const seed = (node: number, cost: number) => {
      if (cost < g[node]!) {
        g[node] = cost;
        prev[node] = -2; // reached from the start point
        open.push(node);
      }
    };
    seed(se.b, se.length - s.along);
    if (!se.oneway) seed(se.a, s.along);
    // Goal: arrive at the snapped point from a (and from b if two-way).
    const goalCost = (node: number) =>
      node === te.a ? t.along : !te.oneway && node === te.b ? te.length - t.along : Infinity;
    let bestEnd = -1;
    let bestTotal = Infinity;
    const closed = new Uint8Array(n);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) {
        if (g[open[i]!]! + h(open[i]!) < g[open[bi]!]! + h(open[bi]!)) bi = i;
      }
      const cur = open.splice(bi, 1)[0]!;
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (g[cur]! >= bestTotal) break;
      const end = g[cur]! + goalCost(cur);
      if (end < bestTotal) {
        bestTotal = end;
        bestEnd = cur;
      }
      for (const { e, to } of this.adj[cur]!) {
        const c = g[cur]! + this.edges[e]!.length;
        if (c < g[to]!) {
          g[to] = c;
          prev[to] = cur;
          prevEdge[to] = e;
          open.push(to);
        }
      }
    }
    if (bestEnd < 0) return [];
    // Walk back: nodes from start to bestEnd.
    const chain: number[] = [];
    for (let c = bestEnd; c >= 0; c = prev[c]!) chain.unshift(c);
    const out: Pt2[] = [];
    const first = chain[0]!;
    out.push(...this.span(s.edge, s.along, first === se.b ? se.length : 0));
    for (let i = 1; i < chain.length; i++) {
      const e = prevEdge[chain[i]!]!;
      const edge = this.edges[e]!;
      const fwd = edge.a === chain[i - 1];
      out.push(...this.span(e, fwd ? 0 : edge.length, fwd ? edge.length : 0));
    }
    out.push(...this.span(t.edge, bestEnd === te.a ? 0 : te.length, t.along));
    return out;
  }
}

export function pathLength(points: Pt2[]): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) {
    l += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
  }
  return l;
}
