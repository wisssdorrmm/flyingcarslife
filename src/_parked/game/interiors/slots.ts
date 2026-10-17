import type { InteriorType } from './interiorDefs';

/**
 * Interiors sit on a grid far outside the city (the city spans about ±400 m), so they never
 * overlap streets or each other. Homes get a slot from their owner's id (everyone's home is its
 * own copy); the club has one shared slot so everyone dances together.
 */
const ORIGIN = 3000;
const SPACING = 60;
const GRID = 400;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function interiorOrigin(type: InteriorType, ownerId: string | null): [number, number] {
  if (type === 'club' || !ownerId) return [ORIGIN - SPACING * 2, ORIGIN - SPACING * 2];
  const n = hash(`${type}:${ownerId}`) % (GRID * GRID);
  return [ORIGIN + (n % GRID) * SPACING, ORIGIN + Math.floor(n / GRID) * SPACING];
}
