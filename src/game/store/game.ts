import { create } from 'zustand';

export type PlayerMode = 'onFoot' | 'driving';

/** Vehicle readout for the HUD, updated ~10×/s (never per frame). */
export interface VehicleHud {
  speed: number;
  battery: number;
  damage: number;
  reversing: boolean;
}

interface GameState {
  mode: PlayerMode;
  /** Id of the vehicle being driven, if any. */
  vehicleId: string | null;
  /** Context prompt such as "Press E to drive". */
  prompt: string | null;
  vehicleHud: VehicleHud | null;
  enterVehicle: (id: string) => void;
  exitVehicle: () => void;
  setPrompt: (prompt: string | null) => void;
  setVehicleHud: (hud: VehicleHud | null) => void;
}

export const useGame = create<GameState>()((set) => ({
  mode: 'onFoot',
  vehicleId: null,
  prompt: null,
  vehicleHud: null,
  enterVehicle: (id) => set({ mode: 'driving', vehicleId: id, prompt: null }),
  exitVehicle: () => set({ mode: 'onFoot', vehicleId: null, vehicleHud: null }),
  setPrompt: (prompt) => set((s) => (s.prompt === prompt ? s : { prompt })),
  setVehicleHud: (vehicleHud) => set({ vehicleHud }),
}));
