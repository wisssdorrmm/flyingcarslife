/**
 * Pedestrian logic: walk along a sidewalk of the road graph (right-hand side of travel), pick a
 * new street at each corner, flee from a car racing at them, and fall down when hit (getting up
 * again after a while). No scene objects here; Pedestrians.tsx renders.
 */
import { PEDESTRIANS } from '../config';
import type { CityIndex, RoadEdge } from '../city/format';

export type PedState = 'walk' | 'idle' | 'flee' | 'down' | 'look';

export interface Ped {
  id: number;
  edge: number;
  fwd: boolean;
  /** Distance along the edge in travel direction. */
  d: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  state: PedState;
  timer: number;
  /** Flee direction. */
  fx: number;
  fz: number;
  /** Seconds idling before walking on. */
  pause: number;
  tint: number;
  /** Looking up at a launch: films it on a phone instead of pointing. */
  phone: boolean;
}

export interface Danger {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

/** Fired when a pedestrian is hit (police use this later). */
export const pedHitHooks = new Set<(p: Ped) => void>();

export class PedSim {
  readonly peds: Ped[] = [];
  private edges: RoadEdge[];
  private cum: number[][];
  private byNode: number[][];
  private nextId = 1;

  constructor(index: CityIndex) {
    this.edges = index.edges;
    this.byNode = Array.from({ length: index.nodes.length / 3 }, () => []);
    this.cum = index.edges.map((e, i) => {
      this.byNode[e.a]!.push(i);
      this.byNode[e.b]!.push(i);
      const c = [0];
      for (let k = 2; k < e.pts.length; k += 2) {
        c.push(c.at(-1)! + Math.hypot(e.pts[k]! - e.pts[k - 2]!, e.pts[k + 1]! - e.pts[k - 1]!));
      }
      return c;
    });
  }

  get edgeCount(): number {
    return this.edges.length;
  }

  edge(i: number): RoadEdge {
    return this.edges[i]!;
  }

  /** Walking-line point for a pedestrian at distance d along its edge. */
  private point(edge: number, fwd: boolean, d: number): [number, number, number] {
    const e = this.edges[edge]!;
    const c = this.cum[edge]!;
    const along = fwd ? d : e.length - d;
    let i = 1;
    while (i < c.length - 1 && c[i]! < along) i++;
    const seg = Math.max(c[i]! - c[i - 1]!, 1e-6);
    const t = Math.min(Math.max((along - c[i - 1]!) / seg, 0), 1);
    let dx = (e.pts[i * 2]! - e.pts[(i - 1) * 2]!) / seg;
    let dz = (e.pts[i * 2 + 1]! - e.pts[(i - 1) * 2 + 1]!) / seg;
    const x = e.pts[(i - 1) * 2]! + dx * seg * t;
    const z = e.pts[(i - 1) * 2 + 1]! + dz * seg * t;
    if (!fwd) {
      dx = -dx;
      dz = -dz;
    }
    // Right of travel: (−dz, dx).
    const off = e.width / 2 + PEDESTRIANS.sidewalkOffset;
    return [x - dz * off, z + dx * off, Math.atan2(dx, dz)];
  }

  spawn(edge: number, t: number, rand: () => number): Ped {
    const e = this.edges[edge]!;
    const fwd = rand() < 0.5;
    const d = e.length * t;
    const [x, z, heading] = this.point(edge, fwd, d);
    const p: Ped = {
      id: this.nextId++,
      edge,
      fwd,
      d,
      x,
      z,
      heading,
      speed: PEDESTRIANS.walkSpeed * (0.8 + rand() * 0.4),
      state: 'walk',
      timer: 0,
      fx: 0,
      fz: 0,
      pause: 0,
      tint: Math.floor(rand() * 6),
      phone: false,
    };
    this.peds.push(p);
    return p;
  }

