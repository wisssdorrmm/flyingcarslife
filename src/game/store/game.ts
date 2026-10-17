import { create } from 'zustand';
import { consumePress } from '../systems/input';

export type PlayerMode = 'onFoot' | 'driving';

/** Vehicle readout for the HUD, updated ~10×/s (never per frame). */
export interface VehicleHud {
  speed: number;
  battery: number;
  damage: number;
  reversing: boolean;
  /** Gear letter: R, N or 1–6. */
  gear: string;
  /** Height above ground (m) while flying, else absent. */
  altitude?: number;
}

interface GameState {
  mode: PlayerMode;
  /** Id of the vehicle being driven, if any. */
  vehicleId: string | null;
  /** Context prompt: 'drive', or 'place:<id>' near a business entrance. */
  prompt: string | null;
  vehicleHud: VehicleHud | null;
  /** The place whose menu is open (player controls are paused while it is). */
  openPlaceId: string | null;
  openPlace: (id: string) => void;
  closePlace: () => void;
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
  openPlaceId: null,
  openPlace: (id) => {
    // Give the mouse back so the menu can be clicked.
    if (document.pointerLockElement) document.exitPointerLock();
    set({ openPlaceId: id, prompt: null });
  },
  closePlace: () => {
    // Swallow the E that closed the menu so it doesn't reopen it next frame.
    consumePress('interact');
    set({ openPlaceId: null });
  },
  enterVehicle: (id) => set({ mode: 'driving', vehicleId: id, prompt: null }),
  exitVehicle: () => set({ mode: 'onFoot', vehicleId: null, vehicleHud: null }),
  setPrompt: (prompt) => set((s) => (s.prompt === prompt ? s : { prompt })),
  setVehicleHud: (vehicleHud) => set({ vehicleHud }),
}));
