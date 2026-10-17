/** Instanced street furniture per tile: trees, lamps, signals, parked cars, trolley wires. */
import { CURB, type TileProps } from '../../src/game/city/format';
import { along, pointInRing, rightOf, rng, slice, type Poly, type Pt } from './geom';
import type { Height } from './ground';
import type { Osm } from './parse';
import { LANE_WIDTH, leaving, type Edge, type RoadNetwork } from './roads';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Grid lookup: is a point inside any building footprint? */
export class FootprintIndex {
  private cells = new Map<string, Poly[]>();
  constructor(
    polys: Poly[],
    private cell = 40,
  ) {
    for (const p of polys) {
      const xs = p.outer.map((q) => q[0]);
      const zs = p.outer.map((q) => q[1]);
      for (
        let i = Math.floor(Math.min(...xs) / cell);
        i <= Math.floor(Math.max(...xs) / cell);
        i++
      ) {
        for (
          let k = Math.floor(Math.min(...zs) / cell);
          k <= Math.floor(Math.max(...zs) / cell);
          k++
        ) {
          const key = `${i},${k}`;
          let list = this.cells.get(key);
          if (!list) this.cells.set(key, (list = []));
          list.push(p);
        }
      }
    }
  }
  inside(p: Pt, margin = 0): boolean {
    const list =
      this.cells.get(`${Math.floor(p[0] / this.cell)},${Math.floor(p[1] / this.cell)}`) ?? [];
    if (list.some((poly) => pointInRing(p, poly.outer))) return true;
    if (!margin) return false;
    for (const [dx, dz] of [
      [margin, 0],
      [-margin, 0],
      [0, margin],
      [0, -margin],
    ] as const) {
      const q: Pt = [p[0] + dx, p[1] + dz];
      const l2 =
        this.cells.get(`${Math.floor(q[0] / this.cell)},${Math.floor(q[1] / this.cell)}`) ?? [];
      if (l2.some((poly) => pointInRing(q, poly.outer))) return true;
    }
    return false;
  }
}

const yaw = (d: Pt) => r2(Math.atan2(d[0], d[1]));

export interface PropContext {
  osm: Osm;
  net: RoadNetwork;
  height: Height;
  footprints: FootprintIndex;
  /** True where the point is drivable asphalt. */
  onRoad: (p: Pt) => boolean;
}

