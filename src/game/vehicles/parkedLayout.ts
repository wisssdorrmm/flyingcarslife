import { LAYOUT } from '../world/layout';
import type { CarLook } from './carModel';

export interface ParkedCar extends CarLook {
  position: [number, number, number];
  /** Heading in radians; 0 faces +z (the model's front). */
  heading: number;
}

const laneCenter = LAYOUT.mainHalfWidth - LAYOUT.mainLanes.parking / 2;

export const PARKED: ParkedCar[] = [
  // Eastbound parking lane (south side), facing east.
  { position: [34, 0, laneCenter], heading: Math.PI / 2, paint: '#1d2024' },
  // Westbound parking lane (north side), facing west.
  { position: [-41, 0, -laneCenter], heading: -Math.PI / 2, paint: '#8e1218' },
  { position: [22, 0, -laneCenter], heading: -Math.PI / 2, paint: '#5d6670' },
];

/** Collision box for the Flying Car EV: half extents and center offset in the car's frame. */
export const CAR_COLLIDER = {
  halfExtents: [0.95, 0.6, 2.15] as const,
  center: [0, 0.6, 0.24] as const,
};

/** The player's drivable Flying Car, parked by the spawn point. */
export const PLAYER_CAR = {
  id: 'player-car',
  position: [-24, 0.1, laneCenter] as [number, number, number],
  heading: Math.PI / 2,
  paint: '#eceef0',
};
