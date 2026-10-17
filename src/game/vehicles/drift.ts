/**
 * Drift scoring: points build up while the car slides (faster and wider = more), the multiplier
 * climbs the longer the drift lasts, and the total is paid out as cash once the car straightens.
 * A crash mid-drift loses it. Fed from the physics step; the HUD reads the store at ~10 Hz.
 */
import { create } from 'zustand';
import { DRIFT } from '../config';
import { useCareer } from '../store/career';
import { toast } from '../store/toasts';

interface DriftHud {
  active: boolean;
  points: number;
  multiplier: number;
  /** 0..1 progress toward the next multiplier step. */
  combo: number;
}

export const useDrift = create<DriftHud>()(() => ({
  active: false,
  points: 0,
  multiplier: 1,
  combo: 0,
}));

const state = {
  points: 0,
  /** Seconds of unbroken drifting (sets the multiplier). */
  time: 0,
  /** Seconds since the car last slid. */
  idle: Infinity,
  hudTimer: 0,
};

const multiplierOf = (t: number) =>
  Math.min(DRIFT.maxMultiplier, 1 + Math.floor(t / DRIFT.comboStep));

/** Call every physics step with the car's speed (m/s) and slide angle (rad). */
export function updateDrift(dt: number, speed: number, slip: number): void {
  const sliding = speed > DRIFT.minSpeed && slip > DRIFT.minSlip;
  if (sliding) {
    const factor = Math.min(1, (slip - DRIFT.minSlip) / 0.6 + 0.25);
    state.points += speed * factor * DRIFT.pointsRate * dt;
    state.time += dt;
    state.idle = 0;
  } else if (state.points > 0) {
    state.idle += dt;
    if (state.idle > DRIFT.endAfter) bank();
  }
  state.hudTimer -= dt;
  if (state.hudTimer <= 0) {
    state.hudTimer = 0.1;
    const active = state.points > 0;
    useDrift.setState({
      active,
      points: Math.round(state.points),
      multiplier: multiplierOf(state.time),
      combo: active ? (state.time % DRIFT.comboStep) / DRIFT.comboStep : 0,
    });
  }
}

function bank(): void {
  const mult = multiplierOf(state.time);
  const cash = Math.round(state.points * mult * DRIFT.cashPerPoint);
  if (cash > 0) {
    useCareer.getState().addCash(cash);
    toast(`Drift +$${cash}${mult > 1 ? `  ×${mult}` : ''}`, 'reward');
  }
  reset();
}

/** A hard hit ends the drift without paying. */
export function crashDrift(): void {
  if (state.points > 50) toast('Drift lost', 'warn');
  reset();
}

function reset(): void {
  state.points = 0;
  state.time = 0;
  state.idle = Infinity;
  useDrift.setState({ active: false, points: 0, multiplier: 1, combo: 0 });
}
