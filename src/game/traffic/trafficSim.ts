/**
 * AI traffic on the real road graph. Each car drives "legs": a curved connector through a
 * junction followed by its lane along the next road, ending at that road's stop line. Cars follow
 * the intelligent-driver model behind whatever is ahead (other cars, the player), stop for red
 * lights, and pick their next road at each junction (mostly straight on; buses stay on bus routes).
 * Plain logic, no three.js scene objects; Traffic.tsx renders it.
 */
import { TRAFFIC } from '../config';
import type { CityIndex, RoadEdge } from '../city/format';
import { Signals } from './signals';

const LANE = 3.2;

export interface Leg {
  edge: number;
  /** Travelling a → b. */
  fwd: boolean;
  /** Polyline x/z pairs and cumulative length. */
  pts: number[];
  cum: number[];
  length: number;
  /** Node at the end of the leg (where the stop line is). */
  endNode: number;
  /** Lane index (0 = innermost). */
  lane: number;
}

export interface Agent {
  id: number;
  bus: boolean;
  /** Police cruiser driving in traffic (ignores the player unless told otherwise). */
  police: boolean;
  paint: number;
  leg: Leg;
  next: Leg | null;
  s: number;
  v: number;
  x: number;
  z: number;
  /** Heading (0 faces +z) and travel direction. */
  heading: number;
  dx: number;
  dz: number;
  /** Seconds without moving (for clearing stuck cars). */
  stuck: number;
  wrecked: boolean;
  wreckAge: number;
}

export interface Obstacle {
  x: number;
  z: number;
  /** Speed along its heading (m/s). */
  v: number;
}

interface Out {
  edge: number;
  fwd: boolean;
}

export class TrafficSim {
  readonly agents: Agent[] = [];
  readonly signals: Signals;
  private edges: RoadEdge[];
  private nodes: number[];
  private cum: number[][];
  private out: Out[][];
  private stopA: number[];
  private stopB: number[];
  private nextId = 1;
  time = 0;

  constructor(index: CityIndex) {
    this.edges = index.edges;
    this.nodes = index.nodes;
    this.signals = new Signals(index);
    const nNodes = index.nodes.length / 3;
    this.out = Array.from({ length: nNodes }, () => []);
    const widest = new Array<number>(nNodes).fill(0);
    this.cum = index.edges.map((e, i) => {
      this.out[e.a]!.push({ edge: i, fwd: true });
      if (!e.oneway) this.out[e.b]!.push({ edge: i, fwd: false });
      widest[e.a] = Math.max(widest[e.a]!, e.width / 2);
      widest[e.b] = Math.max(widest[e.b]!, e.width / 2);
      const c = [0];
      for (let k = 2; k < e.pts.length; k += 2) {
        c.push(c.at(-1)! + Math.hypot(e.pts[k]! - e.pts[k - 2]!, e.pts[k + 1]! - e.pts[k - 1]!));
      }
      return c;
    });
    // Stop lines: clear of the widest crossing road plus a crosswalk.
    const stop = (e: RoadEdge, node: number) =>
      Math.min(e.length * 0.4, (index.nodes.length ? widest[node]! : 0) + 4.5);
    this.stopA = index.edges.map((e) =>
      this.out[e.a]!.length + this.inCount(e.a) > 2 ? stop(e, e.a) : 2,
    );
    this.stopB = index.edges.map((e) =>
      this.out[e.b]!.length + this.inCount(e.b) > 2 ? stop(e, e.b) : 2,
    );
  }

  private inCount(node: number): number {
    let n = 0;
    for (const e of this.edges) if (e.oneway && e.b === node) n++;
    return n;
  }

