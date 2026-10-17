import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier';
import type { DynamicRayCastVehicleController } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { DRIVING, PHYSICS, VEHICLE } from '../config';
import { policeCarGeometries } from '../city/propModels';
import { ArcadeCar } from '../vehicles/arcadeHandling';
import { vehicleState } from '../vehicles/vehicleState';
import { policeState } from './policeState';

const WHEELS = [
  { x: 0.78, z: 1.35, front: true },
  { x: -0.78, z: 1.35, front: true },
  { x: 0.78, z: -1.32, front: false },
  { x: -0.78, z: -1.32, front: false },
];
const RADIUS = 0.33;
const REST = VEHICLE.suspensionRestLength;
const MOUNT = REST - Math.abs(PHYSICS.gravity[1]) / (4 * VEHICLE.suspensionStiffness);
const ALL_ASSISTS = { MAN: false, ABS: true, TCS: true, ESP: true };

/**
 * A police cruiser that chases the player on the ground (same arcade physics as the player's
 * car, driven by a simple pursuit AI). It can't follow into the air: once the player launches it
 * drives to the launch point and stops, and it brakes at a roof edge rather than drive off.
 */
export function PoliceChaser({
  start,
  heading,
  nav,
}: {
  start: [number, number, number];
  heading: number;
  /** Optional waypoint finder (e.g. the car park's ramps); null = head straight for the target. */
  nav?: (
    p: { x: number; y: number; z: number },
    target: THREE.Vector3,
  ) => { x: number; z: number } | null;
}) {
  const chassis = useRef<RapierRigidBody>(null);
  const { world, rapier } = useRapier();
  const vehicle = useRef<DynamicRayCastVehicleController | null>(null);
  const arcade = useMemo(() => new ArcadeCar(), []);
  const fronts = useMemo(() => WHEELS.map((w) => w.front), []);
  const ai = useRef({ steer: 0, reverse: 0, stuck: 0 });
  const red = useRef<THREE.Mesh>(null);
  const blue = useRef<THREE.Mesh>(null);

  const geo = useMemo(() => policeCarGeometries(), []);
  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.35, metalness: 0.3 }),
      doors: new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.4 }),
      glass: new THREE.MeshStandardMaterial({ color: '#101418', roughness: 0.08 }),
      wheels: new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.8 }),
      lightbar: new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.5 }),
      red: new THREE.MeshBasicMaterial({ color: '#ff2433', toneMapped: false }),
      blue: new THREE.MeshBasicMaterial({ color: '#2f6bff', toneMapped: false }),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    },
    [geo, mats],
  );

  useEffect(() => {
    const rb = chassis.current;
    if (!rb) return;
    const vc = world.createVehicleController(rb);
    vc.indexUpAxis = 1;
    vc.setIndexForwardAxis = 2;
    for (const w of WHEELS) {
      vc.addWheel(
        { x: w.x, y: RADIUS + MOUNT, z: w.z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        REST,
        RADIUS,
      );
    }
    for (let i = 0; i < vc.numWheels(); i++) {
      vc.setWheelSuspensionStiffness(i, VEHICLE.suspensionStiffness);
      vc.setWheelSuspensionCompression(i, VEHICLE.suspensionCompression);
      vc.setWheelSuspensionRelaxation(i, VEHICLE.suspensionRelaxation);
      vc.setWheelMaxSuspensionTravel(i, VEHICLE.maxSuspensionTravel);
      vc.setWheelMaxSuspensionForce(i, VEHICLE.maxSuspensionForce);
      vc.setWheelFrictionSlip(i, DRIVING.wheelTraction);
      vc.setWheelSideFrictionStiffness(i, DRIVING.wheelSideFriction);
    }
    vehicle.current = vc;
    return () => {
      world.removeVehicleController(vc);
      vehicle.current = null;
    };
  }, [world]);

  const tmp = useMemo(
    () => ({ q: new THREE.Quaternion(), f: new THREE.Vector3(), target: new THREE.Vector3() }),
    [],
  );

  useBeforePhysicsStep(() => {
    const rb = chassis.current;
    const vc = vehicle.current;
    const car = vehicleState.active;
    if (!rb || !vc || !car) return;
    const dt = PHYSICS.timeStep;
    const s = ai.current;
    const p = rb.translation();
    const r = rb.rotation();
    tmp.q.set(r.x, r.y, r.z, r.w);
    tmp.f.set(0, 0, 1).applyQuaternion(tmp.q);
    const fx = tmp.f.x;
    const fz = tmp.f.z;
    const fl = Math.hypot(fx, fz) || 1;

    // Chase the car while it's on the ground; once it launches, go to the launch point and stop.
    let stopAt = 7;
    if (car.flying && policeState.launchPoint) {
      tmp.target.copy(policeState.launchPoint);
      stopAt = 3.5;
    } else {
      car.object.getWorldPosition(tmp.target);
      if (!car.flying) policeState.launchPoint = null;
    }
    // Navigate (ramps etc.) when the target can't be reached in a straight line.
    const via = nav?.(p, tmp.target) ?? null;
    if (via) stopAt = 0;
    const dx = (via ? via.x : tmp.target.x) - p.x;
    const dz = (via ? via.z : tmp.target.z) - p.z;
    const dist = via ? Math.hypot(dx, dz) + 14 : Math.hypot(dx, dz);
    // Angle to the target relative to our heading (+ = to the right; right of (fx, fz) is (−fz, fx)).
    const angle = Math.atan2((dx * -fz + dz * fx) / fl, (dx * fx + dz * fz) / fl);
    const speed = arcade.telemetry.forward;

    let steer = THREE.MathUtils.clamp(angle * 2, -1, 1);
    let throttle = dist > stopAt + 12 ? 1 : THREE.MathUtils.clamp((dist - stopAt) / 12, 0, 1);
    if (dist < stopAt) throttle = speed > 0.5 ? -1 : 0;
    // Inside a structure (following waypoints): crawl, so it can make the turns.
    if (via && speed > 6) throttle = speed > 8 ? -0.5 : 0;
    // Target behind us and close: back up turning the other way.
    if (Math.abs(angle) > 2.2 && dist < 25 && dist > stopAt) {
      throttle = -0.7;
      steer = -steer;
    }
    // Stuck against something: reverse for a moment.
    if (throttle > 0.5 && Math.abs(speed) < 0.6) s.stuck += dt;
    else s.stuck = Math.max(0, s.stuck - dt);
    if (s.stuck > 2.2) {
      s.reverse = 1.4;
      s.stuck = 0;
    }
    if (s.reverse > 0) {
      s.reverse -= dt;
      throttle = -0.8;
      steer = -steer;
    }
    // Roof edge (or any drop) ahead: brake instead of driving off.
    const ahead = world.castRay(
      new rapier.Ray(
        { x: p.x + (fx / fl) * 3, y: p.y + 1.2, z: p.z + (fz / fl) * 3 },
        { x: 0, y: -1, z: 0 },
      ),
      4.5,
      true,
      undefined,
      undefined,
      undefined,
      rb,
    );
    if (!ahead && throttle > 0) throttle = speed > 0.3 ? -1 : 0;

    s.steer += THREE.MathUtils.clamp(
      -steer * VEHICLE.maxSteer - s.steer,
      -VEHICLE.steerRate * dt,
      VEHICLE.steerRate * dt,
    );
    arcade.step(
      rb,
      vc,
      fronts,
      { throttle, steer, handbrake: false, shiftUp: false, shiftDown: false },
      ALL_ASSISTS,
      0.92,
      s.steer,
      dt,
    );
  });

  // Light bar flashes red / blue.
  useFrame(({ clock }) => {
    const on = Math.floor(clock.elapsedTime * 4) % 2 === 0;
    if (red.current) red.current.visible = on;
    if (blue.current) blue.current.visible = !on;
  });

  return (
    <RigidBody
      ref={chassis}
      type="dynamic"
      colliders={false}
      position={start}
      rotation={[0, heading, 0]}
      canSleep={false}
      linearDamping={0.05}
      angularDamping={0.6}
    >
      <CuboidCollider args={[0.9, 0.42, 2.2]} position={[0, 0.78, 0]} mass={1500} />
      <mesh geometry={geo.body} material={mats.body} castShadow />
      <mesh geometry={geo.doors} material={mats.doors} />
      <mesh geometry={geo.glass} material={mats.glass} />
      <mesh geometry={geo.wheels} material={mats.wheels} />
      <mesh geometry={geo.lightbar} material={mats.lightbar} />
      <mesh ref={red} geometry={geo.red} material={mats.red} />
      <mesh ref={blue} geometry={geo.blue} material={mats.blue} />
    </RigidBody>
  );
}
