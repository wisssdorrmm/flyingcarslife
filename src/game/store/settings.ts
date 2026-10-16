import { create } from 'zustand';
import {
  applyUrlOverrides,
  QUALITY_PRESETS,
  resolveInitialTier,
  saveTierChoice,
  type QualitySettings,
  type QualityTier,
} from '../quality';

interface SettingsState {
  quality: QualitySettings;
  debug: boolean;
  setQualityTier: (tier: QualityTier) => void;
  resetQualityToAuto: () => void;
}

const debugFromUrl = new URLSearchParams(window.location.search).has('debug');

export const useSettings = create<SettingsState>()((set) => ({
  quality: applyUrlOverrides(QUALITY_PRESETS[resolveInitialTier()]),
  debug: debugFromUrl,
  setQualityTier: (tier) => {
    saveTierChoice(tier);
    set({ quality: QUALITY_PRESETS[tier] });
  },
  resetQualityToAuto: () => {
    saveTierChoice(null);
    set({ quality: QUALITY_PRESETS[resolveInitialTier()] });
  },
}));
