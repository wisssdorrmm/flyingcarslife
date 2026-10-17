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
}

export interface AdPlacement {
  building: AdBuilding;
  /** null = available for advertisers. */
  ad: BuildingAdEntry | null;
}

export function assignBuildingAds(buildings: AdBuilding[]): AdPlacement[] {
  const today = new Date().toISOString().slice(0, 10);
  const live = (ads as BuildingAdEntry[]).filter(
    (a) => a.start_date <= today && today <= a.end_date,
  );
  const byId = new Map(live.filter((a) => a.building_id).map((a) => [a.building_id, a]));
  const house = live.filter((a) => !a.building_id);
  let free = 0;
  // Buildings come ranked by prominence. Unbooked ones carry the owner's brands in turn, with
  // every fourth one advertising that it's available.
  return buildings.map((b) => {
    const booked = byId.get(b.id);
    if (booked) return { building: b, ad: booked };
    const k = free++;
    if (!house.length || k % 4 === 3) return { building: b, ad: null };
    return { building: b, ad: house[(k - Math.floor(k / 4)) % house.length]! };
  });
}

/** The ad building whose details card is showing (near the car, or tapped). */
export const useAdCard = create<{ placement: AdPlacement | null }>()(() => ({ placement: null }));