  /** Point and direction at distance d along edge e (a → b). */
  private at(e: number, d: number): [number, number, number, number] {
    const edge = this.edges[e]!;
    const c = this.cum[e]!;
    const p = edge.pts;
    let i = 1;
    while (i < c.length - 1 && c[i]! < d) i++;
    const seg = Math.max(c[i]! - c[i - 1]!, 1e-6);
    const t = Math.min(Math.max((d - c[i - 1]!) / seg, 0), 1);
    const dx = (p[i * 2]! - p[(i - 1) * 2]!) / seg;
    const dz = (p[i * 2 + 1]! - p[(i - 1) * 2 + 1]!) / seg;
    return [p[(i - 1) * 2]! + dx * seg * t, p[(i - 1) * 2 + 1]! + dz * seg * t, dx, dz];
  }

  private laneOffset(e: RoadEdge, fwd: boolean, lane: number): number {
    if (e.oneway) return e.laneOffset + (lane - e.lanes / 2 + 0.5) * LANE;
    return (fwd ? 1 : -1) * (lane + 0.5) * LANE;
  }

  private lanesFor(e: RoadEdge, fwd: boolean): number {
    if (e.oneway) return e.lanes;
    return Math.max(1, fwd ? e.lanesFwd : e.lanes - e.lanesFwd);
  }

  /** Lane polyline along an edge, from distance `from` (along travel) to its stop line. */
  private laneLeg(edge: number, fwd: boolean, lane: number, from?: number): Leg {
    const e = this.edges[edge]!;
    const startStop = fwd ? this.stopA[edge]! : this.stopB[edge]!;
    const endStop = fwd ? this.stopB[edge]! : this.stopA[edge]!;
    const d0 = from ?? startStop;
    const d1 = Math.max(d0 + 0.5, e.length - endStop);
    const off = this.laneOffset(e, fwd, lane);
    const pts: number[] = [];
    const n = Math.max(1, Math.ceil((d1 - d0) / 3));
    for (let k = 0; k <= n; k++) {
      const along = d0 + ((d1 - d0) * k) / n;
      const [x, z, dx, dz] = this.at(edge, fwd ? along : e.length - along);
      // Right of a → b is (−dz, dx).
      pts.push(x - dz * off, z + dx * off);
    }
    return this.finish({ edge, fwd, pts, cum: [], length: 0, endNode: fwd ? e.b : e.a, lane });
  }

  private finish(leg: Leg): Leg {
    leg.cum = [0];
    for (let k = 2; k < leg.pts.length; k += 2) {
      leg.cum.push(
        leg.cum.at(-1)! +
          Math.hypot(leg.pts[k]! - leg.pts[k - 2]!, leg.pts[k + 1]! - leg.pts[k - 1]!),
      );
    }
    leg.length = leg.cum.at(-1)!;
    return leg;
  }

