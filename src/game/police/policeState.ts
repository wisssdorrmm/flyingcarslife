/**
 * Shared police knowledge. Ground units can't follow into the air: when the player launches they
 * head for the launch point and stop there.
 */
import * as THREE from 'three';
import { launchHooks } from '../vehicles/flight';

export const policeState = {
  /** Where the player last took off (null once they're back on the ground). */
  launchPoint: null as THREE.Vector3 | null,
};

launchHooks.add((at) => {
  policeState.launchPoint = new THREE.Vector3(at.x, at.y, at.z);
});
