import { useEffect, useMemo, useReducer, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { useCity, type City } from '../city/cityData';
import { POLICE } from '../config';
import { pedHitHooks } from '../npc/pedSim';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { toast } from '../store/toasts';
import { trafficRef, type Agent } from '../traffic/trafficSim';
import { carContactHooks } from '../vehicles/contacts';
import { hijackHooks } from '../vehicles/hijackState';
import { usePlayerCar } from '../store/playerCar';
import { vehicleState } from '../vehicles/vehicleState';
import { PoliceChaser } from './PoliceChaser';
import { PoliceHeli } from './PoliceHeli';
import { publish, pursuit, type Unit } from './pursuit';
import { lineOfSight } from './sight';

/** A road node `dist` m from the player, preferably behind them. */
function spawnPoint(
  city: City,
  car: THREE.Vector3,
  forward: THREE.Vector3,
): { x: number; y: number; z: number; heading: number } | null {
  const nodes = city.index.nodes;
  const n = nodes.length / 3;
  const [min, max] = POLICE.spawnDistance;
  let best: { x: number; z: number; score: number } | null = null;
  // Every road node in the ring (cheap: at most once per spawn interval).
  for (let i = 0; i < n; i++) {
    const x = nodes[i * 3]!;
    const z = nodes[i * 3 + 2]!;
    const dx = x - car.x;
    const dz = z - car.z;
    const d = Math.hypot(dx, dz);
    if (d < min || d > max) continue;
    // Prefer appearing behind the player, out of view.
    const behind = -(dx * forward.x + dz * forward.z) / d;
    const score = behind + Math.random() * 0.8;
    if (!best || score > best.score) best = { x, z, score };
  }
  if (!best) return null;
  return {
    x: best.x,
    y: city.heightAt(best.x, best.z) + 0.7,
    z: best.z,
    heading: Math.atan2(car.x - best.x, car.z - best.z),
  };
}

/** Distance from (x, z) to the nearest police vehicle or patrol car that could see it. */
function policeNear(x: number, z: number, patrols: Agent[]): boolean {
  const r2 = POLICE.sightRange ** 2;
  const near = (px: number, pz: number) => (px - x) ** 2 + (pz - z) ** 2 < r2;
  return (
    pursuit.units.some((u) => near(u.position.x, u.position.z)) ||
    patrols.some((a) => near(a.x, a.z)) ||
    (!!pursuit.heli && near(pursuit.heli.position.x, pursuit.heli.position.z))
  );
}

/**
 * Police (CLAUDE.md §6.3): patrol cars in traffic witness offenses; when you're wanted, cruisers
 * spawn on the roads around you by star level, chase along the road graph, box you in and ram.
 * Break line of sight to make the stars fade; stop next to a cruiser too long and you're busted.
 * Ground units can't follow into the air (they stop at the launch point); at 4–5 stars a
 * helicopter does.
 */
export function PoliceSystem() {
  const city = useCity((s) => s.city);
  const tier = useSettings((s) => s.quality.tier);
  const { world, rapier } = useRapier();
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const patrols = useRef<Agent[]>([]);
  const timers = useRef({ spawn: 0, sight: 0, publish: 0, patrol: 0 });
  const tmp = useMemo(
    () => ({
      car: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      eye: new THREE.Vector3(),
      up: new THREE.Vector3(),
    }),
    [],
  );

  useEffect(() => {
    pursuit.listeners.add(rerender);
    return () => {
      pursuit.listeners.delete(rerender);
    };
  }, []);

  // Offenses: ramming police, reckless crashes and hitting people, when police can see it.
  useEffect(() => {
    const onContact = (other: number, impulse: number) => {
      const car = vehicleState.active;
      if (!car) return;
      car.object.getWorldPosition(tmp.car);
      const unit = pursuit.units.find((u) => u.body?.handle === other);
      const speed = Math.abs(car.speed);
      if (unit) {
        if (impulse > POLICE.ramImpulse && speed > POLICE.ramSpeed) {
          pursuit.offense('ramPolice', 'Rammed a police car', true);
        }
      } else if (impulse > POLICE.crashImpulse && speed > POLICE.crashSpeed) {
        pursuit.offense(
          'crash',
          'Reckless driving',
          policeNear(tmp.car.x, tmp.car.z, patrols.current),
        );
      }
    };
    const onPed = () => {
      const car = vehicleState.active;
      if (!car) return;
      car.object.getWorldPosition(tmp.car);
      pursuit.offense(
        'hitPedestrian',
        'Hit a pedestrian',
        policeNear(tmp.car.x, tmp.car.z, patrols.current),
      );
    };
    const onHijack = (at: { x: number; z: number }) => {
      const cop = usePlayerCar.getState().car?.model === 'police';
      pursuit.offense(
        cop ? 'policeCarTheft' : 'carTheft',
        cop ? 'Stole a police car' : 'Car theft',
        cop || policeNear(at.x, at.z, patrols.current),
      );
    };
    carContactHooks.add(onContact);
    pedHitHooks.add(onPed);
    hijackHooks.add(onHijack);
    return () => {
      carContactHooks.delete(onContact);
      pedHitHooks.delete(onPed);
      hijackHooks.delete(onHijack);
    };
  }, [tmp]);

  useFrame((_, rawDt) => {
    const car = vehicleState.active;
    if (!city || !car || useUi.getState().menuOpen) return;
    const dt = Math.min(rawDt, 0.1);
    const t = timers.current;
    car.object.getWorldPosition(tmp.car);
    car.object.getWorldQuaternion(tmp.q);
    tmp.fwd.set(0, 0, 1).applyQuaternion(tmp.q);
    const flying = !!car.flying;

    // Cruiser state from physics; wrecks and runaways are removed.
    for (const u of [...pursuit.units]) {
      const rb = u.body;
      if (rb) {
        const p = rb.translation();
        const v = rb.linvel();
        u.position.set(p.x, p.y, p.z);
        u.velocity.set(v.x, v.y, v.z);
        const r = rb.rotation();
        tmp.up.set(0, 1, 0).applyQuaternion(tmp.q.set(r.x, r.y, r.z, r.w));
        u.flipped = tmp.up.y < 0.35 ? u.flipped + dt : 0;
      }
      if (u.leaving !== null) u.leaving -= dt;
      const far = u.position.distanceTo(tmp.car) > POLICE.despawnDistance;
      const fell = u.position.y < city.heightAt(u.position.x, u.position.z) - 15;
      if (u.flipped > POLICE.wreckedSeconds) {
        toast('Unit wrecked', 'reward');
        pursuit.removeUnit(u);
      } else if (far || fell || (u.leaving !== null && u.leaving <= 0)) {
        pursuit.removeUnit(u);
      }
      u.repathIn -= dt;
      if (u.repathIn <= 0 && u.leaving === null) {
        u.repathIn = POLICE.repathSeconds;
        u.route = city.graph.route(
          { x: u.position.x, z: u.position.z },
          { x: tmp.car.x, z: tmp.car.z },
        );
      }
    }

    // Patrol cars in traffic (the witnesses) while you're not wanted.
    t.patrol -= dt;
    const sim = trafficRef.sim;
    if (sim && t.patrol <= 0) {
      t.patrol = 2;
      patrols.current = patrols.current.filter((a) => {
        const alive = sim.agents.includes(a);
        const far = Math.hypot(a.x - tmp.car.x, a.z - tmp.car.z) > 450;
        if (alive && far) sim.remove(a);
        return alive && !far;
      });
      if (pursuit.stars === 0 && patrols.current.length < POLICE.patrols[tier]) {
        const edges = city.graph.edges;
        for (let tries = 0; tries < 20; tries++) {
          const ei = Math.floor(Math.random() * edges.length);
          const e = edges[ei]!;
          const mx = e.pts[0]!;
          const mz = e.pts[1]!;
          const d = Math.hypot(mx - tmp.car.x, mz - tmp.car.z);
          if (d < 120 || d > 240) continue;
          patrols.current.push(
            sim.spawnOn(ei, Math.random() < 0.5 || e.oneway, 1, { police: true, speed: 9 }),
          );
          break;
        }
      }
    }

    if (pursuit.stars > 0) {
      // Keep enough cruisers on you for the star level.
      const want = Math.min(POLICE.unitsPerStar[pursuit.stars] ?? 5, POLICE.maxUnits[tier]);
      const active = pursuit.units.filter((u) => u.leaving === null).length;
      t.spawn -= dt;
      if (active < want && t.spawn <= 0 && !flying) {
        t.spawn = 1.5;
        const s = spawnPoint(city, tmp.car, tmp.fwd);
        if (s) pursuit.addUnit(s.x, s.y, s.z, s.heading);
      }

      // Line of sight, a few times a second.
      t.sight -= dt;
      if (t.sight <= 0) {
        t.sight = 0.25;
        tmp.car.y += 1;
        for (const u of pursuit.units) {
          tmp.eye.copy(u.position).setY(u.position.y + 1.9);
          const sees =
            u.leaving === null &&
            u.position.distanceTo(tmp.car) < POLICE.sightRange &&
            lineOfSight(world, rapier, tmp.eye, tmp.car, car.bodyHandle, u.body ?? undefined);
          u.sinceSeen = sees ? 0 : u.sinceSeen + 0.25;
        }
        const heli = pursuit.heli;
        const heliSees =
          !!heli &&
          heli.position.distanceTo(tmp.car) < POLICE.heli.sightRange &&
          lineOfSight(world, rapier, heli.position, tmp.car, car.bodyHandle);
        tmp.car.y -= 1;
        // Ground units can't see you in the air at 1–3 stars: launching breaks the pursuit.
        const groundSees = pursuit.units.some((u) => u.sinceSeen < 0.3);
        const seen =
          (flying && pursuit.stars < POLICE.heli.fromStars ? false : groundSees) || heliSees;
        pursuit.outOfSight = seen ? 0 : pursuit.outOfSight + 0.25;
        const needed =
          flying && pursuit.stars < POLICE.heli.fromStars
            ? POLICE.airEscapeSeconds
            : POLICE.escapeSeconds;
        if (pursuit.outOfSight >= needed) pursuit.evaded();
      }

      // Boxed in: a cruiser right next to you while you're stopped.
      const slow = !flying && Math.abs(car.speed) < POLICE.catchMaxSpeed;
      const close = pursuit.units.some(
        (u) => u.leaving === null && u.position.distanceTo(tmp.car) < POLICE.catchRange,
      );
      pursuit.boxedIn =
        slow && close ? pursuit.boxedIn + dt : Math.max(0, pursuit.boxedIn - dt * 2);
      if (pursuit.boxedIn >= POLICE.catchSeconds) pursuit.busted();
    }

    t.publish -= dt;
    if (t.publish <= 0) {
      t.publish = 0.2;
      publish();
    }
  });

  return (
    <>
      {pursuit.units.map((u: Unit) => (
        <PoliceChaser
          key={u.id}
          start={u.start}
          heading={u.heading}
          nav={u.nav}
          navCrawl={false}
          onBody={u.onBody}
        />
      ))}
      {pursuit.stars >= POLICE.heli.fromStars && <PoliceHeli />}
    </>
  );
}
