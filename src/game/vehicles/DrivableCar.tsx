import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier';
import type { DynamicRayCastVehicleController } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { modelUrl } from '../../lib/assets';
import { stopEvSound, updateEvSound } from '../audio/evSound';
import { HUD_UNITS, PHYSICS, VEHICLE } from '../config';
import { useGame } from '../store/game';
import { useNav } from '../store/nav';
import { input, readMove } from '../systems/input';
import { buildDrivableCar, CAR_MODEL, type CarLook } from './carModel';
import { vehicleState } from './vehicleState';

interface Props extends CarLook {
  id: string;
  position: [number, number, number];
  /** Heading in radians; 0 faces +z. */
  heading: number;
}

const HUD_INTERVAL = 0.1;
/**
 * Rapier scales suspension force by chassis mass, so each wheel compresses by g / (4·stiffness) at
 * rest. Mount the suspension that much lower so the car sits at its modeled ride height.
 */
const STATIC_COMPRESSION = Math.abs(PHYSICS.gravity[1]) / (4 * VEHICLE.suspensionStiffness);
const MOUNT_OFFSET = VEHICLE.suspensionRestLength - STATIC_COMPRESSION;
const MS_TO_UNITS = HUD_UNITS === 'mph' ? 2.23694 : 3.6;

