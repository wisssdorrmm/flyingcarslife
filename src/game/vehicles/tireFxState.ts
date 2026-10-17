/**
 * Shared state for tire and impact effects: the car reports where its rear tires touch the road
 * and how hard they slide; impacts queue sparks. TireFx.tsx turns this into smoke, skid marks and
 * sparks.
 */
import * as THREE from 'three';

export interface TireEmitter {
  p: THREE.Vector3 | null;
  slide: number;
  /** Tires lay skid marks; rocket exhaust only smokes. */
  kind: 'tire' | 'exhaust';
}

export const tireEmitters = new Map<number, TireEmitter>();

export function setTireEmitter(
  wheel: number,
  p: { x: number; y: number; z: number } | null,
  slide: number,
  kind: TireEmitter['kind'] = 'tire',
): void {
  let e = tireEmitters.get(wheel);
  if (!e) tireEmitters.set(wheel, (e = { p: null, slide: 0, kind }));
  if (p) (e.p ??= new THREE.Vector3()).set(p.x, p.y, p.z);
  else e.p = null;
  e.slide = slide;
}

export interface SparkBurst {
  x: number;
  y: number;
  z: number;
  /** Push direction of the impact (sparks fly the other way). */
  dx: number;
  dy: number;
  dz: number;
  strength: number;
}

export const sparkQueue: SparkBurst[] = [];

export function emitSparks(
  at: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  strength: number,
): void {
  if (sparkQueue.length > 8) return;
  const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
  // The force pushes the car; the contact is on the opposite side of the body.
  sparkQueue.push({
    x: at.x - (dir.x / l) * 1.2,
    y: at.y + 0.5,
    z: at.z - (dir.z / l) * 1.2,
    dx: dir.x / l,
    dy: dir.y / l,
    dz: dir.z / l,
    strength: Math.min(strength, 3),
  });
}

/** Dust bursts (rocket launch): position and strength. */
export const dustQueue: { x: number; y: number; z: number; strength: number }[] = [];

export function emitDust(at: { x: number; y: number; z: number }, strength = 1): void {
  dustQueue.push({ x: at.x, y: at.y, z: at.z, strength });
}