  /** Next leg after `leg`: a curve through the junction joined to the chosen road's lane. */
  private nextLeg(leg: Leg, bus: boolean, rand: () => number): Leg {
    const options = this.out[leg.endNode]!.filter((o) => o.edge !== leg.edge);
    const all = options.length ? options : this.out[leg.endNode]!;
    // Direction we arrive in.
    const n = leg.pts.length;
    const ax = leg.pts[n - 2]! - leg.pts[n - 4]!;
    const az = leg.pts[n - 1]! - leg.pts[n - 3]!;
    const al = Math.hypot(ax, az) || 1;
    const scored = all.map((o) => {
      const e = this.edges[o.edge]!;
      const [, , dx, dz] = this.at(o.edge, o.fwd ? 1 : e.length - 1);
      const dir = o.fwd ? [dx, dz] : [-dx, -dz];
      const straight = (dir[0]! * ax + dir[1]! * az) / al;
      let w = 0.4 + Math.max(0, straight) * 2.2;
      if (bus) w *= e.bus ? 4 : 0.2;
      if (e.cls === 'service') w *= 0.15;
      return { o, w };
    });
    const total = scored.reduce((s, c) => s + c.w, 0);
    let r = rand() * total;
    let pick = scored[0]!.o;
    for (const c of scored) {
      r -= c.w;
      if (r <= 0) {
        pick = c.o;
        break;
      }
    }
    const e = this.edges[pick.edge]!;
    const lane = Math.min(leg.lane, this.lanesFor(e, pick.fwd) - 1);
    const lanePart = this.laneLeg(pick.edge, pick.fwd, lane);
    // Cubic curve from our stop line to the new lane's start.
    const p0x = leg.pts[n - 2]!;
    const p0z = leg.pts[n - 1]!;
    const p1x = lanePart.pts[0]!;
    const p1z = lanePart.pts[1]!;
    const d1x = lanePart.pts[2]! - p1x;
    const d1z = lanePart.pts[3]! - p1z;
    const d1l = Math.hypot(d1x, d1z) || 1;
    const k = Math.hypot(p1x - p0x, p1z - p0z) * 0.42;
    const c0x = p0x + (ax / al) * k;
    const c0z = p0z + (az / al) * k;
    const c1x = p1x - (d1x / d1l) * k;
    const c1z = p1z - (d1z / d1l) * k;
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      const u = 1 - t;
      pts.push(
        u * u * u * p0x + 3 * u * u * t * c0x + 3 * u * t * t * c1x + t * t * t * p1x,
        u * u * u * p0z + 3 * u * u * t * c0z + 3 * u * t * t * c1z + t * t * t * p1z,
      );
    }
    lanePart.pts = pts.concat(lanePart.pts);
    return this.finish(lanePart);
  }

  /** Adds a car on `edge` at fraction `t` along it (direction and lane chosen at random). */
  spawn(edge: number, t: number, bus: boolean, rand: () => number): Agent | null {
    const e = this.edges[edge]!;
    const fwd = e.oneway || rand() < 0.5;
    const lanes = this.lanesFor(e, fwd);
    const lane = bus ? lanes - 1 : Math.floor(rand() * lanes);
    const start = (fwd ? this.stopA[edge]! : this.stopB[edge]!) + 1;
    const end = e.length - (fwd ? this.stopB[edge]! : this.stopA[edge]!);
    if (end - start < 8) return null;
    const leg = this.laneLeg(edge, fwd, lane, start + (end - start - 6) * t);
    const a: Agent = {
      id: this.nextId++,
      bus,
      police: false,
      paint: Math.floor(rand() * 8),
      leg,
      next: null,
      s: 0,
      v: (TRAFFIC.speed[e.cls] ?? 10) * 0.7,
      x: leg.pts[0]!,
      z: leg.pts[1]!,
      heading: 0,
      dx: 0,
      dz: 1,
      stuck: 0,
      wrecked: false,
      wreckAge: 0,
    };
    this.place(a);
    this.agents.push(a);
    return a;
  }

  /**
   * Adds a car on a given road, direction and distance along it (travel direction), in the
   * rightmost lane — used to put a police car right behind the player in a test scene.
   */
  spawnOn(
    edge: number,
    fwd: boolean,
    along: number,
    opts: { police?: boolean; speed?: number } = {},
  ): Agent {
    const e = this.edges[edge]!;
    const lane = this.lanesFor(e, fwd) - 1;
    const leg = this.laneLeg(edge, fwd, lane, Math.max(0, along));
    const a: Agent = {
      id: this.nextId++,
      bus: false,
      police: !!opts.police,
      paint: 1,
      leg,
      next: null,
      s: 0,
      v: opts.speed ?? 8,
      x: leg.pts[0]!,
      z: leg.pts[1]!,
      heading: 0,
      dx: 0,
      dz: 1,
      stuck: 0,
      wrecked: false,
      wreckAge: 0,
    };
    this.place(a);
    this.agents.push(a);
    return a;
  }

  remove(a: Agent): void {
    const i = this.agents.indexOf(a);
    if (i >= 0) this.agents.splice(i, 1);
  }

  private place(a: Agent): void {
    const { pts, cum } = a.leg;
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < a.s) i++;
    const seg = Math.max(cum[i]! - cum[i - 1]!, 1e-6);
    const t = Math.min(Math.max((a.s - cum[i - 1]!) / seg, 0), 1);
    const dx = (pts[i * 2]! - pts[(i - 1) * 2]!) / seg;
    const dz = (pts[i * 2 + 1]! - pts[(i - 1) * 2 + 1]!) / seg;
    a.x = pts[(i - 1) * 2]! + dx * seg * t;
    a.z = pts[(i - 1) * 2 + 1]! + dz * seg * t;
    a.dx = dx;
    a.dz = dz;
    a.heading = Math.atan2(dx, dz);
  }

  /** Advances every car by dt; `others` are obstacles that aren't AI cars (the player). */
  step(dt: number, others: Obstacle[], rand: () => number): void {
    this.time += dt;
    const list = this.agents;
    for (const a of list) {
      if (a.wrecked) continue;
      const e = this.edges[a.leg.edge]!;
      const v0 = (TRAFFIC.speed[e.cls] ?? 10) * (a.bus ? 0.8 : 1);
      const len = a.bus ? 11.5 : 4.5;

      // Gap to whatever is ahead in our path (cars, wrecks, the player).
      let gap = Infinity;
      let lv = 0;
      const check = (x: number, z: number, v: number, otherLen: number) => {
        const rx = x - a.x;
        const rz = z - a.z;
        const along = rx * a.dx + rz * a.dz;
        if (along <= 0 || along > 45) return;
        const lateral = Math.abs(rx * a.dz - rz * a.dx);
        if (lateral > 1.9) return;
        const g = along - (len + otherLen) / 2;
        if (g < gap) {
          gap = g;
          lv = v;
        }
      };
      for (const o of list) if (o !== a) check(o.x, o.z, o.wrecked ? 0 : o.v, o.bus ? 11.5 : 4.5);
      for (const o of others) check(o.x, o.z, o.v, 4.6);

      // Red (or a yellow we can stop for): the stop line is an obstacle.
      const toStop = a.leg.length - a.s;
      const light = this.signals.light(a.leg.endNode, a.leg.edge, this.time);
      if (light !== 'green') {
        const canStop = (a.v * a.v) / (2 * TRAFFIC.brake) < toStop + 1;
        if (light === 'red' || canStop) {
          if (toStop < gap) {
            gap = Math.max(toStop - 0.5, 0.01);
            lv = 0;
          }
        }
      }

      // Intelligent-driver model.
      const sStar =
        TRAFFIC.minGap +
        Math.max(
          0,
          a.v * TRAFFIC.headway +
            (a.v * (a.v - lv)) / (2 * Math.sqrt(TRAFFIC.accel * TRAFFIC.brake)),
        );
      const free = 1 - (a.v / v0) ** 4;
      const inter = gap === Infinity ? 0 : (sStar / Math.max(gap, 0.1)) ** 2;
      const acc = TRAFFIC.accel * (free - inter);
      a.v = Math.max(0, Math.min(v0 * 1.05, a.v + Math.max(acc, -9) * dt));
      a.stuck = a.v < 0.3 ? a.stuck + dt : 0;

      a.s += a.v * dt;
      while (a.s >= a.leg.length) {
        a.s -= a.leg.length;
        a.leg = a.next ?? this.nextLeg(a.leg, a.bus, rand);
        a.next = null;
      }
      // Decide the next road early so the stop logic knows where we're headed.
      if (!a.next && a.leg.length - a.s < 30) a.next = this.nextLeg(a.leg, a.bus, rand);
      this.place(a);
    }
  }

  /** Node position (for spawning checks). */
  nodePos(i: number): [number, number] {
    return [this.nodes[i * 3]!, this.nodes[i * 3 + 2]!];
  }

  get edgeCount(): number {
    return this.edges.length;
  }

  edge(i: number): RoadEdge {
    return this.edges[i]!;
  }
}

/** The running simulation, for systems that need to see traffic (police, pedestrians). */
export const trafficRef: { sim: TrafficSim | null } = { sim: null };
