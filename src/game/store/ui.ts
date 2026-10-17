import { create } from 'zustand';

/** Screen-level UI state (menus). Gameplay pauses while the menu is open. */
interface UiState {
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
}

export const useUi = create<UiState>()((set) => ({
  menuOpen: false,
  setMenuOpen: (menuOpen) => {
    // Give the mouse back so the menu can be clicked.
    if (menuOpen && document.pointerLockElement) document.exitPointerLock();
    set({ menuOpen });
  },
}));
