import { create } from 'zustand';
import type { InteriorType } from '../interiors/interiorDefs';

/** One placed piece of furniture in a home (local coordinates, radians). */
export interface PlacedItem {
  uid: string;
  item: string;
  x: number;
  z: number;
  rot: number;
}

export type Location =
  | { kind: 'street' }
  | {
      kind: 'interior';
      type: InteriorType;
      /** Profile id of the home's owner (null for public places like the club). */
      ownerId: string | null;
      ownerName: string;
      /** Street door to come back out of (place id). */
      placeId: string;
      /** Furniture to show when visiting someone else's home (yours come from your save). */
      visitLayout?: PlacedItem[];
    };

interface LocationState {
  location: Location;
  /** Furnishing mode in your own home. */
  furnishing: boolean;
  setLocation: (l: Location) => void;
  setFurnishing: (on: boolean) => void;
}

export const useLocation = create<LocationState>()((set) => ({
  location: { kind: 'street' },
  furnishing: false,
  setLocation: (location) => set({ location, furnishing: false }),
  setFurnishing: (furnishing) => {
    if (furnishing && document.pointerLockElement) document.exitPointerLock();
    set({ furnishing });
  },
}));