export function DrivableCar({ id, position, heading, paint }: Props) {
  const gltf = useGLTF(modelUrl(CAR_MODEL), false, true);
  const rig = useMemo(() => buildDrivableCar(gltf.scene, { paint }), [gltf, paint]);
  const chassis = useRef<RapierRigidBody>(null);
  const visual = useRef<THREE.Group>(null);
  const { world } = useRapier();
  const vehicle = useRef<DynamicRayCastVehicleController | null>(null);

  const sim = useRef({
    steer: 0,
    throttle: 0,
    battery: 100,
    damage: 0,
    /** Constant pull direction once damaged (±1). */
    pullSide: Math.random() < 0.5 ? -1 : 1,
    doorOpen: 0,
    doorTarget: 0,
    doorTimer: 0,
    hudTimer: 0,
  });

  useEffect(() => {
    const rb = chassis.current;
    if (!rb) return;
    const vc = world.createVehicleController(rb);
    vc.indexUpAxis = 1;
    vc.setIndexForwardAxis = 2;
    for (const w of rig.wheels) {
      vc.addWheel(
        { x: w.center.x, y: w.center.y + MOUNT_OFFSET, z: w.center.z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        VEHICLE.suspensionRestLength,
        VEHICLE.wheelRadius,
      );
    }
    for (let i = 0; i < vc.numWheels(); i++) {
      vc.setWheelSuspensionStiffness(i, VEHICLE.suspensionStiffness);
      vc.setWheelSuspensionCompression(i, VEHICLE.suspensionCompression);
      vc.setWheelSuspensionRelaxation(i, VEHICLE.suspensionRelaxation);
      vc.setWheelMaxSuspensionTravel(i, VEHICLE.maxSuspensionTravel);
      vc.setWheelMaxSuspensionForce(i, VEHICLE.maxSuspensionForce);
      vc.setWheelFrictionSlip(i, VEHICLE.frictionSlip);
      vc.setWheelSideFrictionStiffness(i, VEHICLE.sideFrictionStiffness);
    }
    vehicle.current = vc;
    return () => {
      world.removeVehicleController(vc);
      vehicle.current = null;
    };
  }, [world, rig]);

  useBeforePhysicsStep(() => {
    const vc = vehicle.current;
    const rb = chassis.current;
    if (!vc || !rb) return;
    const dt = PHYSICS.timeStep;
    const s = sim.current;
    const driving = true;

    let throttleIn = 0;
    let steerIn = 0;
    let handbrake = false;
    // No driving input while the map is open (the car rolls and brakes as if hands-off).
    if (driving && !useNav.getState().mapOpen) {
      const m = readMove();
      throttleIn = m.y;
      steerIn = m.x;
      handbrake = input.held.has('jump');
    }

    const speed = vc.currentVehicleSpeed();
    const power =
      (1 - (s.damage / 100) * (1 - VEHICLE.damagedEngineFactor)) * (s.battery > 0 ? 1 : 0);
    let engine = 0;
    let brake = 0;
    if (throttleIn > 0) {
      if (speed < -0.5) brake = VEHICLE.brakeForce * throttleIn;
      else engine = throttleIn * VEHICLE.maxEngineForce * power;
    } else if (throttleIn < 0) {
      if (speed > 0.5) brake = VEHICLE.brakeForce * -throttleIn;
      else engine = throttleIn * VEHICLE.reverseForce * power;
    } else if (!driving) {
      brake = VEHICLE.brakeForce; // parked
    }
    s.throttle = Math.abs(engine) > 0 ? Math.abs(throttleIn) : 0;

    // Speed-sensitive steering, plus a pull to one side once the car is damaged.
    const t = THREE.MathUtils.clamp(Math.abs(speed) / VEHICLE.highSpeedSteerAt, 0, 1);
    const steerScale = THREE.MathUtils.lerp(1, VEHICLE.highSpeedSteerFactor, t);
    const pull =
      (s.damage / 100) * VEHICLE.damagedSteerPull * s.pullSide * Math.min(1, Math.abs(speed) / 5);
    const target = -steerIn * VEHICLE.maxSteer * steerScale + pull;
    const maxStep = VEHICLE.steerRate * dt;
    s.steer += THREE.MathUtils.clamp(target - s.steer, -maxStep, maxStep);

    const frontShare = (1 - VEHICLE.rearBias) / 2;
    const rearShare = VEHICLE.rearBias / 2;
    rig.wheels.forEach((w, i) => {
      vc.setWheelSteering(i, w.front ? s.steer : 0);
      vc.setWheelEngineForce(i, engine * (w.front ? frontShare : rearShare));
      const rearHandbrake = handbrake && !w.front;
      vc.setWheelBrake(i, rearHandbrake ? VEHICLE.handbrakeForce : brake);
      vc.setWheelFrictionSlip(
        i,
        rearHandbrake ? VEHICLE.frictionSlip * VEHICLE.handbrakeGrip : VEHICLE.frictionSlip,
      );
    });

    // Rolling resistance + aero drag, opposite the direction of travel.
    const v = rb.linvel();
    const flat = Math.hypot(v.x, v.z);
    if (flat > 0.2) {
      const f = (VEHICLE.rollingResistance + VEHICLE.aeroDrag * flat * flat) * dt;
      rb.applyImpulse({ x: (-v.x / flat) * f, y: 0, z: (-v.z / flat) * f }, true);
    }

    vc.updateVehicle(dt);

    if (engine > 0 || engine < 0) {
      s.battery = Math.max(
        0,
        s.battery - (s.throttle * dt * 100) / VEHICLE.batteryFullThrottleSeconds,
      );
    }
  });

  const onContactForce = (e: { totalForceMagnitude: number }) => {
    const impulse = e.totalForceMagnitude * PHYSICS.timeStep;
    if (impulse > VEHICLE.damageThreshold) {
      const s = sim.current;
      s.damage = Math.min(
        100,
        s.damage + (impulse - VEHICLE.damageThreshold) * VEHICLE.damagePerImpulse,
      );
    }
  };

  // This car is the player: register it as the active vehicle as soon as its body exists.
  useEffect(() => {
    const rb = chassis.current;
    const root = visual.current;
    if (!rb || !root) return;
    vehicleState.active = { id, object: root, bodyHandle: rb.handle, speed: 0, paint: String(paint) };
    useGame.getState().enterVehicle(id);
    return () => {
      if (vehicleState.active?.id === id) vehicleState.active = null;
      stopEvSound();
    };
  }, [id, paint]);

  useFrame((_, dt) => {
    const vc = vehicle.current;
    const rb = chassis.current;
    const root = visual.current;
    if (!vc || !rb || !root) return;
    const s = sim.current;
    const game = useGame.getState();

    // Wheels: suspension travel, steering and spin.
    rig.wheels.forEach((w, i) => {
      const susp = vc.wheelSuspensionLength(i) ?? VEHICLE.suspensionRestLength;
      w.pivot.position.y = w.center.y + MOUNT_OFFSET - susp;
      w.pivot.rotation.y = vc.wheelSteering(i) ?? 0;
      w.spin.rotation.x = vc.wheelRotation(i) ?? 0;
    });

    const speed = vc.currentVehicleSpeed();
    if (vehicleState.active) vehicleState.active.speed = speed;
    updateEvSound(speed, s.throttle);

    s.hudTimer -= dt;
    if (s.hudTimer <= 0) {
      s.hudTimer = HUD_INTERVAL;
      game.setVehicleHud({
        speed: Math.round(Math.abs(speed) * MS_TO_UNITS),
        battery: Math.round(s.battery),
        damage: Math.round(s.damage),
        reversing: speed < -0.3,
      });
    }
  });

  return (
    <RigidBody
      ref={chassis}
      type="dynamic"
      colliders={false}
      position={position}
      rotation={[0, heading, 0]}
      canSleep={false}
      linearDamping={0.05}
      angularDamping={0.6}
      onContactForce={onContactForce}
    >
      {/* Body shell and cabin, plus a heavy low battery pack for a low center of gravity. */}
      <CuboidCollider
        args={[0.92, 0.32, 2.12]}
        position={[0, 0.62, 0.24]}
        mass={VEHICLE.bodyMass * 0.75}
      />
      <CuboidCollider
        args={[0.72, 0.24, 1.05]}
        position={[0, 1.0, -0.1]}
        mass={VEHICLE.bodyMass * 0.25}
      />
      <CuboidCollider
        args={[0.8, 0.06, 1.5]}
        position={[0, 0.36, 0.2]}
        mass={VEHICLE.batteryMass}
      />
      <group ref={visual}>
        <primitive object={rig.root} />
      </group>
    </RigidBody>
  );
}

useGLTF.preload(modelUrl(CAR_MODEL), false, true);
