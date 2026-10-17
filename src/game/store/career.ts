import { create } from 'zustand';

export type Assist = 'MAN' | 'ABS' | 'TCS' | 'ESP';

/** Player progress that persists between sessions (saved locally; see lib/save.ts). */
export interface CareerSnapshot {
  cash: number;
  /** Driving assists switched on. MAN = manual feel (all others off). */
  assists: Record<Assist, boolean>;
  /** Street ids already driven on ("Roads discovered"). */
  discovered: string[];
  /** Cars owned and the one in use. */
  cars: string[];
  currentCar: string;
  /** Landmark photos taken (ids). */
  photos: string[];
  /** Best time per time trial (s). */
  trials: Record<string, number>;
  /** Paint and wheel choice per owned car. */
  looks: Record<string, { paint: string; wheels: string }>;
}

interface CareerState extends CareerSnapshot {
  addCash: (amount: number) => void;
  spend: (amount: number) => boolean;
  toggleAssist: (a: Assist) => void;
  discover: (streetId: string) => boolean;
  takePhoto: (id: string) => boolean;
  /** Records a trial time; returns true if it's a new best. */
  finishTrial: (id: string, time: number) => boolean;
  buyCar: (id: string, price: number) => boolean;
  selectCar: (id: string) => void;
  setLook: (car: string, look: Partial<{ paint: string; wheels: string }>) => void;
  load: (s: Partial<CareerSnapshot>) => void;
  snapshot: () => CareerSnapshot;
}

export const useCareer = create<CareerState>()((set, get) => ({
  cash: 500,
  assists: { MAN: false, ABS: true, TCS: true, ESP: true },
  discovered: [],
  cars: ['flying-car-ev'],
  currentCar: 'flying-car-ev',
  photos: [],
  trials: {},
  looks: {},
  addCash: (amount) => set((s) => ({ cash: Math.round(s.cash + amount) })),
  spend: (amount) => {
    if (get().cash < amount) return false;
    set((s) => ({ cash: s.cash - amount }));
    return true;
  },
  toggleAssist: (a) =>
    set((s) => {
      // MAN switches the helpers off; turning any helper on leaves manual mode.
      if (a === 'MAN') {
        const man = !s.assists.MAN;
        return { assists: { MAN: man, ABS: !man, TCS: !man, ESP: !man } };
      }
      return { assists: { ...s.assists, [a]: !s.assists[a], MAN: false } };
    }),
  discover: (streetId) => {
    if (get().discovered.includes(streetId)) return false;
    set((s) => ({ discovered: [...s.discovered, streetId] }));
    return true;
  },
  takePhoto: (id) => {
    if (get().photos.includes(id)) return false;
    set((s) => ({ photos: [...s.photos, id] }));
    return true;
  },
  finishTrial: (id, time) => {
    const best = get().trials[id];
    if (best !== undefined && best <= time) return false;
    set((s) => ({ trials: { ...s.trials, [id]: time } }));
    return true;
  },
  buyCar: (id, price) => {
    if (get().cars.includes(id) || !get().spend(price)) return false;
    set((s) => ({ cars: [...s.cars, id] }));
    return true;
  },
  selectCar: (id) => {
    if (get().cars.includes(id)) set({ currentCar: id });
  },
  setLook: (car, look) =>
    set((s) => ({
      looks: { ...s.looks, [car]: { paint: '', wheels: 'stock', ...s.looks[car], ...look } },
    })),
  load: (snap) => set(snap),
  snapshot: () => {
    const { cash, assists, discovered, cars, currentCar, photos, trials, looks } = get();
    return { cash, assists, discovered, cars, currentCar, photos, trials, looks };
  },
}));
