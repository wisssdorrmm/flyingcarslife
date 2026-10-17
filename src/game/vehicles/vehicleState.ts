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
    /** Body color, so other players see the same car. */
    paint: string;
    /** Airborne under its own power (rocket launch / flight / glide). */
    flying?: boolean;
    /** Stable heading for the camera while flying (radians, 0 faces +z). */
    heading?: number;
    /** Flight phase (vehicles/flight.ts FlightMode). */
    flightPhase?: string;
    /** Moves the car (stopped, on its wheels) — used by debug test scenes. */
    teleport?: (x: number, y: number, z: number, heading: number) => void;
  },
};
