import type { City } from '../city/cityData';
import { CURB } from '../city/format';
import { TEST_SCENES } from '../config';

const C = TEST_SCENES.carPark;
const SLAB = 0.35;

export interface Box {
  /** Center and half extents in the car park's frame; optional tilt about x (ramps). */
  c: [number, number, number];
  h: [number, number, number];
  tilt?: number;
  mat: 'concrete' | 'roof' | 'glass' | 'rail' | 'planter' | 'shrub' | 'line';
}

/**
 * Layout of the multi-level car park (frame: origin at the ground slab's center, +z along the
 * ramps). Each deck has a main slab plus landing strips at both ends of the ramp lane; ramps in
 * the lane climb one level each and stack exactly one level apart, so there's headroom.
 */
export function carParkLayout(): {
  boxes: Box[];
  roofY: number;
  ramps: { z0: number; z1: number; x: number };
} {
  const W = C.width;
  const L = C.length;
  const rw = C.rampWidth;
  const H = C.levelHeight;
  const xMain0 = -W / 2;
  const xMain1 = W / 2 - rw;
  const xStrip = W / 2 - rw / 2;
  const z0 = -L / 2 + 12;
  const z1 = L / 2 - 12;
  const boxes: Box[] = [];
  const slab = (x0: number, x1: number, za: number, zb: number, top: number, mat: Box['mat']) =>
    boxes.push({
      c: [(x0 + x1) / 2, top - SLAB / 2, (za + zb) / 2],
      h: [(x1 - x0) / 2, SLAB / 2, (zb - za) / 2],
      mat,
    });

  // Ground slab (the car drives in from the street at either short end).
  slab(-W / 2, W / 2, -L / 2, L / 2, 0.12, 'concrete');

  for (let i = 1; i <= C.levels; i++) {
    const top = i * H;
    const roof = i === C.levels;
    const mat = roof ? 'roof' : 'concrete';
    slab(xMain0, xMain1, -L / 2, L / 2, top, mat);
    slab(xMain1, W / 2, -L / 2, z0, top, mat);
    slab(xMain1, W / 2, z1, L / 2, top, mat);

    // Edges: low concrete walls below, glass barriers with a rail on the roof.
    const wallH = roof ? 1.1 : 1.0;
    const wallMat = roof ? 'glass' : 'concrete';
    const t = roof ? 0.05 : 0.2;
    const edge = (cx: number, cz: number, hx: number, hz: number) => {
      boxes.push({ c: [cx, top + wallH / 2, cz], h: [hx, wallH / 2, hz], mat: wallMat });
      if (roof)
        boxes.push({
          c: [cx, top + wallH + 0.03, cz],
          h: [hx + 0.02, 0.04, hz + 0.02],
          mat: 'rail',
        });
    };
    edge(-W / 2 + t, 0, t, L / 2);
    edge(W / 2 - t, 0, t, L / 2);
    edge(0, -L / 2 + t, W / 2, t);
    edge(0, L / 2 - t, W / 2, t);
    // Guard along the ramp opening (cars come up through it from the level below).
    edge(xMain1 - t, (z0 + z1) / 2, t, (z1 - z0) / 2);

    // Parking bay lines on every deck.
    for (let z = -L / 2 + 4; z < L / 2 - 4; z += 2.7) {
      boxes.push({ c: [xMain0 + 2.6, top + 0.006, z], h: [2.5, 0.006, 0.06], mat: 'line' });
      boxes.push({ c: [xMain1 - 2.6, top + 0.006, z], h: [2.5, 0.006, 0.06], mat: 'line' });
    }

    if (roof) {
      // Planters along the street side.
      for (let z = -L / 2 + 6; z < L / 2 - 4; z += 12) {
        boxes.push({ c: [-W / 2 + 1.0, top + 0.35, z], h: [0.55, 0.35, 1.6], mat: 'planter' });
        boxes.push({ c: [-W / 2 + 1.0, top + 0.95, z], h: [0.45, 0.35, 1.4], mat: 'shrub' });
      }
    }
  }

  // Ramps: each climbs one level along the lane from z0 to z1.
  const len = z1 - z0;
  const tilt = -Math.atan2(H, len);
  const sl = Math.hypot(len, H);
  for (let i = 0; i < C.levels; i++) {
    const midTop = i * H + H / 2;
    boxes.push({
      c: [xStrip, midTop - (SLAB / 2) * Math.cos(tilt), (z0 + z1) / 2],
      h: [rw / 2 - 0.3, SLAB / 2, sl / 2],
      tilt,
      mat: 'concrete',
    });
  }

  // Pillars between the decks (edges and the line between bays and the ramp lane).
  for (let i = 0; i < C.levels; i++) {
    const y0 = i * H;
    for (const x of [-W / 2 + 0.6, xMain1 - 0.4]) {
      for (let z = -L / 2 + 0.6; z <= L / 2 - 0.6; z += 9.8) {
        boxes.push({ c: [x, y0 + H / 2, z], h: [0.3, H / 2 - SLAB / 2, 0.3], mat: 'concrete' });
      }
    }
  }
  return { boxes, roofY: C.levels * H, ramps: { z0, z1, x: xStrip } };
}

/** Base height of the car park's ground slab (on the lot, at street level). */
export function carParkBase(city: City): number {
  const hx = C.width / 2;
  const hz = C.length / 2;
  const ys = [
    [-hx, -hz],
    [hx, -hz],
    [-hx, hz],
    [hx, hz],
    [0, 0],
  ].map(([dx, dz]) => city.heightAt(C.x + dx!, C.z + dz!));
  return ys.reduce((a, b) => a + b, 0) / ys.length + CURB;
}

/**
 * Where a ground vehicle inside the car park should head to reach `target`: when the target is
 * on a higher deck it follows the ramp lane up (ramp → turn onto the deck → back along the bays
 * → next ramp). Returns null when it can just drive straight at the target.
 */
export function carParkWaypoint(
  base: number,
  p: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
): { x: number; z: number } | null {
  const W = C.width;
  const L = C.length;
  const rw = C.rampWidth;
  const lx = p.x - C.x;
  const lz = p.z - C.z;
  const inside = Math.abs(lx) < W / 2 + 6 && Math.abs(lz) < L / 2 + 20;
  if (!inside) return null;
  const xMain1 = W / 2 - rw;
  const xStrip = W / 2 - rw / 2;
  const z0 = -L / 2 + 12;
  const z1 = L / 2 - 12;
  const to = (x: number, z: number) => ({ x: C.x + x, z: C.z + z });
  // Already on a ramp: finish it.
  const deckBelow = Math.floor((p.y - base + 0.3) / C.levelHeight) * C.levelHeight;
  if (lx > xMain1 - 0.5 && lz > z0 && lz < z1 && p.y - base - deckBelow > 0.4)
    return to(xStrip, z1 + 6);
  const level = Math.round((p.y - base) / C.levelHeight);
  const targetLevel = Math.round((target.y - base) / C.levelHeight);
  if (targetLevel <= level) return null;
  if (lx > xMain1 - 0.5) {
    // In the ramp lane: below the ramp end, climb; past it, turn onto the deck.
    return lz < z1 + 1 ? to(xStrip, z1 + 6) : to(xMain1 - 9, z1 + 3);
  }
  // On a deck's bays: drive back along it, then swing into the lane below the next ramp.
  return lz > z0 + 2 ? to(xMain1 - 7, z0 - 5) : to(xStrip, z0 - 5);
}
