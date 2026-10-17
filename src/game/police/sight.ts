import type { RigidBody, World } from '@dimforge/rapier3d-compat';
import type { useRapier } from '@react-three/rapier';
import type * as THREE from 'three';

type Rapier = ReturnType<typeof useRapier>['rapier'];

/**
 * True if nothing solid is between `from` and the player's car at `to`.
 * `ignore` is the looker's own body (so a cruiser's ray doesn't hit itself).
 */
export function lineOfSight(
  world: World,
  rapier: Rapier,
  from: THREE.Vector3,
  to: THREE.Vector3,
  carBody: number,
  ignore?: RigidBody,
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.5) return true;
  const ray = new rapier.Ray(
    { x: from.x, y: from.y, z: from.z },
    { x: dx / len, y: dy / len, z: dz / len },
  );
  const hit = world.castRay(ray, len, true, undefined, undefined, undefined, ignore);
  if (!hit) return true;
  return hit.collider.parent()?.handle === carBody;
}
