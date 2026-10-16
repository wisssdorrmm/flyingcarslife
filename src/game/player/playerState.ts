import * as THREE from 'three';
import { CAMERA, PLAYER } from '../config';

/**
 * Per-frame player/camera state shared between the controller, camera rig and (later) HUD.
 * Mutable module state, not React state — it changes every frame.
 */
export const cameraState: { yaw: number; pitch: number } = {
  yaw: PLAYER.spawnYaw,
  pitch: CAMERA.startPitch,
};

export const playerState = {
  /** The player's visual root (interpolated physics position). Set by <Player>. */
  object: null as THREE.Object3D | null,
  /** Rapier rigid body handle, so camera rays can ignore the player. */
  bodyHandle: -1,
  velocity: new THREE.Vector3(),
  grounded: true,
};

/** Camera-relative forward and right vectors on the ground plane for the current yaw. */
export function cameraBasis(yaw: number): { forward: THREE.Vector2; right: THREE.Vector2 } {
  // three cameras look down −z at yaw 0.
  return {
    forward: new THREE.Vector2(-Math.sin(yaw), -Math.cos(yaw)),
    right: new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw)),
  };
}
