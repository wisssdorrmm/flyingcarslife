/**
 * Rocket launch and flight (CLAUDE.md §6.2). A state machine on the car's rigid body:
 *   ground → noseUp (pivot on the rear axle to ~82°, keep 40% of forward speed)
 *          → rocket (world-up thrust 0 → 60 m/s, seeded chaotic tumble ~1.5 turns)
 *          → stabilize (spin damps out, levels, gentle climb) → fly ⇄ glide (empty battery)
 *          → landing (below ~6 m: auto-level, settle onto the wheels) → ground.
 * The body is driven with setLinvel/setAngvel toward targets (never teleported), so collisions
 * stay live: hitting a building mid-tumble bounces off. Gravity is off while airborne and the
 * wheel raycasts aren't run.
 */
import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { FLYING } from '../config';

export type FlightMode = 'ground' | 'noseUp' | 'rocket' | 'stabilize' | 'fly' | 'glide' | 'landing';

export interface FlightInput {
  throttle: number;
  steer: number;
  climb: boolean;
  descend: boolean;
}

/** Fired when a flight's time runs out and the car starts coming down. */
export const timeUpHooks = new Set<() => void>();

/** Launch listeners (dust, debris, sound, bystanders looking up). */
export const launchHooks = new Set<(at: { x: number; y: number; z: number }) => void>();

const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const DEG = Math.PI / 180;
const smooth = (t: number) => t * t * (3 - 2 * t);

const tmp = {
  q: new THREE.Quaternion(),
  target: new THREE.Quaternion(),
  dq: new THREE.Quaternion(),
  inv: new THREE.Quaternion(),
  yaw: new THREE.Quaternion(),
  pitch: new THREE.Quaternion(),
  roll: new THREE.Quaternion(),
  v: new THREE.Vector3(),
  w: new THREE.Vector3(),
  p: new THREE.Vector3(),
  axle: new THREE.Vector3(),
};

/** Deterministic PRNG per launch, so every launch tumbles differently but naturally. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Angular velocity that turns `from` into `to` over dt. */
function angvelBetween(
  from: THREE.Quaternion,
  to: THREE.Quaternion,
  dt: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const dq = tmp.dq.copy(to).multiply(tmp.inv.copy(from).invert());
  // Same rotation, shortest way round.
  if (dq.w < 0) dq.set(-dq.x, -dq.y, -dq.z, -dq.w);
  const angle = 2 * Math.acos(Math.min(1, dq.w));
  const s = Math.sqrt(Math.max(0, 1 - dq.w * dq.w));
  if (s < 1e-5) return out.set(0, 0, 0);
  return out.set(dq.x / s, dq.y / s, dq.z / s).multiplyScalar(angle / dt);
}

export class FlightController {
  mode: FlightMode = 'ground';
  /** Stable yaw for flight and the camera. */
  heading = 0;
  /** 0..1 lift effort (heat shimmer, sound). */
  thrust = 0;
  private t = 0;
  private forward = 0;
  private vy = 0;
  private launches = 0;
  /** Seconds since the launch (each flight is limited to FLYING.flightSeconds). */
  private airTime = 0;
  /** Rear axle in the car's frame (pivot for the nose-up) and its world position. */
  private axleLocal = new THREE.Vector3(0, 0.36, -1.35);
  private axleWorld = new THREE.Vector3();
  private tumble = new THREE.Vector3();
  private wobble = new THREE.Vector3();
  private rand: () => number = Math.random;
  private step2 = new THREE.Quaternion();

  get airborne(): boolean {
    return this.mode !== 'ground';
  }

  /** Flight time left (s); 0 once the car has to come down. */
  get timeLeft(): number {
    return this.mode === 'ground'
      ? FLYING.flightSeconds
      : Math.max(0, FLYING.flightSeconds - this.airTime);
  }

  /** Launch phases (no control, no crash damage). */
  get launching(): boolean {
    return this.mode === 'noseUp' || this.mode === 'rocket' || this.mode === 'stabilize';
  }

  /** The player steers once the tumble is over. */
  get controllable(): boolean {
    return this.mode === 'fly' || this.mode === 'glide' || this.mode === 'landing';
  }

  setRearAxle(z: number, y: number): void {
    this.axleLocal.set(0, y, z);
  }

  /** Starts a launch from the ground (any speed, even stopped). */
  launch(rb: RapierRigidBody): boolean {
    if (this.mode !== 'ground') return false;
    const r = rb.rotation();
    tmp.q.set(r.x, r.y, r.z, r.w);
    tmp.v.copy(Z).applyQuaternion(tmp.q);
    this.heading = Math.atan2(tmp.v.x, tmp.v.z);
    const lv = rb.linvel();
    this.forward =
      (lv.x * Math.sin(this.heading) + lv.z * Math.cos(this.heading)) * FLYING.keepForwardVel;
    const p = rb.translation();
    this.axleWorld
      .copy(this.axleLocal)
      .applyQuaternion(tmp.q)
      .add(tmp.p.set(p.x, p.y, p.z));
    this.vy = 0;
    this.launches++;
    this.airTime = 0;
    this.rand = seeded(this.launches * 7919 + Math.floor(performance.now()));
    this.mode = 'noseUp';
    this.t = 0;
    rb.setGravityScale(0, true);
    for (const hook of launchHooks) hook(p);
    return true;
  }

