/**
 * Per-frame mission world state, shared by the mission logic (MissionRunner), the renderers
 * (MissionWorld) and the police gunfire layer. Plain mutable objects: no React re-renders.
 */
import * as THREE from 'three';
import { MISSIONS } from '../config';
import { DOOR_LOCAL } from './planeModel';

export type MarkerKind = 'objective' | 'next' | 'start' | 'hideout';

export interface Marker {
  x: number;
  y: number;
  z: number;
  radius: number;
  kind: MarkerKind;
}

export type ActorAnim = 'idle' | 'walk' | 'run';

/** A person in a mission (crew, pilot). Moves along a path at a speed, then waits. */
export class Actor {
  readonly pos = new THREE.Vector3();
  heading = 0;
  anim: ActorAnim = 'idle';
  visible = true;
  /** 0..1, for fading out once they're in the car. */
  opacity = 1;
  path: THREE.Vector3[] = [];
  speed = 0;
  /** Sidestep offset (m), decays back to 0. */
  dodge = 0;
  constructor(
    readonly id: string,
    readonly tint: string,
  ) {}

  /** Walks/runs toward the next path point; returns true when the path is done. */
  step(dt: number, heightAt: (x: number, z: number) => number): boolean {
    let budget = this.speed * dt;
    while (budget > 0 && this.path.length) {
      const target = this.path[0]!;
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d <= budget) {
        this.pos.x = target.x;
        this.pos.z = target.z;
        this.path.shift();
        budget -= d;
      } else {
        this.pos.x += (dx / d) * budget;
        this.pos.z += (dz / d) * budget;
        this.heading = Math.atan2(dx, dz);
        budget = 0;
      }
    }
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.anim = this.path.length ? (this.speed > 3 ? 'run' : 'walk') : 'idle';
    return this.path.length === 0;
  }
}

export type PlaneMode = 'parked' | 'rolling' | 'airborne' | 'gone' | 'hijacked';

/** The cargo plane: parked with engines idling, then a take-off roll down the road and climb-out. */
export class PlaneSim {
  readonly pos = new THREE.Vector3();
  heading: number;
  speed = 0;
  climb = 0;
  /** Nose-up pitch while rotating and climbing (rad). */
  pitch = 0;
  mode: PlaneMode = 'parked';
  /** Propeller speed 0..1 (spins up before the roll). */
  props = 0.15;
  private readonly origin: THREE.Vector3;

  constructor(x: number, y: number, z: number, heading: number) {
    this.pos.set(x, y, z);
    this.origin = this.pos.clone();
    this.heading = heading;
  }

  /** World position of the cargo door at ground level. */
  door(out = new THREE.Vector3()): THREE.Vector3 {
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    return out.set(
      this.pos.x + DOOR_LOCAL.x * c + DOOR_LOCAL.z * s,
      this.pos.y,
      this.pos.z - DOOR_LOCAL.x * s + DOOR_LOCAL.z * c,
    );
  }

  velocity(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(
      Math.sin(this.heading) * this.speed,
      this.climb,
      Math.cos(this.heading) * this.speed,
    );
  }

  startRoll(): void {
    if (this.mode === 'parked') this.mode = 'rolling';
  }

  hijack(): void {
    this.mode = 'hijacked';
  }

  update(dt: number, groundAt: (x: number, z: number) => number, untilDepart: number | null): void {
    const h = MISSIONS.hijack;
    // Engines run up in the last 15 s before departure.
    const wantProps =
      this.mode === 'hijacked'
        ? 0
        : this.mode === 'parked'
          ? untilDepart !== null && untilDepart < 15
            ? 0.75
            : 0.15
          : 1;
    this.props += (wantProps - this.props) * Math.min(1, dt * 0.8);
    if (this.mode === 'rolling') {
      this.speed += h.rollAccel * dt;
      if (this.speed >= h.liftoffSpeed) this.mode = 'airborne';
    } else if (this.mode === 'airborne') {
      this.speed = Math.min(this.speed + h.rollAccel * dt, h.liftoffSpeed * 1.5);
      this.climb = Math.min(this.climb + 4 * dt, h.climbRate);
      this.pitch = Math.min(this.pitch + dt * 0.25, 0.16);
      if (this.pos.y - this.origin.y > 220) this.mode = 'gone';
    } else if (this.mode === 'hijacked') {
      this.speed = Math.max(0, this.speed - 6 * dt);
    }
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    if (this.mode === 'airborne' || this.mode === 'gone') {
      this.pos.y += this.climb * dt;
    } else {
      this.pos.y = groundAt(this.pos.x, this.pos.z);
      // Rotate (nose up) in the last seconds of the roll.
      this.pitch =
        this.mode === 'rolling' ? Math.max(0, (this.speed / h.liftoffSpeed - 0.85) * 0.6) : 0;
    }
  }
}

export interface FireSettings {
  rate: number;
  accuracy: number;
}

export const missionRuntime = {
  markers: [] as Marker[],
  actors: [] as Actor[],
  plane: null as PlaneSim | null,
  /** Police gunfire settings while a mission has it on. */
  fire: null as FireSettings | null,
  /** Called by the gunfire layer when a shot hits the player's car. */
  onHit: null as null | ((damage: number) => void),
  /** Shown in free roam: the selected mission's start marker. */
  startMarker: null as Marker | null,
  reset(): void {
    this.markers = [];
    this.actors = [];
    this.plane = null;
    this.fire = null;
  },
};
