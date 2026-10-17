import type { Collider } from '@dimforge/rapier3d-compat';

/** Static colliders are enabled in chunks within this range (m) of the player or car. */
export const COLLIDER_CHUNK = 80;
export const COLLIDER_RANGE = 140;

export interface ColliderChunk {
  x: number;
  z: number;
  colliders: Collider[];
  enabled: boolean;
}

/** Registered by <WorldColliders>; shared so teleports can wake colliders before arriving. */
export const colliderStreaming = { chunks: [] as ColliderChunk[] };

/** Enables or disables every chunk according to its distance from (x, z). */
export function streamCollidersAround(x: number, z: number): void {
  const reach = COLLIDER_RANGE + COLLIDER_CHUNK * 0.71;
  for (const ch of colliderStreaming.chunks) {
    const want = Math.hypot(ch.x - x, ch.z - z) < reach;
    if (want !== ch.enabled) {
      ch.enabled = want;
      for (const c of ch.colliders) c.setEnabled(want);
    }
  }
}
