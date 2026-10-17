import { create } from 'zustand';
import type { Trial } from '../goals/goalsData';

export interface ActiveTrial {
  id: string;
  /** Next checkpoint index. */
  next: number;
  /** Seconds left in the start countdown (> 0), then the running time. */
  countdown: number;
  time: number;
}

/** Goal runtime state for the HUD and menus (logic lives in goals/Goals.tsx). */
interface GoalsState {
  trials: Trial[];
  active: ActiveTrial | null;
  /** Time of the last photo (for the camera flash). */
  photoAt: number;
  set: (s: Partial<Omit<GoalsState, 'set'>>) => void;
}

export const useGoals = create<GoalsState>()((set) => ({
  trials: [],
  active: null,
  photoAt: 0,
  set: (s) => set(s),
}));
