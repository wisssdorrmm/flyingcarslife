import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { City } from '../city/cityData';
import { GOALS } from '../config';
import { useCareer } from '../store/career';
import { useGoals } from '../store/goals';
import { toast } from '../store/toasts';
import { useUi } from '../store/ui';
import { vehicleState } from '../vehicles/vehicleState';
import { buildTrials, medalFor, PHOTO_SPOTS } from './goalsData';

const beaconMat = new THREE.MeshBasicMaterial({
  color: '#2fd5c0',
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const ringMat = new THREE.MeshBasicMaterial({
  color: '#2fd5c0',
  toneMapped: false,
  transparent: true,
  opacity: 0.85,
});
const nextRingMat = ringMat.clone();
nextRingMat.opacity = 0.25;

/**
 * Exploration goals (CLAUDE.md §6.4): cash for every new street, landmark photo spots (stop near
 * one), and time trials (stop at a start beacon, 3-2-1, drive through the checkpoint rings).
 */
export function Goals({ city }: { city: City }) {
  const trials = useMemo(() => buildTrials(city), [city]);
  useEffect(() => useGoals.getState().set({ trials }), [trials]);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const timer = useRef(0);
  const ring = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const beacons = useRef<THREE.Group>(null);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const car = vehicleState.active;
    if (!car || useUi.getState().menuOpen) return;
    car.object.getWorldPosition(pos);
    const speed = Math.abs(car.speed);
    const career = useCareer.getState();
    const goals = useGoals.getState();

    // Streets and photos a few times a second.
    timer.current -= dt;
    if (timer.current <= 0) {
      timer.current = 0.25;
      if (!car.flying) {
        const { street } = city.graph.locate(pos.x, pos.z);
        if (street && career.discover(street)) {
          career.addCash(GOALS.newStreetCash);
          toast(`New street: ${street}  +$${GOALS.newStreetCash}`, 'reward');
        }
        if (speed < GOALS.photoMaxSpeed) {
          for (const spot of PHOTO_SPOTS) {
            if (Math.hypot(spot.x - pos.x, spot.z - pos.z) > GOALS.photoRange) continue;
            if (!career.takePhoto(spot.id)) continue;
            career.addCash(GOALS.photoCash);
            goals.set({ photoAt: performance.now() });
            toast(`Photo: ${spot.name}  +$${GOALS.photoCash}`, 'reward');
            break;
          }
        }
      }
    }

    // Time trials.
    let active = goals.active;
    if (!active && !car.flying && speed < 6) {
      const t = trials.find((tr) => Math.hypot(tr.start.x - pos.x, tr.start.z - pos.z) < 9);
      if (t && t.checkpoints.length) {
        active = { id: t.id, next: 0, countdown: 3, time: 0 };
        toast(`${t.name}: get ready`, 'info');
      }
    }
    if (active) {
      const t = trials.find((tr) => tr.id === active!.id)!;
      const next = { ...active };
      if (next.countdown > 0) {
        next.countdown -= dt;
        // Driving off before "go" cancels.
        if (Math.hypot(t.start.x - pos.x, t.start.z - pos.z) > 25) {
          goals.set({ active: null });
          return;
        }
      } else {
        next.time += dt;
        const cp = t.checkpoints[next.next]!;
        const d = Math.hypot(cp.x - pos.x, cp.z - pos.z);
        if (d < GOALS.checkpointRadius) next.next++;
        else if (d > 350) {
          toast(`${t.name} abandoned`, 'warn');
          goals.set({ active: null });
          return;
        }
        if (next.next >= t.checkpoints.length) {
          const medal = medalFor(t, next.time);
          const best = career.finishTrial(t.id, next.time);
          const pay = medal && best ? GOALS.medalCash[medal] : 0;
          if (pay) career.addCash(pay);
          toast(
            `${t.name}: ${next.time.toFixed(1)} s${medal ? ` — ${medal.toUpperCase()}` : ''}${best ? ' (best!)' : ''}${pay ? `  +$${pay}` : ''}`,
            medal ? 'reward' : 'info',
          );
          goals.set({ active: null });
          return;
        }
      }
      goals.set({ active: next });
    }

    // Markers: start beacons when idle, the next two checkpoint rings while racing.
    const running = goals.active && goals.active.countdown <= 0 ? goals.active : null;
    if (beacons.current) beacons.current.visible = !goals.active;
    for (const [mesh, offset] of [
      [ring.current, 0],
      [ring2.current, 1],
    ] as const) {
      if (!mesh) continue;
      const t = running ? trials.find((tr) => tr.id === running.id) : null;
      const cp = t?.checkpoints[running!.next + offset];
      mesh.visible = !!cp;
      if (cp) {
        mesh.position.set(cp.x, city.heightAt(cp.x, cp.z) + GOALS.checkpointRadius * 0.55, cp.z);
        mesh.lookAt(pos.x, mesh.position.y, pos.z);
      }
    }
  });

  return (
    <>
      <group ref={beacons}>
        {trials.map((t) => (
          <mesh
            key={t.id}
            position={[t.start.x, city.heightAt(t.start.x, t.start.z) + 20, t.start.z]}
            material={beaconMat}
          >
            <cylinderGeometry args={[3, 3, 40, 20, 1, true]} />
          </mesh>
        ))}
      </group>
      <mesh ref={ring} material={ringMat} visible={false}>
        <torusGeometry args={[GOALS.checkpointRadius * 0.55, 0.35, 8, 40]} />
      </mesh>
      <mesh ref={ring2} material={nextRingMat} visible={false}>
        <torusGeometry args={[GOALS.checkpointRadius * 0.55, 0.3, 8, 40]} />
      </mesh>
    </>
  );
}
