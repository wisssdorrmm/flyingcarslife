import * as THREE from 'three';
import { CAMERA, PLAYER } from '../config';
import type { EmoteName } from '../net/types';

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
  /** Set to move the player instantly (e.g. stepping out of a car); consumed by <Player>. */
  teleport: null as THREE.Vector3 | null,
  /** Visual facing (radians about Y, 0 = +z) and current animation, for multiplayer. */
  yaw: 0,
  anim: 'idle' as 'idle' | 'walk' | 'run' | 'sprint' | 'jump' | 'fall',
  /** Emote in progress (start = performance.now() ms); cleared when it ends or you move. */
  emote: null as { name: EmoteName; start: number } | null,
  /** While set (and standing still), the character turns to face this world point. */
  faceToward: null as { x: number; z: number } | null,
};

/** Starts an emote on the local player (others see it via the next network update). */
export function playEmote(name: EmoteName): void {
  playerState.emote = { name, start: performance.now() };
}

/** Camera-relative forward and right vectors on the ground plane for the current yaw. */
export function cameraBasis(yaw: number): { forward: THREE.Vector2; right: THREE.Vector2 } {
  // three cameras look down −z at yaw 0.
  return {
    forward: new THREE.Vector2(-Math.sin(yaw), -Math.cos(yaw)),
    right: new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw)),
  };
}