  /**
   * Someone jumping out of a car at (x, z) and running off in direction (fx, fz) (a carjacked
   * driver). They join the nearest sidewalk afterwards.
   */
  spawnFleeing(x: number, z: number, fx: number, fz: number, rand: () => number): Ped {
    let best = 0;
    let bestD = Infinity;
    this.edges.forEach((e, i) => {
      if (e.cls === 'service') return;
      const m = Math.floor(e.pts.length / 4) * 2;
      const d = Math.hypot(e.pts[m]! - x, e.pts[m + 1]! - z);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    const p = this.spawn(best, 0.5, rand);
    const l = Math.hypot(fx, fz) || 1;
    p.x = x;
    p.z = z;
    p.fx = fx / l;
    p.fz = fz / l;
    p.heading = Math.atan2(p.fx, p.fz);
    p.state = 'flee';
    p.timer = 3.5;
    return p;
  }

  remove(p: Ped): void {
    const i = this.peds.indexOf(p);
    if (i >= 0) this.peds.splice(i, 1);
  }

  /** A rocket launch at (x, z): people nearby stop and look up (some get their phones out). */
  lookUp(x: number, z: number, rand: () => number): void {
    for (const p of this.peds) {
      if (p.state === 'down' || Math.hypot(p.x - x, p.z - z) > PEDESTRIANS.lookRadius) continue;
      p.state = 'look';
      p.timer = PEDESTRIANS.lookSeconds * (0.8 + rand() * 0.4);
      p.phone = rand() < PEDESTRIANS.phoneShare;
    }
  }

  step(dt: number, danger: Danger | null, rand: () => number): void {
    for (const p of this.peds) {
      p.timer = Math.max(0, p.timer - dt);
      if (p.state === 'down') {
        if (p.timer <= 0) p.state = 'idle';
        continue;
      }
      if (p.state === 'look') {
        if (p.timer <= 0) {
          p.state = 'walk';
        } else if (danger) {
          // Keep facing the car as it climbs.
          p.heading = Math.atan2(danger.x - p.x, danger.z - p.z);
        }
        continue;
      }

      if (danger) {
        const rx = p.x - danger.x;
        const rz = p.z - danger.z;
        const dist = Math.hypot(rx, rz);
        const sp = Math.hypot(danger.vx, danger.vz);
        if (dist < PEDESTRIANS.hitDistance && sp > 4) {
          p.state = 'down';
          p.timer = PEDESTRIANS.downSeconds;
          for (const hook of pedHitHooks) hook(p);
          continue;
        }
        // Coming at us fast: run away sideways from the car's path.
        const approaching = (danger.vx * rx + danger.vz * rz) / Math.max(dist * sp, 1e-3) > 0.5;
        if (
          dist < PEDESTRIANS.fleeDistance &&
          sp > PEDESTRIANS.fleeSpeed &&
          approaching &&
          p.state !== 'flee'
        ) {
          const side = Math.sign(danger.vx * rz - danger.vz * rx) || 1;
          p.fx = (-danger.vz / sp) * side;
          p.fz = (danger.vx / sp) * side;
          p.state = 'flee';
          p.timer = PEDESTRIANS.fleeSeconds;
        }
      }

      if (p.state === 'flee') {
        p.x += p.fx * PEDESTRIANS.runSpeed * dt;
        p.z += p.fz * PEDESTRIANS.runSpeed * dt;
        p.heading = Math.atan2(p.fx, p.fz);
        if (p.timer <= 0) {
          p.state = 'idle';
          p.pause = 1 + rand() * 2;
        }
        continue;
      }
      if (p.state === 'idle') {
        p.pause -= dt;
        if (p.pause > 0) continue;
        p.state = 'walk';
      }

      // Walk the sidewalk line; at the corner pick another street.
      const e = this.edges[p.edge]!;
      p.d += p.speed * dt;
      if (p.d >= e.length) {
        const node = p.fwd ? e.b : e.a;
        const options = this.byNode[node]!.filter(
          (i) => i !== p.edge && this.edges[i]!.cls !== 'service',
        );
        const next = options.length ? options[Math.floor(rand() * options.length)]! : p.edge;
        const ne = this.edges[next]!;
        p.fwd = next === p.edge ? !p.fwd : ne.a === node;
        p.edge = next;
        p.d = 0;
        if (rand() < 0.15) {
          p.state = 'idle';
          p.pause = 1 + rand() * 3;
        }
      }
      // Ease toward the line (smooths corners and getting back after fleeing).
      const [tx, tz] = this.point(p.edge, p.fwd, p.d + 1.5);
      const dx = tx - p.x;
      const dz = tz - p.z;
      const l = Math.hypot(dx, dz);
      if (l > 1e-3) {
        const step = Math.min(l, Math.max(p.speed, l > 3 ? 2.5 : p.speed) * dt);
        p.x += (dx / l) * step;
        p.z += (dz / l) * step;
        p.heading = Math.atan2(dx, dz);
      }
    }
  }
}

/** The running pedestrian simulation, for other systems (hijacking spawns the fleeing driver). */
export const pedRef: { sim: PedSim | null } = { sim: null };
