/**
 * Where street furniture goes. Shared by the renderers (Fixtures, Props) and the physics colliders,
 * so what you see and what you bump into always match.
 */
import * as THREE from 'three';
import type { SignalPhase } from '../systems/trafficSignals';
import { placement } from './instancing';
import { LAYOUT } from './layout';

const { mainHalfWidth: MH, crossHalfWidth: CH, curbHeight: Y, streetLength } = LAYOUT;

/** Rotation about Y that points local +x along a ground direction. */
export const yawFor = (dx: number, dz: number) => Math.atan2(-dz, dx);

export type PropName = 'hydrant' | 'trashCan' | 'bench' | 'utilityBox' | 'manhole' | 'tree';

export function streetLightPlacements(): THREE.Matrix4[] {
  const out: THREE.Matrix4[] = [];
  for (const s of [-1, 1]) {
    for (let d = 18; d <= streetLength - 10; d += 33) {
      for (const side of [-1, 1]) {
        out.push(placement(s * d, Y, side * (MH + 0.45), yawFor(0, -side)));
        out.push(placement(side * (CH + 0.45), Y, s * (d + 4), yawFor(-side, 0)));
      }
    }
  }
  return out;
}

export interface MastArm {
  phase: SignalPhase;
  pole: [number, number];
  /** Ground direction the arm reaches out over the road. */
  dir: [number, number];
  /** Distances along the arm where signal heads hang. */
  heads: number[];
  /** Direction the lenses face (toward approaching traffic). */
  face: [number, number];
}

export const POLE_OFFSET = 1.7;
export const MAST_ARMS: MastArm[] = [
  // Eastbound (+x) traffic uses the south half of Main St; signals on the far (east) side.
  {
    phase: 'A',
    pole: [CH + POLE_OFFSET, MH + POLE_OFFSET],
    dir: [0, -1],
    heads: [5.7, 8.7],
    face: [-1, 0],
  },
  {
    phase: 'A',
    pole: [-CH - POLE_OFFSET, -MH - POLE_OFFSET],
    dir: [0, 1],
    heads: [5.7, 8.7],
    face: [1, 0],
  },
  // Northbound (−z) uses the east half of 1st Ave.
  {
    phase: 'B',
    pole: [CH + POLE_OFFSET, -MH - POLE_OFFSET],
    dir: [-1, 0],
    heads: [5.1, 6.8],
    face: [0, 1],
  },
  {
    phase: 'B',
    pole: [-CH - POLE_OFFSET, MH + POLE_OFFSET],
    dir: [1, 0],
    heads: [5.1, 6.8],
    face: [0, -1],
  },
];
export const ARM_HEIGHT = 6.4;
export const HEAD_CENTER = 5.75;

/** Where every prop goes. Positions are world meters; rotation is about Y. */
export function propPlacements(): Record<PropName, THREE.Matrix4[]> {
  const curbSide = (side: number) => side * (MH + 0.55); // just inside the curb on Main St
  const out: Record<PropName, THREE.Matrix4[]> = {
    hydrant: [],
    trashCan: [],
    bench: [],
    utilityBox: [],
    manhole: [],
    tree: [],
  };

  for (const s of [-1, 1]) {
    // Trees in tree pits along Main Street, between the street lights.
    for (let x = 24; x <= 74; x += 15) {
      for (const side of [-1, 1]) {
        out.tree.push(placement(s * x, Y, side * (MH + 1.3), x * 1.7, 1.35 + ((x * 7) % 3) * 0.08));
      }
    }
    // Trees along 1st Avenue.
    for (let z = 28; z <= 70; z += 16) {
      for (const side of [-1, 1]) {
        out.tree.push(placement(side * (CH + 1.3), Y, s * z, z * 2.3, 1.3));
      }
    }
    // Hydrants near the corners, at the curb.
    out.hydrant.push(placement(s * (CH + 7), Y, curbSide(s), s > 0 ? 0 : Math.PI));
    // Trash cans by the crosswalks.
    out.trashCan.push(placement(s * (CH + 5), Y, curbSide(-s) - s * 0.2, s * 0.7));
    out.trashCan.push(placement(-s * (CH + 0.8), Y, s * (MH + 7.5), 1.2));
    // Benches facing the street.
    out.bench.push(placement(s * 44, Y, s * (MH + 1.1), s > 0 ? Math.PI : 0));
    // Manhole covers in the travel lanes.
    out.manhole.push(placement(s * 33, 0.005, s * 1.6, 0));
  }
  out.utilityBox.push(placement(CH + 3.2, Y, -(MH + 3.6), Math.PI / 2));
  out.manhole.push(placement(-1.8, 0.005, 26, 0));
  return out;
}
