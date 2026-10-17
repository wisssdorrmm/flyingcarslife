import { useCity } from '../city/cityData';
import { vehicleState } from '../vehicles/vehicleState';
import { resolvePlace } from './places';
import type { MissionDef } from './types';

/** Puts the car at a mission's start marker (Play / Retry). */
export function teleportToStart(def: MissionDef): void {
  const city = useCity.getState().city;
  const car = vehicleState.active;
  if (!city || !car?.teleport) return;
  const spot = resolvePlace(city, def.start);
  car.teleport(spot.x, spot.y + 0.8, spot.z, spot.heading);
}
