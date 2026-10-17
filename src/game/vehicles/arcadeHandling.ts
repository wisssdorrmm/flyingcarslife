/**
 * Arcade handling on top of Rapier's raycast vehicle. The wheels keep their job (suspension,
 * drive and brake force); this layer decides how the car turns and slides:
 *  - sideways velocity dies out at a grip rate (high normally, low while drifting),
 *  - yaw follows a target rate from steering and speed (so drifts are easy to hold and catch),
 *  - assists: ESP limits the slide angle, TCS off allows power slides, ABS off loses grip under
 *    hard braking, MAN gives manual gears,
 *  - drag, rolling resistance and downforce; self-leveling in the air; auto-flip when stuck.
 */
import type { RapierRigidBody } from '@react-three/rapier';
import type { DynamicRayCastVehicleController } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { DRIVING } from '../config';
import type { Assist } from '../store/career';

export interface DriveInput {
  /** −1..1 (negative = brake / reverse). */
  throttle: number;
  /** −1..1 (positive = right). */
  steer: number;
  handbrake: boolean;
  shiftUp: boolean;
  shiftDown: boolean;
}

export interface DriveTelemetry {
  /** Forward speed (m/s, negative in reverse) and ground speed. */
  forward: number;
  speed: number;
  /** Slide angle between heading and travel (rad). */
  slip: number;
  /** Sideways speed (m/s). */
  lateral: number;
  grounded: boolean;
  /** 0..1 how hard the rear tires are sliding or spinning (smoke, skid marks, screech). */
  tireSlide: number;
  gear: string;
  /** Engine load 0..1 (sound). */
  load: number;
}

const tmp = {
  q: new THREE.Quaternion(),
  fwd: new THREE.Vector3(),
  side: new THREE.Vector3(),
  up: new THREE.Vector3(),
  v: new THREE.Vector3(),
  w: new THREE.Vector3(),
  axis: new THREE.Vector3(),
  worldUp: new THREE.Vector3(0, 1, 0),
};

export class ArcadeCar {
  /** 0 = full grip, 1 = drifting. */
  private drift = 0;
  private flipTimer = 0;
  /** Manual gear (1–6). */
  private gear = 1;
  readonly telemetry: DriveTelemetry = {
    forward: 0,
    speed: 0,
    slip: 0,
    lateral: 0,
    grounded: false,
    tireSlide: 0,
    gear: 'N',
    load: 0,
  };

