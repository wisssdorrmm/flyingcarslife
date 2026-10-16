import * as THREE from 'three';
import {
  BAY,
  cityBuildings,
  entranceBay,
  facadeFrame,
  type BuildingSpec,
  type Side,
} from '../world/buildingLayout';
import { buildingOffset, ROADS } from '../world/cityPlan';
import { PLACES, type PlaceDef } from './catalog';

export interface Place extends PlaceDef {
  building: BuildingSpec;
  side: Side;
  /** Where the player stands to go in (on the sidewalk, in front of the entrance). */
  door: THREE.Vector3;
  /** Facade rotation (outward normal = local +z) and the entrance center on the facade plane. */
  rotY: number;
  entrance: THREE.Vector3;
}

const FACADE_FOR_ROAD_SIDE = {
  x: { north: 's', south: 'n' },
  z: { west: 'e', east: 'w' },
} as const;

function findBuilding(def: PlaceDef, taken: Set<string>): { building: BuildingSpec; side: Side } {
  const road = ROADS.find((r) => r.id === def.at.road);
  if (!road) throw new Error(`Place ${def.id}: unknown road ${def.at.road}`);
  const side = (FACADE_FOR_ROAD_SIDE[road.axis] as Record<string, Side | undefined>)[def.at.side];
  if (!side) throw new Error(`Place ${def.id}: ${def.at.side} is not a side of ${road.name}`);
  const line =
    side === 's' || side === 'e'
      ? road.coord - buildingOffset(road)
      : road.coord + buildingOffset(road);
  const candidates = cityBuildings().filter((b) => {
    if (!b.streetSides.includes(side) || taken.has(`${b.id}:${side}`) || b.placeId) return false;
    const edge = side === 's' ? b.z1 : side === 'n' ? b.z0 : side === 'e' ? b.x1 : b.x0;
    return Math.abs(edge - line) < 0.5;
  });
  const along = (b: BuildingSpec) => {
    const [a0, a1] = side === 'n' || side === 's' ? [b.x0, b.x1] : [b.z0, b.z1];
    return def.at.along < a0 ? a0 - def.at.along : def.at.along > a1 ? def.at.along - a1 : 0;
  };
  const best = candidates.sort((a, b) => along(a) - along(b))[0];
  if (!best)
    throw new Error(`Place ${def.id}: no free building on ${def.at.side} side of ${road.name}`);
  return { building: best, side };
}

let cached: Place[] | null = null;

/**
 * Assigns every place in the catalog to a building, marks those buildings (shopfront, facade
 * override) and computes their entrances. Must run before buildings are built (Buildings calls it).
 */
export function cityPlaces(): Place[] {
  if (cached) return cached;
  const taken = new Set<string>();
  cached = PLACES.map((def) => {
    const { building, side } = findBuilding(def, taken);
    taken.add(`${building.id}:${side}`);
    building.placeId = def.id;
    building.shopfront = true;
    if (def.variant) building.variant = def.variant;

    const { origin, rotY, length } = facadeFrame(building, side);
    const u = (entranceBay(Math.round(length / BAY)) + 0.5) * BAY;
    const run = new THREE.Vector3(Math.cos(rotY), 0, -Math.sin(rotY));
    const out = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
    const entrance = origin.clone().addScaledVector(run, u);
    const door = entrance.clone().addScaledVector(out, 1.1);
    return { ...def, building, side, rotY, entrance, door };
  });
  return cached;
}

export function placeById(id: string): Place | undefined {
  return cityPlaces().find((p) => p.id === id);
}
