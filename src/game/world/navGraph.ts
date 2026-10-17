/**
 * Road graph for GPS routing: nodes at every intersection and road end, edges along each road
 * between consecutive nodes. Routes are found with A* and drawn on the map, minimap and road.
 */
import { EXTENT, halfWidth, ROADS, roadsAlong, type Road } from './cityPlan';

export interface NavNode {
  id: number;
  x: number;
  z: number;
}

interface Edge {
  to: number;
  length: number;
}

export interface RoadPoint {
  road: Road;
  /** Position along the road (x for east–west roads, z for north–south). */
  u: number;
  x: number;
  z: number;
}

const nodes: NavNode[] = [];
const edges: Edge[][] = [];
/** For each road, its node ids sorted along the road. */
const roadNodes = new Map<string, { u: number; id: number }[]>();

function nodeAt(x: number, z: number): number {
  const found = nodes.find((n) => Math.abs(n.x - x) < 0.01 && Math.abs(n.z - z) < 0.01);
  if (found) return found.id;
  const id = nodes.length;
  nodes.push({ id, x, z });
  edges.push([]);
  return id;
}

function link(a: number, b: number): void {
  const na = nodes[a]!;
  const nb = nodes[b]!;
  const length = Math.hypot(na.x - nb.x, na.z - nb.z);
  edges[a]!.push({ to: b, length });
  edges[b]!.push({ to: a, length });
}

for (const r of ROADS) {
  const crossings = roadsAlong(r.axis === 'x' ? 'z' : 'x').map((c) => c.coord);
  const us = [-EXTENT, ...crossings, EXTENT];
  const list = us.map((u) => ({
    u,
    id: r.axis === 'x' ? nodeAt(u, r.coord) : nodeAt(r.coord, u),
  }));
  roadNodes.set(r.id, list);
  for (let i = 0; i < list.length - 1; i++) link(list[i]!.id, list[i + 1]!.id);
}

/** Closest point on any road's centerline to (x, z). */
export function snapToRoad(x: number, z: number): RoadPoint {
  let best: RoadPoint | null = null;
  let bestD = Infinity;
  for (const r of ROADS) {
    const along = r.axis === 'x' ? x : z;
    const u = Math.max(-EXTENT, Math.min(EXTENT, along));
    const px = r.axis === 'x' ? u : r.coord;
    const pz = r.axis === 'x' ? r.coord : u;
    const d = Math.hypot(px - x, pz - z);
    if (d < bestD) {
      bestD = d;
      best = { road: r, u, x: px, z: pz };
    }
  }
  return best!;
}

/** The two graph nodes on either side of a road point. */
function neighbors(p: RoadPoint): { id: number; dist: number }[] {
  const list = roadNodes.get(p.road.id)!;
  let i = 0;
  while (i < list.length - 2 && list[i + 1]!.u < p.u) i++;
  const a = list[i]!;
  const b = list[i + 1]!;
  return [
    { id: a.id, dist: Math.abs(p.u - a.u) },
    { id: b.id, dist: Math.abs(b.u - p.u) },
  ];
}

/**
 * Shortest route along roads between two world points, as a polyline that starts and ends at the
 * nearest road points. Returns [] if the points are on the same spot.
 */
export function findRoute(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): { x: number; z: number }[] {
  const a = snapToRoad(fromX, fromZ);
  const b = snapToRoad(toX, toZ);
  // Same road segment: straight along the road.
  const sameSegment =
    a.road === b.road && neighbors(a).every((n, i) => n.id === neighbors(b)[i]!.id);
  if (sameSegment) return [a, b].map(({ x, z }) => ({ x, z }));

  // A* from a virtual start (its two neighbor nodes) to a virtual goal.
  const goalLinks = new Map(neighbors(b).map((n) => [n.id, n.dist]));
  const g = new Map<number, number>();
  const came = new Map<number, number>();
  const open = new Set<number>();
  for (const n of neighbors(a)) {
    g.set(n.id, n.dist);
    open.add(n.id);
  }
  const h = (id: number) => Math.hypot(nodes[id]!.x - b.x, nodes[id]!.z - b.z);
  let reached: number | null = null;
  let bestTotal = Infinity;
  while (open.size) {
    let cur = -1;
    let curF = Infinity;
    for (const id of open) {
      const f = g.get(id)! + h(id);
      if (f < curF) {
        curF = f;
        cur = id;
      }
    }
    if (curF >= bestTotal) break;
    open.delete(cur);
    const toGoal = goalLinks.get(cur);
    if (toGoal !== undefined && g.get(cur)! + toGoal < bestTotal) {
      bestTotal = g.get(cur)! + toGoal;
      reached = cur;
    }
    for (const e of edges[cur]!) {
      const cost = g.get(cur)! + e.length;
      if (cost < (g.get(e.to) ?? Infinity)) {
        g.set(e.to, cost);
        came.set(e.to, cur);
        open.add(e.to);
      }
    }
  }
  if (reached === null) return [];
  const path: number[] = [reached];
  while (came.has(path[0]!)) path.unshift(came.get(path[0]!)!);
  return [
    { x: a.x, z: a.z },
    ...path.map((id) => ({ x: nodes[id]!.x, z: nodes[id]!.z })),
    { x: b.x, z: b.z },
  ];
}

/** Total length of a polyline in meters. */
export function routeLength(points: { x: number; z: number }[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
  }
  return d;
}

/** Offset used to draw the GPS line in the right-hand driving lane rather than on the centerline. */
export const laneOffset = (r: Road) => halfWidth(r) - r.parking - r.laneWidth / 2;