  /**
   * One physics step. `power` scales the engine (damage, empty battery). Sets wheel forces, runs
   * the vehicle controller, then applies the arcade forces.
   */
  step(
    rb: RapierRigidBody,
    vc: DynamicRayCastVehicleController,
    frontWheels: boolean[],
    input: DriveInput,
    assists: Record<Assist, boolean>,
    power: number,
    steerAngle: number,
    dt: number,
  ): void {
    const { q, fwd, side, up, v, w, axis, worldUp } = tmp;
    const r = rb.rotation();
    q.set(r.x, r.y, r.z, r.w);
    fwd.set(0, 0, 1).applyQuaternion(q);
    side.set(1, 0, 0).applyQuaternion(q);
    up.set(0, 1, 0).applyQuaternion(q);
    const lv = rb.linvel();
    v.set(lv.x, lv.y, lv.z);
    const vf = v.dot(fwd);
    const vl = v.dot(side);
    const speed = Math.hypot(lv.x, lv.z);
    const mass = rb.mass();
    let contacts = 0;
    for (let i = 0; i < vc.numWheels(); i++) if (vc.wheelIsInContact(i)) contacts++;
    const grounded = contacts >= 2;
    const slip = speed > 2 ? Math.atan2(Math.abs(vl), Math.max(Math.abs(vf), 0.5)) : 0;

    // Gears: automatic by speed, or manual with shift up/down.
    const tops = DRIVING.gearTop;
    const autoGear = Math.max(1, tops.findIndex((t) => Math.abs(vf) < t * 0.97) + 1 || tops.length);
    if (assists.MAN) {
      if (input.shiftUp) this.gear = Math.min(tops.length, this.gear + 1);
      if (input.shiftDown) this.gear = Math.max(1, this.gear - 1);
    } else this.gear = autoGear;
    const gearIdx = this.gear - 1;

    // Engine and brakes.
    let engine = 0;
    let brake = 0;
    const t = input.throttle;
    const braking = (t < 0 && vf > 0.5) || (t > 0 && vf < -0.5);
    if (t > 0 && vf >= -0.5) {
      let f = DRIVING.engineForce * DRIVING.gearForce[gearIdx]! * t * power;
      if (assists.MAN) {
        if (Math.abs(vf) > tops[gearIdx]!)
          f = 0; // limiter
        else if (gearIdx > 0 && Math.abs(vf) < tops[gearIdx - 1]! * 0.45) f *= 0.45; // lugging
      }
      engine = f;
    } else if (t < 0 && vf <= 0.5) {
      engine = t * DRIVING.reverseForce * power;
    } else if (braking) {
      brake = DRIVING.brakeForce * Math.abs(t);
    }
    const burnout = input.handbrake && t > 0.5 && speed < 6;
    frontWheels.forEach((front, i) => {
      vc.setWheelSteering(i, front ? steerAngle : 0);
      // Rear-biased drive; no drive to the rear while doing a burnout (the car spins instead).
      vc.setWheelEngineForce(i, burnout ? 0 : engine * (front ? 0.2 : 0.3));
      vc.setWheelBrake(i, input.handbrake && !front ? DRIVING.handbrakeForce : brake);
    });
    vc.updateVehicle(dt);

    // Drift state: handbrake (or a TCS-off power slide) breaks the rear loose.
    const powerSlide =
      !assists.TCS &&
      t > 0.8 &&
      Math.abs(vf) < DRIVING.tcsOffSlipSpeed &&
      Math.abs(input.steer) > 0.3 &&
      speed > 3;
    if ((input.handbrake && speed > 6) || powerSlide) this.drift = 1;
    else if (this.drift > 0) {
      // Counter-steering (steering into the slide) recovers faster; throttle holds the slide.
      const slideDir = Math.sign(vl);
      const counter = Math.sign(-input.steer) === slideDir && Math.abs(input.steer) > 0.2;
      const hold = t > 0.3 && slip > 0.25 ? 0.25 : 1;
      this.drift = Math.max(
        0,
        this.drift - (dt / DRIVING.gripRecovery) * (counter ? 1.8 : 1) * hold,
      );
    }

    // Rapier's own sideways tire friction fades out while drifting (rear tires most).
    frontWheels.forEach((front, i) => {
      const loose = this.drift * (front ? 0.7 : 0.95);
      vc.setWheelSideFrictionStiffness(i, DRIVING.wheelSideFriction * (1 - loose));
    });

    if (grounded) {
      // Sideways grip.
      let grip = THREE.MathUtils.lerp(DRIVING.grip, DRIVING.driftGrip, this.drift);
      if (!assists.ABS && braking && Math.abs(t) > 0.7 && speed > 10) grip *= DRIVING.absOffGrip;
      if (assists.ESP && !input.handbrake && slip > DRIVING.espMaxSlip) {
        grip *= 1 + (slip - DRIVING.espMaxSlip) * 8;
      }
      const dvl = -vl * (1 - Math.exp(-grip * dt));
      rb.applyImpulse(
        { x: side.x * dvl * mass, y: side.y * dvl * mass, z: side.z * dvl * mass },
        true,
      );
      // Drifting keeps its momentum: part of the scrubbed sideways speed carries forward.
      if (this.drift > 0 && Math.abs(vf) > 3) {
        const carry = Math.abs(dvl) * DRIVING.driftCarry * this.drift * Math.sign(vf) * mass;
        rb.applyImpulse({ x: fwd.x * carry, y: fwd.y * carry, z: fwd.z * carry }, true);
      }

      // Yaw toward the steering target.
      const radius = DRIVING.turnRadiusBase + DRIVING.turnRadiusPerMs * Math.abs(vf);
      const rate = Math.min(DRIVING.yawRateMax, Math.abs(vf) / radius);
      let target = -input.steer * rate * Math.sign(vf || 1);
      if (this.drift > 0) target *= THREE.MathUtils.lerp(1, DRIVING.driftYawBoost, this.drift);
      if (burnout) target = -input.steer * 2.2; // donuts
      const av = rb.angvel();
      w.set(av.x, av.y, av.z);
      const wUp = w.dot(up);
      const k = DRIVING.yawResponse * (this.drift > 0 ? 0.55 : 1) * (assists.ESP ? 1 : 0.8);
      const next = wUp + (target - wUp) * (1 - Math.exp(-k * dt));
      w.addScaledVector(up, next - wUp);
      rb.setAngvel({ x: w.x, y: w.y, z: w.z }, true);

      // Downforce.
      const df = DRIVING.downforce * speed * speed * dt;
      rb.applyImpulse({ x: -up.x * df, y: -up.y * df, z: -up.z * df }, true);
    } else if (contacts === 0) {
      // Airborne: ease the car level so it lands on its wheels.
      axis.crossVectors(up, worldUp);
      const av = rb.angvel();
      w.set(av.x, av.y, av.z);
      w.lerp(axis.multiplyScalar(DRIVING.airLevel * 2), Math.min(1, DRIVING.airLevel * dt));
      rb.setAngvel({ x: w.x, y: w.y, z: w.z }, true);
    }

    // Rolling resistance and drag.
    if (speed > 0.2) {
      const f = (DRIVING.rolling + DRIVING.drag * speed * speed) * dt;
      rb.applyImpulse({ x: (-lv.x / speed) * f, y: 0, z: (-lv.z / speed) * f }, true);
    }

    // Stuck on its roof or side: flip back over.
    if (up.y < 0.3 && speed < 3) this.flipTimer += dt;
    else this.flipTimer = 0;
    if (this.flipTimer > DRIVING.autoFlipSeconds) {
      this.flipTimer = 0;
      const yaw = Math.atan2(fwd.x, fwd.z);
      const p = rb.translation();
      rb.setTranslation({ x: p.x, y: p.y + 1.5, z: p.z }, true);
      rb.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    const tel = this.telemetry;
    tel.forward = vf;
    tel.speed = speed;
    tel.slip = slip;
    tel.lateral = vl;
    tel.grounded = grounded;
    tel.tireSlide = grounded
      ? Math.min(
          1,
          Math.max(0, (Math.abs(vl) - 2.5) / 7) + (burnout ? 1 : 0) + (powerSlide ? 0.6 : 0),
        )
      : 0;
    tel.gear = vf < -0.5 ? 'R' : speed < 0.5 && t === 0 ? 'N' : String(this.gear);
    tel.load = Math.min(1, Math.abs(engine) / DRIVING.engineForce);
  }
}
