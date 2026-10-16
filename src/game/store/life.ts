import { create } from 'zustand';
import { BODY, NEEDS, START, TIME } from '../config';

export type BmiBand = 'underweight' | 'healthy' | 'overweight' | 'obese';

/** What an action at a place does to you. All fields optional. */
export interface Effect {
  cost?: number;
  kcal?: number;
  /** kcal burned by exercise (on top of resting metabolism over the duration). */
  burn?: number;
  fullness?: number;
  energy?: number;
  mood?: number;
  fitness?: number;
  education?: number;
  /** Game minutes the action takes (the clock skips ahead). */
  minutes?: number;
  /** Restore energy to this level (sleep). */
  energyTo?: number;
}

export interface LifeSnapshot {
  money: number;
  fullness: number;
  energy: number;
  mood: number;
  fitness: number;
  education: number;
  weightKg: number;
  /** Total game minutes since the save began. */
  minutes: number;
  /** kcal eaten today (resets at midnight), for the HUD. */
  kcalToday: number;
}

interface LifeState extends LifeSnapshot {
  /** Short messages shown as toasts ("+190 kcal"). */
  toasts: { id: number; text: string }[];
  /** Advance the simulation: elapsed game minutes and kcal burned by activity meanwhile. */
  tick: (minutes: number, activityKcal: number) => void;
  /** Apply an action's effects. Returns false (and changes nothing) if you can't afford it. */
  apply: (effect: Effect, label: string) => boolean;
  toast: (text: string) => void;
  dismissToast: (id: number) => void;
  load: (s: Partial<LifeSnapshot>) => void;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

export const bmiOf = (weightKg: number) => weightKg / (BODY.heightM * BODY.heightM);

export function bmiBand(bmi: number): BmiBand {
  if (bmi < BODY.bmi.underweight) return 'underweight';
  if (bmi < BODY.bmi.overweight) return 'healthy';
  if (bmi < BODY.bmi.obese) return 'overweight';
  return 'obese';
}

/** Resting metabolism (Mifflin–St Jeor, female) in kcal per game minute. */
export function restingKcalPerMinute(weightKg: number): number {
  const perDay = 10 * weightKg + 6.25 * BODY.heightM * 100 - 5 * BODY.age - 161;
  return perDay / 1440;
}

let toastId = 0;

export const useLife = create<LifeState>()((set, get) => {
  /** Turns a calorie surplus/deficit into body weight. */
  const weightFrom = (weightKg: number, netKcal: number) =>
    clamp(
      weightKg + (netKcal / BODY.kcalPerKg) * BODY.weightChangeSpeed,
      BODY.minWeightKg,
      BODY.maxWeightKg,
    );

  const advance = (
    s: LifeSnapshot,
    minutes: number,
    activityKcal: number,
  ): Partial<LifeSnapshot> => {
    const hours = minutes / 60;
    const band = bmiBand(bmiOf(s.weightKg));
    const hungry = s.fullness < NEEDS.hungerLowThreshold;
    const energyDrain =
      NEEDS.energyDrainPerHour +
      (hungry ? NEEDS.hungerLowExtraEnergyDrainPerHour : 0) +
      (band === 'healthy' ? 0 : BODY.unhealthyEnergyDrainPerHour);
    const burned = restingKcalPerMinute(s.weightKg) * minutes + activityKcal;
    const dayBefore = Math.floor(s.minutes / 1440);
    const after = s.minutes + minutes;
    return {
      minutes: after,
      fullness: clamp(s.fullness - NEEDS.hungerDrainPerHour * hours),
      energy: clamp(s.energy - energyDrain * hours),
      mood: clamp(s.mood - (NEEDS.moodDrainPerHour + (hungry ? 2 : 0)) * hours),
      weightKg: weightFrom(s.weightKg, -burned),
      kcalToday: Math.floor(after / 1440) === dayBefore ? s.kcalToday : 0,
    };
  };

  return {
    money: START.cash,
    fullness: 70,
    energy: 90,
    mood: 70,
    fitness: 30,
    education: 0,
    weightKg: BODY.startWeightKg,
    minutes: TIME.startHour * 60,
    kcalToday: 0,
    toasts: [],

    tick: (minutes, activityKcal) => set((s) => advance(s, minutes, activityKcal)),

    apply: (e, label) => {
      const s = get();
      const cost = e.cost ?? 0;
      if (cost > s.money) {
        get().toast(`Not enough money for ${label}`);
        return false;
      }
      // Time passes first (resting burn over the duration), then the action's own effects.
      const passed = e.minutes ? advance(s, e.minutes, 0) : {};
      const base = { ...s, ...passed };
      const weight = weightFrom(base.weightKg, (e.kcal ?? 0) - (e.burn ?? 0));
      set({
        ...passed,
        money: Math.round((s.money - cost) * 100) / 100,
        fullness: clamp(base.fullness + (e.fullness ?? 0)),
        energy:
          e.energyTo !== undefined
            ? Math.max(base.energy, e.energyTo)
            : clamp(base.energy + (e.energy ?? 0)),
        mood: clamp(base.mood + (e.mood ?? 0)),
        fitness: clamp(base.fitness + (e.fitness ?? 0)),
        education: clamp(base.education + (e.education ?? 0)),
        weightKg: weight,
        kcalToday: (passed.kcalToday ?? s.kcalToday) + (e.kcal ?? 0),
      });
      const bits = [
        cost ? `−$${cost}` : '',
        e.kcal ? `+${e.kcal} kcal` : '',
        e.burn ? `−${e.burn} kcal burned` : '',
        e.fitness ? `+${e.fitness} fitness` : '',
      ].filter(Boolean);
      get().toast(`${label}${bits.length ? ` · ${bits.join(' · ')}` : ''}`);
      return true;
    },

    toast: (text) => {
      const id = ++toastId;
      set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text }] }));
      window.setTimeout(() => get().dismissToast(id), 3500);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    load: (snap) => set(snap),
  };
});

/** Current movement multipliers from body weight and energy: [run, sprint, jump]. */
export function movementFactors(): [number, number, number] {
  const s = useLife.getState();
  const [run, sprint, jump] = BODY.movement[bmiBand(bmiOf(s.weightKg))];
  const tired = s.energy < NEEDS.energyLowThreshold ? NEEDS.lowEnergySpeedMultiplier : 1;
  return [run * tired, sprint * tired, jump];
}

/** "Day 2 · 14:05" for the HUD. */
export function clockLabel(minutes: number): string {
  const day = Math.floor(minutes / 1440) + 1;
  const m = Math.floor(minutes % 1440);
  return `Day ${day} · ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
