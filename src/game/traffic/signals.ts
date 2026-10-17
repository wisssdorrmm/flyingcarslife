/**
 * Traffic signal phases. Each signalized junction splits its approaches into two axes (roads
 * roughly parallel to the first approach, and the rest) and cycles green → yellow → all-red for
 * each axis in turn. Junctions are offset so the city doesn't change in lockstep.
 */
import { TRAFFIC } from '../config';
import type { CityIndex } from '../city/format';

export type Light = 'green' | 'yellow' | 'red';

const CYCLE = 2 * (TRAFFIC.green + TRAFFIC.yellow + TRAFFIC.allRed);

export class Signals {
  private signal = new Set<number>();
  /** "node:edge" → axis 0/1. */
  private axis = new Map<string, number>();

  constructor(index: CityIndex) {
    for (const n of index.signals) this.signal.add(n);
    const byNode = new Map<number, { e: number; ang: number }[]>();
    index.edges.forEach((e, i) => {
      for (const [node, atA] of [
        [e.a, true],
        [e.b, false],
      ] as const) {
        if (!this.signal.has(node)) continue;
        // Direction leaving the node along the edge.
        const p = e.pts;
        const n = p.length;
        const [x0, z0, x1, z1] = atA
          ? [p[0]!, p[1]!, p[Math.min(2, n - 2)]!, p[Math.min(3, n - 1)]!]
          : [p[n - 2]!, p[n - 1]!, p[Math.max(n - 4, 0)]!, p[Math.max(n - 3, 1)]!];
        let list = byNode.get(node);
        if (!list) byNode.set(node, (list = []));
        list.push({ e: i, ang: Math.atan2(z1 - z0, x1 - x0) });
      }
    });
    for (const [node, list] of byNode) {
      const ref = list[0]!.ang;
      for (const { e, ang } of list) {
        this.axis.set(`${node}:${e}`, Math.abs(Math.sin(ang - ref)) < 0.5 ? 0 : 1);
      }
    }
  }

  has(node: number): boolean {
    return this.signal.has(node);
  }

  /** Light shown to traffic arriving at `node` along `edge`, at time `t` (s). */
  light(node: number, edge: number, t: number): Light {
    if (!this.signal.has(node)) return 'green';
    const axis = this.axis.get(`${node}:${edge}`) ?? 0;
    const phase = (t + node * 7.31) % CYCLE;
    const slot = TRAFFIC.green + TRAFFIC.yellow + TRAFFIC.allRed;
    const local = axis === 0 ? phase : (phase + slot) % CYCLE;
    if (local < TRAFFIC.green) return 'green';
    if (local < TRAFFIC.green + TRAFFIC.yellow) return 'yellow';
    return 'red';
  }
}
