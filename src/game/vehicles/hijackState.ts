import { create } from 'zustand';

export type HijackTarget =
  { kind: 'traffic'; id: number; label: string } | { kind: 'left'; id: number; label: string };

/** What the player could take over right now (read by the HUD prompt and touch button). */
export const useHijack = create<{ target: HijackTarget | null }>()(() => ({ target: null }));

/** Fired when the player takes a car from traffic (police treat it as car theft). */
export const hijackHooks = new Set<(at: { x: number; z: number }) => void>();