  private level(out: THREE.Quaternion, pitch = 0, roll = 0): THREE.Quaternion {
    tmp.yaw.setFromAxisAngle(UP, this.heading);
    tmp.pitch.setFromAxisAngle(X, pitch);
    tmp.roll.setFromAxisAngle(Z, roll);
    return out.copy(tmp.yaw).multiply(tmp.pitch).multiply(tmp.roll);
  }

  /** Turns the body toward `target` by blend factor k this step. */
  private turnToward(
    rb: RapierRigidBody,
    q: THREE.Quaternion,
    target: THREE.Quaternion,
    k: number,
    dt: number,
  ): void {
    this.step2.copy(q).slerp(target, k);
    angvelBetween(q, this.step2, dt, tmp.w);
    rb.setAngvel({ x: tmp.w.x, y: tmp.w.y, z: tmp.w.z }, true);
  }

  /**
   * One physics step while airborne. `ground` returns the distance to the surface below (road or
   * roof), or Infinity. Returns the battery % used.
   */
  step(
    rb: RapierRigidBody,
    input: FlightInput,
    battery: number,
    ground: () => number,
    dt: number,
  ): number {
    this.t += dt;
    this.airTime += dt;
    const { q, target, v, w } = tmp;
    const r = rb.rotation();
    q.set(r.x, r.y, r.z, r.w);
    const lv = rb.linvel();
    const pos = rb.translation();
    const sh = Math.sin(this.heading);
    const ch = Math.cos(this.heading);
    const used = FLYING.batteryDrainPerSec * dt;

    if (this.mode === 'noseUp') {
      // Pivot on the rear axle: the axle rolls on at the kept speed while the nose comes up.
      const k = smooth(Math.min(1, this.t / FLYING.noseUpTime));
      this.axleWorld.x += sh * this.forward * dt;
      this.axleWorld.z += ch * this.forward * dt;
      // Rise a little as the nose comes up so the rear bumper clears the road.
      this.axleWorld.y += (0.6 / FLYING.noseUpTime) * dt;
      this.level(target, -FLYING.noseUpDeg * DEG * k);
      tmp.axle.copy(this.axleLocal).applyQuaternion(target);
      v.copy(this.axleWorld)
        .sub(tmp.axle)
        .sub(tmp.p.set(pos.x, pos.y, pos.z))
        .divideScalar(dt);
      rb.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
      angvelBetween(q, target, dt, w);
      rb.setAngvel({ x: w.x, y: w.y, z: w.z }, true);
      this.thrust = 0.3 * k;
      if (this.t >= FLYING.noseUpTime) this.startRocket(target, lv.y);
    } else if (this.mode === 'rocket') {
      // Thrust along world-up; slight forward drift; the tumble (a hit can still knock it about).
      this.vy = Math.min(FLYING.climbMaxSpeed, this.vy + FLYING.climbAccel * dt);
      const kb = 1 - Math.exp(-2 * dt);
      rb.setLinvel(
        {
          x: lv.x + (sh * this.forward - lv.x) * kb,
          y: this.vy,
          z: lv.z + (ch * this.forward - lv.z) * kb,
        },
        true,
      );
      const av = rb.angvel();
      w.copy(this.tumble).addScaledVector(this.wobble, Math.sin(this.t * 5.3));
      w.lerp(v.set(av.x, av.y, av.z), 0.15);
      rb.setAngvel({ x: w.x, y: w.y, z: w.z }, true);
      this.thrust = 1;
      if (this.t >= FLYING.tumbleTime) {
        this.mode = 'stabilize';
        this.t = 0;
      }
    } else if (this.mode === 'stabilize') {
      // Spin damps out as the car slerps level (wheels down); vertical speed eases to a climb.
      const k = Math.min(1, this.t / FLYING.stabilizeTime);
      const climbTo = input.climb ? FLYING.climbSpeed : FLYING.gentleClimb;
      this.vy += (climbTo - this.vy) * (1 - Math.exp(-6 * dt));
      this.forward *= 1 - 0.5 * dt;
      rb.setLinvel({ x: sh * this.forward, y: this.vy, z: ch * this.forward }, true);
      this.level(target);
      this.turnToward(rb, q, target, Math.min(1, 0.12 + smooth(k) * 0.5), dt);
      this.thrust = 0.8;
      if (k >= 1) this.mode = battery > 0 ? 'fly' : 'glide';
    } else {
      const dist = ground();
      // Out of flight time (or battery): come down.
      const timeUp = this.airTime >= FLYING.flightSeconds;
      if (this.mode === 'fly' && (battery <= 0 || timeUp)) {
        this.mode = 'glide';
        if (timeUp) for (const hook of timeUpHooks) hook();
      }
      const gliding = this.mode === 'glide';
      // Auto-land: low over a surface and not climbing.
      if (
        (this.mode === 'fly' || gliding) &&
        !input.climb &&
        this.vy <= 0.5 &&
        dist < FLYING.autoLandHeight
      ) {
        this.mode = 'landing';
      }
      if (this.mode === 'landing' && input.climb && battery > 0 && !timeUp) this.mode = 'fly';

      if (this.mode === 'landing') {
        // Level out and settle gently onto the wheels.
        this.forward *= 1 - 1.4 * dt;
        this.vy = -THREE.MathUtils.clamp(dist * 1.1, 1.2, 5);
        this.heading -= input.steer * FLYING.yawRate * 0.5 * dt;
        this.level(target);
        this.thrust = 0.35;
        if (dist < 0.75) {
          this.touchDown(rb);
          return used;
        }
      } else {
        const want = gliding
          ? FLYING.glideSpeed * Math.max(0.4, input.throttle)
          : input.throttle >= 0
            ? FLYING.flightMaxSpeed * input.throttle
            : -FLYING.reverseSpeed * -input.throttle;
        const rate = input.throttle === 0 ? FLYING.flightAccel * 0.3 : FLYING.flightAccel;
        this.forward += THREE.MathUtils.clamp(want - this.forward, -rate * dt, rate * dt);
        const turn = 0.5 + 0.5 * Math.min(1, Math.abs(this.forward) / 15);
        this.heading -= input.steer * FLYING.yawRate * turn * dt;
        // Time up: drop quickly, easing off near the ground for the auto-landing.
        const sink = timeUp
          ? Math.min(FLYING.timeUpSink, Math.max(4, dist * 0.6))
          : FLYING.glideSink;
        let vyWant = gliding
          ? -sink
          : input.climb
            ? FLYING.climbSpeed
            : input.descend
              ? -FLYING.climbSpeed
              : 0;
        if (pos.y > FLYING.maxAltitude) vyWant = Math.min(vyWant, 0);
        // Slightly floaty: vertical speed eases toward what the controls ask for.
        this.vy += (vyWant - this.vy) * (1 - Math.exp(-3 * dt));
        const bank = -input.steer * FLYING.bankAngle * Math.min(1, Math.abs(this.forward) / 12);
        const pitch = (-this.vy / FLYING.climbSpeed) * FLYING.pitchAngle;
        this.level(target, pitch, bank);
        this.thrust = gliding
          ? 0.1
          : 0.45 + 0.35 * Math.abs(input.throttle) + (input.climb ? 0.2 : 0);
      }
      const kb = 1 - Math.exp(-3 * dt);
      const hx = Math.sin(this.heading) * this.forward;
      const hz = Math.cos(this.heading) * this.forward;
      rb.setLinvel({ x: lv.x + (hx - lv.x) * kb, y: this.vy, z: lv.z + (hz - lv.z) * kb }, true);
      this.turnToward(rb, q, target, 1 - Math.exp(-6 * dt), dt);
    }
    return this.mode === 'glide' ? 0 : used;
  }

