import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { CAMERA } from '../config';
import { consumeLook } from '../systems/input';
import { cameraState, playerState } from './playerState';

/**
 * Orbiting over-the-shoulder camera. A ray from the player's head to the desired camera spot
 * pulls the camera in front of any wall, so it never clips inside buildings.
 */
export function ThirdPersonCamera() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const { world, rapier } = useRapier();
  const state = useRef<{ distance: number; pivotY: number }>({
    distance: CAMERA.distance,
    pivotY: Number.NaN,
  });
  const tmp = useMemo(
    () => ({
      pivot: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      right: new THREE.Vector3(),
      origin: new THREE.Vector3(),
      target: new THREE.Vector3(),
    }),
    [],
  );

  useEffect(() => {
    camera.fov = CAMERA.fov;
    camera.near = 0.05;
    camera.updateProjectionMatrix();
  }, [camera]);

  useFrame((_, dt) => {
    const player = playerState.object;
    if (!player) return;

    const look = consumeLook();
    cameraState.yaw -= look.x;
    cameraState.pitch = THREE.MathUtils.clamp(
      cameraState.pitch + look.y,
      CAMERA.pitchMin,
      CAMERA.pitchMax,
    );
    const { yaw, pitch } = cameraState;

    // Pivot at head height; vertical motion is smoothed so curb steps don't jolt the view.
    const { pivot, dir, right, origin, target } = tmp;
    player.getWorldPosition(pivot);
    const s = state.current;
    const wantY = pivot.y + CAMERA.pivotHeight;
    s.pivotY = Number.isNaN(s.pivotY)
      ? wantY
      : THREE.MathUtils.damp(s.pivotY, wantY, CAMERA.pivotSmoothing, dt);
    pivot.y = s.pivotY;

    // Direction from the pivot back to the camera (opposite of where the camera looks).
    dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    origin.copy(pivot).addScaledVector(right, CAMERA.shoulder);

    // Collision: cast from the shoulder point toward the desired camera position.
    let allowed: number = CAMERA.distance;
    const ray = new rapier.Ray(origin, dir);
    const exclude =
      playerState.bodyHandle >= 0 ? world.getRigidBody(playerState.bodyHandle) : undefined;
    const hit = world.castRay(
      ray,
      CAMERA.distance + CAMERA.collisionMargin,
      true,
      undefined,
      undefined,
      undefined,
      exclude,
    );
    if (hit) allowed = Math.max(CAMERA.minDistance, hit.timeOfImpact - CAMERA.collisionMargin);

    // Snap in immediately when blocked; ease back out when clear.
    s.distance =
      allowed < s.distance ? allowed : Math.min(allowed, s.distance + CAMERA.returnSpeed * dt);

    camera.position.copy(origin).addScaledVector(dir, s.distance);
    camera.position.y = Math.max(camera.position.y, 0.25);
    target.copy(origin).addScaledVector(dir, -2);
    camera.lookAt(target);
  });

  return null;
}
