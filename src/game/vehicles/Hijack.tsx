import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { City } from '../city/cityData';
import { PARKED_PAINTS } from '../city/propModels';
import { HIJACK } from '../config';
import { pedRef } from '../npc/pedSim';
import { usePlayerCar } from '../store/playerCar';
import { toast } from '../store/toasts';
import { useUi } from '../store/ui';
import { consumePress } from '../systems/input';
import { trafficRef } from '../traffic/trafficSim';
import { hijackHooks, useHijack, type HijackTarget } from './hijackState';
import { vehicleState } from './vehicleState';

const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const fwd = new THREE.Vector3();

/**
 * Hijacking: stop next to a car in traffic and press E (or the touch button) — the driver jumps
 * out and runs, and you drive off in their car. The car you left stays where it was (your flying
 * car included); stop next to it and press E to get back in. Only flying cars can launch.
 */
export function Hijack({ city }: { city: City }) {
  useFrame(() => {
    const car = vehicleState.active;
    if (!car || useUi.getState().menuOpen) return;
    car.object.getWorldPosition(pos);
    const slow = Math.abs(car.speed) < HIJACK.maxSpeed && !car.flying;

    // Look for a target a few times a second.
    let target: HijackTarget | null = null;
    if (slow) {
      let bestD: number = HIJACK.range;
      for (const a of trafficRef.sim?.agents ?? []) {
        if (a.bus || a.wrecked) continue;
        const d = Math.hypot(a.x - pos.x, a.z - pos.z);
        if (d < bestD) {
          bestD = d;
          target = {
            kind: 'traffic',
            id: a.id,
            label: a.police ? 'Hijack police car' : 'Hijack car',
          };
        }
      }
      for (const c of usePlayerCar.getState().left) {
        const d = Math.hypot(c.position[0] - pos.x, c.position[2] - pos.z);
        if (d < bestD) {
          bestD = d;
          target = {
            kind: 'left',
            id: c.id,
            label: c.canFly ? 'Get in your flying car' : 'Get in car',
          };
        }
      }
    }
    const prev = useHijack.getState().target;
    if (prev?.kind !== target?.kind || prev?.id !== target?.id) useHijack.setState({ target });

    if (!consumePress('interact') || !target) return;
    const player = usePlayerCar.getState();
    const current = player.car;
    if (!current) return;
    car.object.getWorldQuaternion(quat);

    if (target.kind === 'traffic') {
      const sim = trafficRef.sim;
      const a = sim?.agents.find((x) => x.id === target.id);
      if (!sim || !a) return;
      // Leave our car where it stands.
      player.leave({
        model: current.model,
        paint: current.paint,
        canFly: current.canFly,
        position: [pos.x, pos.y, pos.z],
        rotation: [quat.x, quat.y, quat.z, quat.w],
      });
      sim.remove(a);
      // The driver jumps out on the far side and runs.
      const sx = -a.dz;
      const sz = a.dx;
      const side = (pos.x - a.x) * sx + (pos.z - a.z) * sz > 0 ? -1 : 1;
      pedRef.sim?.spawnFleeing(
        a.x + sx * side * 1.3,
        a.z + sz * side * 1.3,
        sx * side,
        sz * side,
        Math.random,
      );
      const paint = a.police
        ? '#15171b'
        : `#${PARKED_PAINTS[a.paint % PARKED_PAINTS.length]!.getHexString()}`;
      player.setCar({
        model: a.police ? 'police' : 'sedan',
        paint,
        canFly: false,
        position: [a.x, city.heightAt(a.x, a.z) + 0.35, a.z],
        heading: a.heading,
        speed: a.v * 0.5,
      });
      for (const hook of hijackHooks) hook({ x: a.x, z: a.z });
      toast(a.police ? 'Police car hijacked!' : 'Car hijacked', 'warn');
    } else {
      const c = player.left.find((x) => x.id === target.id);
      if (!c) return;
      player.leave({
        model: current.model,
        paint: current.paint,
        canFly: current.canFly,
        position: [pos.x, pos.y, pos.z],
        rotation: [quat.x, quat.y, quat.z, quat.w],
      });
      player.removeLeft(c.id);
      fwd.set(0, 0, 1).applyQuaternion(new THREE.Quaternion(...c.rotation));
      player.setCar({
        model: c.model,
        paint: c.paint,
        canFly: c.canFly,
        position: [c.position[0], c.position[1] + 0.3, c.position[2]],
        heading: Math.atan2(fwd.x, fwd.z),
        speed: 0,
      });
      if (c.canFly) toast('Back in your flying car', 'reward');
    }
    useHijack.setState({ target: null });
  });
  return null;
}
