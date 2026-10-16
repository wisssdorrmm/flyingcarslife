import type * as THREE from 'three';

/** The vehicle the player is driving, shared with the chase camera. Mutable per-frame state. */
export const vehicleState = {
  active: null as null | {
    id: string;
    /** Visual root (interpolated physics transform). */
    object: THREE.Object3D;
    /** Rapier rigid body handle, so camera rays can ignore the car. */
    bodyHandle: number;
    /** Forward speed in m/s (negative when reversing). */
    speed: number;
  },
};