/** All props for the map, bucketed later by tile. */
export function buildProps(ctx: PropContext): TileProps {
  const { osm, net, height, footprints, onRoad } = ctx;
  const props: TileProps = {
    trees: [],
    lamps: [],
    signals: [],
    parked: [],
    wires: [],
    wirePoles: [],
  };
  const freeSidewalk = (p: Pt) => !onRoad(p) && !footprints.inside(p, 0.8);

  for (const n of osm.nodes.values()) {
    if (n.tags?.natural !== 'tree') continue;
    const r = rng(n.id);
    props.trees.push([
      r2(n.p[0]),
      r2(height(...n.p) + CURB),
      r2(n.p[1]),
      r2(0.8 + r() * 0.5),
      r2(r() * 6.28),
    ]);
  }

  for (const e of net.edges) {
    const { road } = e;
    if (road.cls === 'service') continue;
    const r = rng(e.id * 13 + 5);
    const half = road.width / 2;
    const d0 = e.cutA + 6;
    const d1 = e.length - e.cutB - 6;

    // Street trees on residential streets, lamps everywhere.
    if (d1 > d0) {
      for (let d = d0; d < d1; d += 8) {
        for (const s of [-1, 1]) {
          if (road.cls === 'major' || r() > 0.42) continue;
          const { p, dir } = along(e.pts, d + r() * 2);
          const rt = rightOf(dir);
          const q: Pt = [p[0] + rt[0] * s * (half + 1.1), p[1] + rt[1] * s * (half + 1.1)];
          if (!freeSidewalk(q)) continue;
          props.trees.push([
            r2(q[0]),
            r2(height(...q) + CURB),
            r2(q[1]),
            r2(0.75 + r() * 0.5),
            r2(r() * 6.28),
          ]);
        }
      }
      let side = 1;
      for (let d = d0 + 4; d < d1; d += 30) {
        const { p, dir } = along(e.pts, d);
        const rt = rightOf(dir);
        const q: Pt = [p[0] + rt[0] * side * (half + 0.5), p[1] + rt[1] * side * (half + 0.5)];
        if (freeSidewalk(q)) {
          props.lamps.push([
            r2(q[0]),
            r2(height(...q) + CURB),
            r2(q[1]),
            yaw([-rt[0] * side, -rt[1] * side]),
          ]);
        }
        side = -side;
      }
    }

    // Parked cars in the parking lanes.
    if ((road.parkingLeft || road.parkingRight) && e.length > 30) {
      const p0 = e.cutA + 9;
      const p1 = e.length - e.cutB - 9;
      for (const s of [-1, 1]) {
        if (!(s < 0 ? road.parkingLeft : road.parkingRight)) continue;
        for (let d = p0; d < p1; d += 6.3) {
          if (r() > 0.4) continue;
          const { p, dir } = along(e.pts, d);
          const rt = rightOf(dir);
          const o = s * (half - 1.15);
          const q: Pt = [p[0] + rt[0] * o, p[1] + rt[1] * o];
          // Two-way streets: cars on the left side face the other way.
          const facing: Pt = !road.oneway && s < 0 ? [-dir[0], -dir[1]] : dir;
          props.parked.push([
            r2(q[0]),
            r2(height(...q)),
            r2(q[1]),
            yaw(facing),
            Math.floor(r() * 8),
          ]);
        }
      }
    }
  }

  // Signals: one pole per approach, on the near-right corner, heads facing approaching traffic.
  for (const j of net.junctions.values()) {
    if (!j.signal) continue;
    for (const id of j.edges) {
      const e = net.edges[id]!;
      const l = leaving(e, j.id);
      const cut = e.a === j.id ? e.cutA : e.cutB;
      const inbound: Pt = [-l[0], -l[1]];
      const rt = rightOf(inbound);
      const off = e.road.width / 2 + 0.6;
      const q: Pt = [
        j.p[0] + l[0] * (cut + 0.4) + rt[0] * off,
        j.p[1] + l[1] * (cut + 0.4) + rt[1] * off,
      ];
      props.signals.push([r2(q[0]), r2(height(...q) + CURB), r2(q[1]), yaw(l)]);
    }
  }

  // Trolley wires: a pair over the first lane of each direction, poles every ~35 m with span wires.
  for (const e of net.edges) {
    if (!net.trolleyWays.has(e.road.wayId) || e.length < 4) continue;
    const half = e.road.width / 2;
    const offsets = e.road.oneway
      ? [e.road.laneOffset + (e.road.lanes / 2 - 0.5) * LANE_WIDTH]
      : [LANE_WIDTH * 0.5, -LANE_WIDTH * 0.5];
    const samples = slice(e.pts, 0, e.length, 6);
    for (const o of offsets) {
      for (const w of [-0.3, 0.3]) {
        const line: number[] = [];
        for (const { p, dir } of samples) {
          const rt = rightOf(dir);
          const x = p[0] + rt[0] * (o + w);
          const z = p[1] + rt[1] * (o + w);
          line.push(r2(x), r2(height(x, z) + 5.6), r2(z));
        }
        props.wires.push(line);
      }
    }
    for (let d = 10; d < e.length - 5; d += 35) {
      const { p, dir } = along(e.pts, d);
      const rt = rightOf(dir);
      const a: Pt = [p[0] + rt[0] * (half + 0.4), p[1] + rt[1] * (half + 0.4)];
      const b: Pt = [p[0] - rt[0] * (half + 0.4), p[1] - rt[1] * (half + 0.4)];
      const ya = height(...a) + CURB;
      const yb = height(...b) + CURB;
      props.wirePoles.push([r2(a[0]), r2(ya), r2(a[1])], [r2(b[0]), r2(yb), r2(b[1])]);
      props.wires.push([r2(a[0]), r2(ya + 6.3), r2(a[1]), r2(b[0]), r2(yb + 6.3), r2(b[1])]);
    }
  }
  return props;
}

/** Splits props into per-tile buckets by position. */
export function bucketProps(
  all: TileProps,
  tileOf: (x: number, z: number) => string,
): Map<string, TileProps> {
  const out = new Map<string, TileProps>();
  const get = (k: string) => {
    let t = out.get(k);
    if (!t)
      out.set(k, (t = { trees: [], lamps: [], signals: [], parked: [], wires: [], wirePoles: [] }));
    return t;
  };
  for (const key of ['trees', 'lamps', 'signals', 'parked', 'wirePoles'] as const) {
    for (const item of all[key]) get(tileOf(item[0]!, item[2]!))[key].push(item);
  }
  for (const w of all.wires) get(tileOf(w[0]!, w[2]!)).wires.push(w);
  return out;
}

export type { Edge };
