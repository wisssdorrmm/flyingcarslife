/** Drivable roads from OSM: classes, widths, and the junction graph. */
import type { RoadClass } from '../../src/game/city/format';
import { along, polylineLength, SegmentIndex, type Pt, type Ring } from './geom';
import { parseMeters, type Osm, type OsmWay, type Tags } from './parse';

export const LANE_WIDTH = 3.2;
const PARKING_WIDTH = 2.3;

const CLASS: Record<string, RoadClass> = {
  motorway: 'major',
  trunk: 'major',
  primary: 'major',
  secondary: 'major',
  motorway_link: 'minor',
  trunk_link: 'minor',
  primary_link: 'minor',
  secondary_link: 'minor',
  tertiary: 'minor',
  tertiary_link: 'minor',
  unclassified: 'residential',
  residential: 'residential',
  living_street: 'residential',
  busway: 'service',
  service: 'service',
};

export interface Road {
  wayId: number;
  name: string;
  cls: RoadClass;
  highway: string;
  oneway: boolean;
  /** Travel lanes: total and forward (along the way's node order). */
  lanes: number;
  lanesFwd: number;
  /** Parking lanes along each side (left/right of the way's direction). */
  parkingLeft: boolean;
  parkingRight: boolean;
  /** Lateral offset of the travel lanes' center from the way (+ = right), from one-sided parking. */
  laneOffset: number;
  width: number;
  /** Width tagged in OSM (kept when parking changes). */
  taggedWidth: number | undefined;
  tram: boolean;
}

/** Recomputes width and lane offset after parking changes. */
function sizeRoad(r: Road): void {
  const pl = r.parkingLeft ? PARKING_WIDTH : 0;
  const pr = r.parkingRight ? PARKING_WIDTH : 0;
  const w = r.taggedWidth ?? r.lanes * LANE_WIDTH + pl + pr + (r.cls === 'service' ? 1.2 : 0);
  r.width = Math.min(Math.max(w, 3.5), 30);
  r.laneOffset = (pl - pr) / 2;
}

function roadOf(w: OsmWay): Road | null {
  const t = w.tags;
  const cls = CLASS[t.highway ?? ''];
  if (!cls) return null;
  if (t.tunnel && t.tunnel !== 'no') return null;
  // Elevated freeways/ramps would be draped onto the streets below them: leave them out.
  if (t.bridge && t.bridge !== 'no' && /^(motorway|trunk)/.test(t.highway ?? '')) return null;
  if (t.area === 'yes' || t.access === 'private') return null;
  if (t.highway === 'service' && /driveway|parking_aisle|drive-through/.test(t.service ?? '')) {
    return null;
  }
  const oneway = t.oneway === 'yes' || t.oneway === '-1' || t.junction === 'roundabout';
  const isLink = (t.highway ?? '').endsWith('_link');
  const defaultLanes =
    cls === 'major' ? (oneway ? 2 : 4) : cls === 'service' ? 1 : isLink ? 1 : oneway ? 1 : 2;
  let lanes = Number.parseInt(t.lanes ?? '', 10);
  if (!Number.isFinite(lanes) || lanes < 1) lanes = defaultLanes;
  lanes = Math.min(lanes, 8);
  let lanesFwd = oneway ? lanes : Number.parseInt(t['lanes:forward'] ?? '', 10);
  if (!Number.isFinite(lanesFwd)) lanesFwd = Math.ceil(lanes / 2);
  const parking = cls !== 'service' && !isLink && t.highway !== 'busway';
  // One-way roads with a sidewalk on one side only are half of a dual carriageway.
  const sidewalk = t.sidewalk ?? '';
  const road: Road = {
    wayId: w.id,
    name: t.name ?? '',
    cls,
    highway: t.highway!,
    oneway,
    lanes,
    lanesFwd: Math.min(lanesFwd, lanes),
    parkingLeft: parking && !(oneway && /^(right|no|none)$/.test(sidewalk)),
    parkingRight: parking && !(oneway && /^(left|no|none)$/.test(sidewalk)),
    laneOffset: 0,
    width: 0,
    taggedWidth: parseMeters(t.width),
    tram: false,
  };
  sizeRoad(road);
  return road;
}

export interface Edge {
  id: number;
  road: Road;
  a: number;
  b: number;
  pts: Ring;
  length: number;
  /** Distance kept clear of markings at each end (junction box + crossing). */
  cutA: number;
  cutB: number;
  /** End has a crosswalk / stop line (a real junction of ≥ 3 roads or a signal). */
  junctionA: boolean;
  junctionB: boolean;
}

export interface Junction {
  id: number;
  p: Pt;
  edges: number[];
  signal: boolean;
}

export interface RoadNetwork {
  edges: Edge[];
  junctions: Map<number, Junction>;
  /** Cable-car / streetcar tracks (railway=tram), as polylines. */
  trams: Ring[];
  /** Way ids on trolleybus routes (overhead wires). */
  trolleyWays: Set<number>;
  /** Way ids on any bus route (trolleybus included). */
  busWays: Set<number>;
}

