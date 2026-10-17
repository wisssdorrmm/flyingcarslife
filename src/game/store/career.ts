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
}

interface CareerState extends CareerSnapshot {
  addCash: (amount: number) => void;
  spend: (amount: number) => boolean;
  toggleAssist: (a: Assist) => void;
  discover: (streetId: string) => boolean;
  load: (s: Partial<CareerSnapshot>) => void;
  snapshot: () => CareerSnapshot;
}

export const useCareer = create<CareerState>()((set, get) => ({
  cash: 500,
  assists: { MAN: false, ABS: true, TCS: true, ESP: true },
  discovered: [],
  cars: ['flying-car-ev'],
  currentCar: 'flying-car-ev',
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
  load: (snap) => set(snap),
  snapshot: () => {
    const { cash, assists, discovered, cars, currentCar } = get();
    return { cash, assists, discovered, cars, currentCar };
  },
}));
