/**
 * Debug teleports for the rocket-launch test scenes (CLAUDE.md §6.2):
 *  - "Bridge launch": The Embarcadero heading toward the Ferry Building, the Bay Bridge and the
 *    downtown towers, in traffic, with a police car in the same traffic right behind.
 *  - "Rooftop launch": the multi-level car park at Fisherman's Wharf, ground floor, with a police
 *    car chasing the player up the ramps.
 *  - "Rooftop (on the roof)": same car park, starting on the roof with the police coming up.
 */
import { create } from 'zustand';
import { loadCity, preloadAround } from '../city/cityData';
import { TEST_SCENES } from '../config';
import { useCity } from '../city/cityData';
import { trafficRef } from '../traffic/trafficSim';
import { vehicleState } from '../vehicles/vehicleState';
import { carParkBase, carParkLayout } from './carParkLayout';

export type TestScene = 'bridge' | 'rooftop' | 'rooftop-roof';

export const TEST_SCENE_NAMES: Record<TestScene, string> = {
  bridge: 'Bridge launch',
  rooftop: 'Rooftop launch',
  'rooftop-roof': 'Rooftop (on the roof)',
};

interface TestSceneState {
  /** A police chaser to spawn (rooftop scenes); `key` changes every run so it respawns. */
  chaser: { key: number; start: [number, number, number]; heading: number } | null;
  set: (s: Partial<TestSceneState>) => void;
}

export const useTestScene = create<TestSceneState>()((set) => ({
  chaser: null,
  set: (s) => set(s),
}));

let runs = 0;

export async function runTestScene(scene: TestScene): Promise<void> {
  const city = useCity.getState().city ?? (await loadCity());
  const car = vehicleState.active;
  if (!car?.teleport) return;
  runs++;

  if (scene === 'bridge') {
    // Southbound along The Embarcadero, nearest stretch to the configured spot.
    const { index } = city;
    const id = index.streets.indexOf(TEST_SCENES.bridge.street);
    const [nx, nz] = TEST_SCENES.bridge.near;
    let best = -1;
    let bestD = Infinity;
    index.edges.forEach((e, i) => {
      if (e.name !== id || e.length < 60) return;
      const n = e.pts.length;
      const southbound = e.pts[n - 1]! - e.pts[1]! > 0;
      if (e.oneway && !southbound) return;
      const m = Math.floor(n / 4) * 2;
      const d = Math.hypot(e.pts[m]! - nx, e.pts[m + 1]! - nz);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best < 0) return;
    const e = index.edges[best]!;
    const n = e.pts.length;
    const fwd = e.oneway || e.pts[n - 1]! - e.pts[1]! > 0;
    // Stand two-thirds along, in the right-hand lane.
    const along = e.length * 0.66;
    const pts = fwd ? e.pts : reversePts(e.pts);
    const { x, z, dx, dz } = pointAlong(pts, along);
    const lane = e.oneway
      ? e.laneOffset + (e.lanes / 2 - 0.5) * 3.2
      : (fwd ? 1 : -1) * (Math.max(1, fwd ? e.lanesFwd : e.lanes - e.lanesFwd) - 0.5) * 3.2;
    // Lane offset is relative to a → b; flip it for b → a.
    const off = fwd ? lane : -lane;
    const px = x + -dz * off;
    const pz = z + dx * off;
    await preloadAround(city, px, pz, 260);
    car.teleport(px, city.heightAt(px, pz) + 0.6, pz, Math.atan2(dx, dz));
    useTestScene.getState().set({ chaser: null });
    // A police car in the same traffic, right behind (it ignores the player).
    window.setTimeout(() => {
      trafficRef.sim?.spawnOn(best, fwd, along - TEST_SCENES.policeBehind, {
        police: true,
        speed: 0,
      });
    }, 300);
    return;
  }

  const C = TEST_SCENES.carPark;
  const base = carParkBase(city);
  const layout = carParkLayout();
  await preloadAround(city, C.x, C.z, 220);
  if (scene === 'rooftop') {
    // Ground floor, lined up with the bays; the police car comes in behind.
    car.teleport(C.x - 6, base + 0.7, C.z - C.length / 2 + 6, 0);
    useTestScene.getState().set({
      chaser: { key: runs, start: [C.x - 6, base + 0.8, C.z - C.length / 2 - 14], heading: 0 },
    });
  } else {
    // On the white roof deck facing the open sky; the police car starts up the ramps.
    car.teleport(C.x - 8, base + layout.roofY + 0.7, C.z + 8, -Math.PI / 2);
    useTestScene.getState().set({
      chaser: {
        key: runs,
        // Level 2, at the foot of the last ramp: it reaches the roof in ~15 s.
        start: [
          C.x + layout.ramps.x,
          base + (C.levels - 1) * C.levelHeight + 0.8,
          C.z + layout.ramps.z0 - 6,
        ],
        heading: 0,
      },
    });
  }
}

function reversePts(p: number[]): number[] {
  const out: number[] = [];
  for (let i = p.length - 2; i >= 0; i -= 2) out.push(p[i]!, p[i + 1]!);
  return out;
}

function pointAlong(p: number[], d: number): { x: number; z: number; dx: number; dz: number } {
  let acc = 0;
  for (let i = 2; i < p.length; i += 2) {
    const sx = p[i]! - p[i - 2]!;
    const sz = p[i + 1]! - p[i - 1]!;
    const l = Math.hypot(sx, sz);
    if (acc + l >= d || i === p.length - 2) {
      const t = Math.min(1, Math.max(0, (d - acc) / (l || 1)));
      return { x: p[i - 2]! + sx * t, z: p[i - 1]! + sz * t, dx: sx / (l || 1), dz: sz / (l || 1) };
    }
    acc += l;
  }
  return { x: p[0]!, z: p[1]!, dx: 0, dz: 1 };
}
