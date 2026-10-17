/**
 * Who owns which ad building: bookings from src/data/building-ads.json (same shape the future
 * backend will serve). Entries with a building_id take that building; entries without one (the
 * owner's own brands) rotate across every building nobody booked, with every fourth one shown as
 * "available".
 */
import { create } from 'zustand';
import ads from '../../data/building-ads.json';
import type { AdBuilding } from '../city/format';

export interface BuildingAdEntry {
  building_id: string;
  brand: string;
  category: string;
  tagline: string;
  description: string;
  website: string;
  contact: string;
  logo: string;
  colors: { bg: string; fg: string; accent: string };
  start_date: string;
  end_date: string;
  /** How often an unassigned brand comes up in the rotation (the top advertiser gets more). */
  weight?: number;
}

export interface AdPlacement {
  building: AdBuilding;
  /** null = available for advertisers. */
  ad: BuildingAdEntry | null;
}

export function assignBuildingAds(
  buildings: AdBuilding[],
  spawn?: { x: number; z: number },
): AdPlacement[] {
  const today = new Date().toISOString().slice(0, 10);
  const live = (ads as BuildingAdEntry[]).filter(
    (a) => a.start_date <= today && today <= a.end_date,
  );
  const byId = new Map(live.filter((a) => a.building_id).map((a) => [a.building_id, a]));
  const house = live.filter((a) => !a.building_id);
  // Weighted rotation, interleaved: top brand, another, top brand, another… (the top brand
  // appears `weight` times as often as the others combined allow).
  const [first, ...others] = house;
  const rotation: BuildingAdEntry[] = [];
  let topLeft = Math.max(1, first?.weight ?? 1);
  for (const o of others) {
    if (first && topLeft-- > 0) rotation.push(first);
    for (let w = 0; w < Math.max(1, o.weight ?? 1); w++) rotation.push(o);
  }
  if (first) while (topLeft-- > 0 || !rotation.length) rotation.push(first);
  const top = house[0];
  // The buildings nearest the start always carry the top brand.
  const nearStart = new Set(
    spawn && top
      ? [...buildings]
          .filter((b) => !byId.has(b.id))
          .sort((a, b) => distTo(a, spawn) - distTo(b, spawn))
          .slice(0, 3)
          .map((b) => b.id)
      : [],
  );
  let free = 0;
  // Unbooked buildings carry the owner's brands in turn; every fourth says it's available.
  return buildings.map((b) => {
    const booked = byId.get(b.id);
    if (booked) return { building: b, ad: booked };
    if (nearStart.has(b.id)) return { building: b, ad: top! };
    const k = free++;
    if (!rotation.length || k % 4 === 3) return { building: b, ad: null };
    return { building: b, ad: rotation[(k - Math.floor(k / 4)) % rotation.length]! };
  });
}

function distTo(b: AdBuilding, p: { x: number; z: number }): number {
  return Math.hypot((b.ax + b.bx) / 2 - p.x, (b.az + b.bz) / 2 - p.z);
}

/** The ad building whose details card is showing (near the car, or tapped). */
export const useAdCard = create<{ placement: AdPlacement | null }>()(() => ({ placement: null }));
