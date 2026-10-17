/**
 * Ground height for mission things (plane, people, markers). The terrain grid doesn't know about
 * piers and decks, so when the physics world is available we raycast its fixed colliders.
 */
import type { City } from '../city/cityData';

type Probe = (x: number, yFrom: number, z: number) => number | null;

let probe: Probe | null = null;

/** Installed by MissionRunner (it has the physics world). */
export function setGroundProbe(p: Probe | null): void {
  probe = p;
}

export function groundAt(city: City, x: number, z: number): number {
  const terrain = city.heightAt(x, z);
  return probe?.(x, terrain + 25, z) ?? terrain;
}
