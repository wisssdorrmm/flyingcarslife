import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { CAMERA, CHASE_CAMERA, FLYING } from '../config';
import { useGame } from '../store/game';
import { consumeLook } from '../systems/input';
import { vehicleState } from './vehicleState';

/**
 * Chase camera while driving: sits behind and above the car with spring smoothing, can be
 * orbited with the mouse/right thumb, swings back behind the car on its own, widens FOV with
 * speed, and is pulled in front of walls like the on-foot camera.
 */
export function ChaseCamera() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const { world, rapier } = useRapier();
  const state = useRef({ active: false, orbit: 0, pitch: 0.18, lastLook: 0, fly: 0, launch: 0 });
  const tmp = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      fwd: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      pivot: new THREE.Vector3(),
      want: new THREE.Vector3(),
      look: new THREE.Vector3(),
    }),
    [],
  );

  useFrame(({ clock }, dt) => {
    const car = vehicleState.active;
    const s = state.current;
    if (!car || useGame.getState().mode !== 'driving') {
      s.active = false;
      return;
    }
    const { pos, q, fwd, dir, pivot, want, look } = tmp;
    car.object.getWorldPosition(pos);
    car.object.getWorldQuaternion(q);
    if (car.flying && car.heading !== undefined) {
      // In the air (and while tumbling) follow the flight heading, not the spinning body.
      fwd.set(Math.sin(car.heading), 0, Math.cos(car.heading));
    } else {
      fwd.set(0, 0, 1).applyQuaternion(q);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, 1);
      fwd.normalize();
    }
    const flying = !!car.flying;

    const l = consumeLook();
    if (l.x !== 0 || l.y !== 0) s.lastLook = clock.elapsedTime;
    s.orbit -= l.x;
    s.pitch = THREE.MathUtils.clamp(s.pitch + l.y, -0.2, 0.9);
    if (clock.elapsedTime - s.lastLook > CHASE_CAMERA.recenterDelay) {
      s.orbit = THREE.MathUtils.damp(s.orbit, 0, 3, dt);
      s.pitch = THREE.MathUtils.damp(s.pitch, 0.18, 3, dt);
    }

    // Direction from the car back toward the camera.
    dir.copy(fwd).multiplyScalar(-1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, s.orbit);
    dir.y = Math.sin(s.pitch);
    dir.normalize();
    pivot.copy(pos).y += CHASE_CAMERA.lookHeight;

    s.fly = THREE.MathUtils.damp(s.fly, flying ? 1 : 0, 2.5, dt);
    let distance: number = THREE.MathUtils.lerp(
      CHASE_CAMERA.distance,
      FLYING.cameraDistance,
      s.fly,
    );
    const exclude = world.getRigidBody(car.bodyHandle);
    const hit = world.castRay(
      new rapier.Ray(pivot, dir),
      distance + CAMERA.collisionMargin,
      true,
      undefined,
      undefined,
      undefined,
      exclude,
    );
    if (hit) distance = Math.max(1.5, hit.timeOfImpact - CAMERA.collisionMargin);

    want.copy(pivot).addScaledVector(dir, distance);
    want.y +=
      THREE.MathUtils.lerp(CHASE_CAMERA.height, FLYING.cameraHeight, s.fly) -
      CHASE_CAMERA.lookHeight;
    if (!s.active) {
      camera.position.copy(want);
      s.active = true;
    } else {
      const k = 1 - Math.exp(-CHASE_CAMERA.stiffness * dt);
      const ky = 1 - Math.exp(-THREE.MathUtils.lerp(CHASE_CAMERA.stiffness, 1.6, s.launch) * dt);
      const y = camera.position.y + (want.y - camera.position.y) * ky;
      camera.position.lerp(want, k);
      camera.position.y = y;
      // Never trail through a wall while catching up.
      if (hit) camera.position.copy(want);
    }
    camera.position.y = Math.max(camera.position.y, 0.4);

    look.copy(pivot).addScaledVector(fwd, 2 * (1 - s.launch));
    camera.lookAt(look);
    const speedT = THREE.MathUtils.clamp(Math.abs(car.speed) / CHASE_CAMERA.fovSpeed, 0, 1);
    const fov = THREE.MathUtils.lerp(CHASE_CAMERA.fovBase, CHASE_CAMERA.fovAtSpeed, speedT);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = THREE.MathUtils.damp(camera.fov, fov, 4, dt);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
