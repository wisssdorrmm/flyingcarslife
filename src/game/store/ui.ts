import { create } from 'zustand';

/** Screen-level UI state (menus). Gameplay pauses while the menu is open. */
interface UiState {
  menuOpen: boolean;
  raceOpen: boolean;
  garageOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  setRaceOpen: (open: boolean) => void;
  setGarageOpen: (open: boolean) => void;
}

export const useUi = create<UiState>()((set) => ({
  menuOpen: false,
  raceOpen: false,
  garageOpen: false,
  setRaceOpen: (raceOpen) => set({ raceOpen }),
  setGarageOpen: (garageOpen) => set({ garageOpen }),
  setMenuOpen: (menuOpen) => {
    // Give the mouse back so the menu can be clicked.
    if (menuOpen && document.pointerLockElement) document.exitPointerLock();
    set({ menuOpen });
  },
}));
