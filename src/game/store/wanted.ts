import { create } from 'zustand';

/** Wanted level and pursuit state (driven by the police system; read by the HUD). */
interface WantedState {
  /** 0–5 stars. */
  stars: number;
  /** True while units chase the player. */
  pursuit: boolean;
  /** Cash paid if the player escapes now. */
  evadeReward: number;
  /** 0..1 while stars are flashing toward escape (out of sight). */
  escape: number;
  set: (s: Partial<Omit<WantedState, 'set'>>) => void;
}

export const useWanted = create<WantedState>()((set) => ({
  stars: 0,
  pursuit: false,
  evadeReward: 0,
  escape: 0,
  set: (s) => set(s),
}));
