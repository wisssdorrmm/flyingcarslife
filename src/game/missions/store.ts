/**
 * Mission progress (saved locally) and the running mission's HUD-facing state.
 * Gameplay logic lives in MissionRunner; this store is what the UI renders.
 */
import { create } from 'zustand';
import { useCareer } from '../store/career';
import { missionFor } from './levels';
import type { MissionDef } from './types';

const STORAGE_KEY = 'fcl.missions';

export interface MissionProgress {
  /** Highest level that can be played. */
  unlocked: number;
  /** Best rating (1–3) per level. */
  best: Record<number, number>;
  /** Total cash earned from missions (bragging rights on the list screen). */
  earned: number;
}

export type MissionStatus = 'briefing' | 'running' | 'passed' | 'failed';

export interface ActiveMission {
  def: MissionDef;
  status: MissionStatus;
  stage: number;
  /** HUD objective line. */
  objective: string;
  /** Seconds left on the current timer, if any. */
  timer: number | null;
  /** Total time for the current timer, for the bar. */
  timerMax: number | null;
  /** Secondary label, e.g. "2/5" or "Plane departs in". */
  detail: string | null;
  /** Where to go: angle relative to the car's heading (rad, + = right) and distance (m). */
  target: { angle: number; dist: number } | null;
  /** 0–1 progress of a hold/wait action (hijacking, waiting for the crew). */
  hold: number | null;
  armor: number;
  armorMax: number;
  /** Set when passed or failed. */
  rating: number;
  reward: number;
  failReason: string | null;
  /** Seconds since the mission started. */
  elapsed: number;
}

interface MissionState {
  progress: MissionProgress;
  active: ActiveMission | null;
  listOpen: boolean;
  /** Bumped to make the runner (re)start the active mission from its first stage. */
  runId: number;
  /** Level whose start marker is shown in free roam. */
  selected: number;
  setListOpen: (open: boolean) => void;
  select: (level: number) => void;
  /** Shows the briefing card for a level (the player is at its start marker). */
  brief: (level: number) => void;
  /** Starts the briefed mission. */
  begin: () => void;
  retry: () => void;
  abort: () => void;
  patch: (p: Partial<ActiveMission>) => void;
  complete: (rating: number) => void;
  fail: (reason: string) => void;
  close: () => void;
}

function loadProgress(): MissionProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<MissionProgress>;
      return { unlocked: Math.max(1, p.unlocked ?? 1), best: p.best ?? {}, earned: p.earned ?? 0 };
    }
  } catch {
    // Storage blocked or corrupt: start fresh.
  }
  return { unlocked: 1, best: {}, earned: 0 };
}

function saveProgress(p: MissionProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Non-fatal: progress just won't persist.
  }
}

function fresh(def: MissionDef, status: MissionStatus): ActiveMission {
  return {
    def,
    status,
    stage: 0,
    objective: def.stages[0]?.text ?? '',
    timer: null,
    timerMax: null,
    detail: null,
    target: null,
    hold: null,
    armor: def.armor,
    armorMax: def.armor,
    rating: 0,
    reward: 0,
    failReason: null,
    elapsed: 0,
  };
}

const initial = loadProgress();

export const useMissions = create<MissionState>()((set, get) => ({
  progress: initial,
  active: null,
  listOpen: false,
  runId: 0,
  selected: initial.unlocked,
  setListOpen: (listOpen) => {
    if (listOpen && document.pointerLockElement) document.exitPointerLock();
    set({ listOpen });
  },
  select: (level) => set({ selected: Math.min(level, get().progress.unlocked) }),
  brief: (level) => {
    if (get().active?.status === 'running') return;
    if (document.pointerLockElement) document.exitPointerLock();
    set({ active: fresh(missionFor(level), 'briefing'), listOpen: false });
  },
  begin: () => {
    const a = get().active;
    if (!a) return;
    set({ active: fresh(a.def, 'running'), runId: get().runId + 1 });
  },
  retry: () => {
    const a = get().active;
    if (!a) return;
    set({ active: fresh(a.def, 'running'), runId: get().runId + 1 });
  },
  abort: () => {
    const a = get().active;
    if (a?.status === 'running') get().fail('Mission abandoned');
    else set({ active: null });
  },
  patch: (p) => {
    const a = get().active;
    if (a) set({ active: { ...a, ...p } });
  },
  complete: (rating) => {
    const a = get().active;
    if (!a || a.status !== 'running') return;
    const { level, reward } = a.def;
    const prev = get().progress;
    const firstClear = !prev.best[level];
    // Replays pay less, so climbing the ladder is always the best money.
    const paid = firstClear ? reward : Math.round(reward * 0.35);
    const progress: MissionProgress = {
      unlocked: Math.max(prev.unlocked, level + 1),
      best: { ...prev.best, [level]: Math.max(prev.best[level] ?? 0, rating) },
      earned: prev.earned + paid,
    };
    saveProgress(progress);
    useCareer.getState().addCash(paid);
    set({
      progress,
      selected: progress.unlocked,
      active: { ...a, status: 'passed', rating, reward: paid, timer: null, hold: null },
    });
  },
  fail: (reason) => {
    const a = get().active;
    if (!a || a.status !== 'running') return;
    set({ active: { ...a, status: 'failed', failReason: reason, timer: null, hold: null } });
  },
  close: () => set({ active: null }),
}));
