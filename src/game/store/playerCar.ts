import { create } from 'zustand';

/** Which car the player drives: their flying car, or an ordinary car taken from traffic. */
export type PlayerCarModel = 'ev' | 'sedan' | 'police';

export interface PlayerCarSpec {
  /** Changes whenever the player switches cars (remounts the drivable car). */
  key: number;
  /** Garage car id (sets power and flight time); absent for cars taken from traffic. */
  carId?: string;
  model: PlayerCarModel;
  paint: string;
  /** Wheel finish id (GARAGE.wheels). */
  wheels?: string;
  /** Only flying cars can rocket-launch. */
  canFly: boolean;
  position: [number, number, number];
  heading: number;
  /** Speed carried into the new car (m/s, along its heading). */
  speed: number;
}

/** A car the player got out of, left standing where it was. */
export interface LeftCar {
  id: number;
  model: PlayerCarModel;
  paint: string;
  canFly: boolean;
  position: [number, number, number];
  /** Body orientation (quaternion), so it stays as it was left. */
  rotation: [number, number, number, number];
}

interface PlayerCarState {
  car: PlayerCarSpec | null;
  /** Cars left behind (the flying car among them after a hijack). Oldest are cleared first. */
  left: LeftCar[];
  setCar: (car: Omit<PlayerCarSpec, 'key'>) => void;
  leave: (car: Omit<LeftCar, 'id'>) => void;
  removeLeft: (id: number) => void;
}

let nextKey = 1;
let nextId = 1;
const MAX_LEFT = 4;

export const usePlayerCar = create<PlayerCarState>()((set) => ({
  car: null,
  left: [],
  setCar: (car) => set({ car: { ...car, key: nextKey++ } }),
  leave: (car) =>
    set((s) => {
      // Never drop the flying car when trimming the list.
      const list = [...s.left, { ...car, id: nextId++ }];
      while (list.length > MAX_LEFT) {
        const i = list.findIndex((c) => !c.canFly);
        list.splice(i >= 0 ? i : 0, 1);
      }
      return { left: list };
    }),
  removeLeft: (id) => set((s) => ({ left: s.left.filter((c) => c.id !== id) })),
}));