export function buildRoads(osm: Osm): RoadNetwork {
  const roads: { way: OsmWay; road: Road }[] = [];
  for (const w of osm.ways.values()) {
    const road = roadOf(w);
    if (!road) continue;
    if (w.tags.oneway === '-1') w.nodes = w.nodes.slice().reverse();
    roads.push({ way: w, road });
  }

  // A node is a graph node where ways meet or end.
  const use = new Map<number, number>();
  for (const { way } of roads) {
    way.nodes.forEach((n, i) => {
      const end = i === 0 || i === way.nodes.length - 1;
      use.set(n, (use.get(n) ?? 0) + (end ? 2 : 1));
    });
  }
  const junctions = new Map<number, Junction>();
  const edges: Edge[] = [];
  const junctionAt = (id: number): Junction => {
    let j = junctions.get(id);
    if (!j) {
      const n = osm.nodes.get(id)!;
      j = { id, p: n.p, edges: [], signal: n.tags?.highway === 'traffic_signals' };
      junctions.set(id, j);
    }
    return j;
  };
  for (const { way, road } of roads) {
    const ids = way.nodes.filter((n) => osm.nodes.has(n));
    let start = 0;
    for (let i = 1; i < ids.length; i++) {
      if (i < ids.length - 1 && (use.get(ids[i]!) ?? 0) < 2) continue;
      const seg = ids.slice(start, i + 1);
      const pts = seg.map((n) => osm.nodes.get(n)!.p);
      const length = polylineLength(pts);
      if (length > 0.5) {
        const e: Edge = {
          id: edges.length,
          road,
          a: seg[0]!,
          b: seg.at(-1)!,
          pts,
          length,
          cutA: 0,
          cutB: 0,
          junctionA: false,
          junctionB: false,
        };
        edges.push(e);
        junctionAt(e.a).edges.push(e.id);
        junctionAt(e.b).edges.push(e.id);
      }
      start = i;
    }
  }
  // Signals tagged on a node next to the junction (common in SF) count for the junction.
  for (const n of osm.nodes.values()) {
    if (n.tags?.highway !== 'traffic_signals' || junctions.has(n.id)) continue;
    let best: Junction | null = null;
    let bestD = 18;
    for (const j of junctions.values()) {
      const d = Math.hypot(j.p[0] - n.p[0], j.p[1] - n.p[1]);
      if (d < bestD && j.edges.length >= 3) {
        best = j;
        bestD = d;
      }
    }
    if (best) best.signal = true;
  }

  markDualCarriageways(edges);
  computeCuts(edges, junctions);

  const trams: Ring[] = [];
  for (const w of osm.ways.values()) {
    if (w.tags.railway === 'tram' && !w.tags.tunnel) trams.push(osm.pts(w));
  }
  const trolleyWays = new Set<number>();
  const busWays = new Set<number>();
  for (const r of osm.relations) {
    if (r.tags.route !== 'trolleybus' && r.tags.route !== 'bus') continue;
    for (const m of r.members) {
      if (m.type !== 'way') continue;
      busWays.add(m.ref);
      if (r.tags.route === 'trolleybus') trolleyWays.add(m.ref);
    }
  }
  return { edges, junctions, trams, trolleyWays, busWays };
}

/**
 * One-way ways with an opposite-direction twin of the same name close by form a divided road:
 * no parking on the median side.
 */
function markDualCarriageways(edges: Edge[]): void {
  const index = new SegmentIndex<Edge>(30);
  for (const e of edges) {
    if (!e.road.oneway) continue;
    for (let i = 1; i < e.pts.length; i++) index.add(e.pts[i - 1]!, e.pts[i]!, e);
  }
  for (const e of edges) {
    const r = e.road;
    if (!r.oneway || !r.name || !r.parkingLeft) continue;
    const { p, dir } = along(e.pts, e.length / 2);
    // Probe to the left, where the opposite carriageway would be.
    const left: Pt = [p[0] + dir[1] * 6, p[1] - dir[0] * 6];
    const hit = index.nearest(left, 24);
    if (!hit || hit.data === e || hit.data.road.name !== r.name) continue;
    const o = along(hit.data.pts, hit.data.length / 2).dir;
    if (o[0] * dir[0] + o[1] * dir[1] < -0.6) {
      r.parkingLeft = false;
      sizeRoad(r);
    }
  }
}

/** Direction leaving junction `j` along edge `e`, measured ~8 m in. */
export function leaving(e: Edge, j: number): Pt {
  const d = Math.min(8, e.length / 2);
  const atA = e.a === j;
  const p0 = atA ? e.pts[0]! : e.pts.at(-1)!;
  const { p } = along(e.pts, atA ? d : e.length - d);
  const l = Math.hypot(p[0] - p0[0], p[1] - p0[1]) || 1;
  return [(p[0] - p0[0]) / l, (p[1] - p0[1]) / l];
}

function computeCuts(edges: Edge[], junctions: Map<number, Junction>): void {
  for (const j of junctions.values()) {
    const list = j.edges.map((id) => edges[id]!);
    const isJunction = list.length >= 3 || (list.length === 2 && j.signal);
    for (const e of list) {
      const de = leaving(e, j.id);
      let cut = 0;
      for (const o of list) {
        if (o === e) continue;
        const dO = leaving(o, j.id);
        const cos = de[0] * dO[0] + de[1] * dO[1];
        const sin = Math.max(Math.abs(de[0] * dO[1] - de[1] * dO[0]), 0.35);
        // Where e's edge lines leave o's carriageway.
        const t = (o.road.width / 2 + (e.road.width / 2) * Math.abs(cos)) / sin;
        cut = Math.max(cut, Math.min(t, 28));
      }
      if (list.length === 2 && !j.signal) cut = 0; // a bend, not a junction
      cut = Math.min(cut + (isJunction ? 1 : 0), e.length * 0.45);
      if (e.a === j.id) {
        e.cutA = cut;
        e.junctionA = isJunction;
      }
      if (e.b === j.id) {
        e.cutB = cut;
        e.junctionB = isJunction;
      }
    }
  }
}

export function isTagged(t: Tags, k: string, v: RegExp): boolean {
  return v.test(t[k] ?? '');
}
