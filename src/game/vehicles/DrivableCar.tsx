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
import { DRIVING, HUD_UNITS, PHYSICS, VEHICLE } from '../config';
import { useGame } from '../store/game';
import { useNav } from '../store/nav';
import { useCity } from '../city/cityData';
import { useCareer } from '../store/career';
import { useSettings } from '../store/settings';
import { consumePress, input, readMove } from '../systems/input';
import { ArcadeCar } from './arcadeHandling';
import { carContactHooks } from './contacts';
import { buildDrivableCar, CAR_MODEL, type CarLook } from './carModel';
import { crashDrift, updateDrift } from './drift';
import { emitSparks, setTireEmitter } from './tireFxState';
import { vehicleState } from './vehicleState';

interface Props extends CarLook {
  id: string;
  position: [number, number, number];
  /** Heading in radians; 0 faces +z. */
  heading: number;
}

const HUD_INTERVAL = 0.1;

/** R: put the car back on its wheels on the nearest road, facing along it. */
function resetOntoRoad(rb: RapierRigidBody): void {
  const city = useCity.getState().city;
  const p = rb.translation();
  const hit = city?.graph.nearest(p.x, p.z, 120);
  if (!city || !hit) return;
  const e = city.index.edges[hit.edge]!;
  // Direction of the road at the snapped point.
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i + 3 < e.pts.length; i += 2) {
    const d = Math.hypot(e.pts[i]! - hit.x, e.pts[i + 1]! - hit.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const dx = e.pts[best + 2]! - e.pts[best]!;
  const dz = e.pts[best + 3]! - e.pts[best + 1]!;
  const r = rb.rotation();
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
  // Keep roughly the way we were facing.
  const flip = fwd.x * dx + fwd.z * dz < 0 && !e.oneway ? Math.PI : 0;
  const yaw = Math.atan2(dx, dz) + flip;
  rb.setTranslation({ x: hit.x, y: city.heightAt(hit.x, hit.z) + 0.6, z: hit.z }, true);
  rb.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
  rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
}
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
      // Strong traction for drive/brake; sideways grip comes from the arcade layer.
      vc.setWheelFrictionSlip(i, DRIVING.wheelTraction);
      vc.setWheelSideFrictionStiffness(i, DRIVING.wheelSideFriction);
    }
    vehicle.current = vc;
    return () => {
      world.removeVehicleController(vc);
      vehicle.current = null;
    };
  }, [world, rig]);

  const arcade = useMemo(() => new ArcadeCar(), []);
  const fronts = useMemo(() => rig.wheels.map((w) => w.front), [rig]);

  useBeforePhysicsStep(() => {
    const vc = vehicle.current;
    const rb = chassis.current;
    if (!vc || !rb) return;
    const dt = PHYSICS.timeStep;
    const s = sim.current;

    let throttleIn = 0;
    let steerIn = 0;
    let handbrake = false;
    let shiftUp = false;
    let shiftDown = false;
    // No driving input while the map is open (the car coasts hands-off).
    if (!useNav.getState().mapOpen) {
      const m = readMove();
      throttleIn = m.y;
      steerIn = m.x;
      handbrake = input.held.has('jump');
      shiftUp = consumePress('sprint');
      shiftDown = consumePress('flyDown');
      if (consumePress('reload')) resetOntoRoad(rb);
    }

    const speed = arcade.telemetry.forward;
    const power =
      (1 - (s.damage / 100) * (1 - VEHICLE.damagedEngineFactor)) * (s.battery > 0 ? 1 : 0);

    // Front wheel angle (visual + a little real steering), with a pull once damaged.
    const t = THREE.MathUtils.clamp(Math.abs(speed) / VEHICLE.highSpeedSteerAt, 0, 1);
    const steerScale = THREE.MathUtils.lerp(1, VEHICLE.highSpeedSteerFactor, t);
    const pull =
      (s.damage / 100) * VEHICLE.damagedSteerPull * s.pullSide * Math.min(1, Math.abs(speed) / 5);
    const target = -steerIn * VEHICLE.maxSteer * steerScale + pull;
    const maxStep = VEHICLE.steerRate * dt;
    s.steer += THREE.MathUtils.clamp(target - s.steer, -maxStep, maxStep);

    arcade.step(
      rb,
      vc,
      fronts,
      {
        throttle: throttleIn,
        steer: steerIn - pull / VEHICLE.maxSteer,
        handbrake,
        shiftUp,
        shiftDown,
      },
      useCareer.getState().assists,
      power,
      s.steer,
      dt,
    );
    const tel = arcade.telemetry;
    s.throttle = tel.load > 0 ? Math.abs(throttleIn) : 0;
    if (tel.load > 0) {
      s.battery = Math.max(
        0,
        s.battery - (tel.load * dt * 100) / VEHICLE.batteryFullThrottleSeconds,
      );
    }
    updateDrift(dt, tel.speed, tel.grounded ? tel.slip : 0);
  });

  const spawnedAt = useRef(performance.now());
  const onContactForce = (e: {
    totalForceMagnitude: number;
    maxForceDirection: { x: number; y: number; z: number };
    other: { rigidBody?: { handle: number } };
  }) => {
    // Settling onto the road after spawning isn't a crash.
    if (performance.now() - spawnedAt.current < 2500) return;
    const impulse = e.totalForceMagnitude * PHYSICS.timeStep;
    const other = e.other.rigidBody?.handle;
    if (other !== undefined) for (const hook of carContactHooks) hook(other, impulse);
    const rb = chassis.current;
    if (rb && impulse > VEHICLE.damageThreshold * 0.25) {
      emitSparks(rb.translation(), e.maxForceDirection, impulse / VEHICLE.damageThreshold);
    }
    if (impulse > VEHICLE.damageThreshold * 0.6) crashDrift();
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
    vehicleState.active = {
      id,
      object: root,
      bodyHandle: rb.handle,
      speed: 0,
      paint: String(paint),
    };
    useGame.getState().enterVehicle(id);
    // Debug hook for automated handling checks.
    if (useSettings.getState().debug) Object.assign(window, { __drive: arcade.telemetry });
    return () => {
      if (vehicleState.active?.id === id) vehicleState.active = null;
      stopEvSound();
    };
  }, [id, paint, arcade]);

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

    const tel = arcade.telemetry;
    const speed = tel.forward;
    if (vehicleState.active) vehicleState.active.speed = speed;
    updateEvSound(speed, s.throttle, tel.tireSlide);
    // Rear tires: smoke and skid marks where they touch the road.
    rig.wheels.forEach((w, i) => {
      if (w.front) return;
      const p = vc.wheelContactPoint(i);
      setTireEmitter(i, p && vc.wheelIsInContact(i) ? p : null, tel.tireSlide);
    });

    s.hudTimer -= dt;
    if (s.hudTimer <= 0) {
      s.hudTimer = HUD_INTERVAL;
      game.setVehicleHud({
        speed: Math.round(tel.speed * MS_TO_UNITS),
        battery: Math.round(s.battery),
        damage: Math.round(s.damage),
        reversing: speed < -0.3,
        gear: tel.gear,
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