  private startRocket(noseUp: THREE.Quaternion, vy: number): void {
    this.mode = 'rocket';
    this.t = 0;
    this.vy = Math.max(vy, 2);
    // Seeded tumble: mostly roll and pitch, some yaw, ~1.5 turns over the climb.
    const rate = (FLYING.tumbleRotations * Math.PI * 2) / FLYING.tumbleTime;
    const roll = (this.rand() - 0.5) * 2;
    const pitch = 0.6 + this.rand() * 0.6;
    const yaw = (this.rand() - 0.5) * 0.7;
    tmp.v.set(0, 0, 1).applyQuaternion(noseUp).multiplyScalar(roll);
    this.tumble
      .set(1, 0, 0)
      .applyQuaternion(noseUp)
      .multiplyScalar(-pitch)
      .add(tmp.v)
      .addScaledVector(UP, yaw)
      .normalize()
      .multiplyScalar(rate * (0.85 + this.rand() * 0.3));
    this.wobble
      .set(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5)
      .multiplyScalar(rate * 0.5);
  }

  private touchDown(rb: RapierRigidBody): void {
    this.mode = 'ground';
    this.thrust = 0;
    rb.setGravityScale(1, true);
    const v = rb.linvel();
    rb.setLinvel({ x: v.x, y: Math.max(v.y, -1.5), z: v.z }, true);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** Cancels flight immediately (respawn / reset). */
  reset(rb: RapierRigidBody): void {
    if (this.mode !== 'ground') this.touchDown(rb);
  }
}
