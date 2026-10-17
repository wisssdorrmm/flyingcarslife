/**
 * Crumple damage: dents the car body where it hits things. Vertices near the impact point are
 * pushed inward with a smooth falloff; every vertex has a cap on how far it can be pushed in
 * total, so repeated hits crush a corner without turning the car inside out.
 */
import * as THREE from 'three';
import { VEHICLE } from '../config';

interface Part {
  attr: THREE.BufferAttribute;
  /** Total displacement so far, per vertex (m). */
  dent: Float32Array;
}

export class CarDeformer {
  private parts: Part[] = [];
  private cooldown = 0;

  /** `meshes` are body meshes whose geometry is in the car's frame (unique to this car). */
  constructor(meshes: THREE.Mesh[]) {
    for (const m of meshes) {
      const attr = m.geometry.getAttribute('position');
      if (!(attr instanceof THREE.BufferAttribute)) continue;
      attr.setUsage(THREE.DynamicDrawUsage);
      this.parts.push({ attr, dent: new Float32Array(attr.count) });
    }
  }

  /** Deepest dent so far (m) and how many vertices moved (debug). */
  stats(): { max: number; moved: number } {
    let max = 0;
    let moved = 0;
    for (const { dent } of this.parts) {
      for (const d of dent) {
        if (d > 0) moved++;
        if (d > max) max = d;
      }
    }
    return { max, moved };
  }

  /** Call once per frame. */
  tick(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
  }

  /**
   * Dents the body around `point` (car frame), pushing along `dir` (car frame, into the car).
   * `strength` 0..1 sets the radius and depth.
   */
  hit(point: THREE.Vector3, dir: THREE.Vector3, strength: number): void {
    if (this.cooldown > 0 || strength <= 0) return;
    this.cooldown = 0.12;
    const s = Math.min(1, strength);
    const radius = VEHICLE.dentRadius * (0.55 + 0.45 * s);
    const depth = VEHICLE.dentDepth * (0.3 + 0.7 * s);
    const r2 = radius * radius;
    const d = dir.clone().normalize();
    for (const { attr, dent } of this.parts) {
      const a = attr.array as Float32Array;
      let moved = false;
      for (let i = 0; i < attr.count; i++) {
        const o = i * 3;
        const dx = a[o]! - point.x;
        const dy = a[o + 1]! - point.y;
        const dz = a[o + 2]! - point.z;
        const dist2 = dx * dx + dy * dy + dz * dz;
        if (dist2 > r2) continue;
        const left = VEHICLE.maxDent - dent[i]!;
        if (left <= 0) continue;
        const f = 1 - Math.sqrt(dist2) / radius;
        // A little noise so dents look crumpled rather than pressed.
        const push = Math.min(left, depth * f * f * (0.8 + 0.4 * Math.sin(i * 12.9898)));
        a[o] = a[o]! + d.x * push;
        a[o + 1] = a[o + 1]! + d.y * push * 0.6;
        a[o + 2] = a[o + 2]! + d.z * push;
        dent[i] = dent[i]! + push;
        moved = true;
      }
      if (moved) attr.needsUpdate = true;
    }
  }
}
