import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { useCity, type City } from '../city/cityData';
import { MISSIONS } from '../config';
import { useNav } from '../store/nav';
import { toast } from '../store/toasts';
import { useUi } from '../store/ui';
import { vehicleState } from '../vehicles/vehicleState';
import { missionFor } from './levels';
import { groundAt, setGroundProbe } from './ground';
import { longestStraight, resolvePlace, type Spot } from './places';
import { policeLink } from './policeLink';
import { Actor, missionRuntime, PlaneSim, type Marker } from './runtime';
import { sfx } from './sfx';
import { useMissions } from './store';
import type { MissionDef, Stage } from './types';

/** What a stage update reports back. */
type StepResult = 'run' | 'done' | { fail: string };

/** Everything a stage needs each frame. */
interface Ctx {
  city: City;
  dt: number;
  car: THREE.Vector3;
  carVel: THREE.Vector3;
  /** Absolute speed (m/s). */
  speed: number;
  /** Right-hand side of the car (unit vector on the ground). */
  right: THREE.Vector3;
  /** Ground height (piers and decks included). */
  ground: (x: number, z: number) => number;
}

/** Per-run bookkeeping that isn't HUD state. */
interface Run {
  def: MissionDef;
  stage: number;
  stageTime: number;
  /** Seconds left on the current stage's timer. */
  timer: number | null;
  timerMax: number | null;
  /** Fractions of time left at each timed stage's end (for the rating). */
  timeScores: number[];
  armor: number;
  passengers: number;
  /** Stage-local scratch state. */
  s: Record<string, number>;
  boarding: Actor[];
  pilot: Actor | null;
  /** Last whole second the countdown beeped at. */
  lastBeep: number;
  hudIn: number;
  gpsIn: number;
}

const TINTS = ['#ffffff', '#c9d8ff', '#ffd2c2', '#d4f0d0', '#f3e2b8'];

const flat = (a: THREE.Vector3, x: number, z: number) => Math.hypot(a.x - x, a.z - z);

function marker(
  spot: { x: number; y: number; z: number },
  kind: Marker['kind'],
  radius: number = MISSIONS.markerRadius,
): Marker {
  return { x: spot.x, y: spot.y, z: spot.z, radius, kind };
}

function stageTime(stage: Stage): number | null {
  switch (stage.kind) {
    case 'drive':
    case 'pickup':
    case 'dropoff':
      return stage.time ?? null;
    case 'checkpoints':
    case 'survive':
      return stage.time;
    case 'hijack':
      return stage.departIn;
    default:
      return null;
  }
}

/**
 * Runs the active mission: stage objectives, timers, heat, passengers, the plane and the pilot,
 * pass/fail and rating. Also shows the selected mission's start marker in free roam and opens the
 * briefing when you stop in it.
 */
export function MissionRunner() {
  const city = useCity((s) => s.city);
  const runId = useMissions((s) => s.runId);
  const run = useRef<Run | null>(null);
  const tmp = useMemo(
    () => ({
      car: new THREE.Vector3(),
      last: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      right: new THREE.Vector3(),
      door: new THREE.Vector3(),
      planeVel: new THREE.Vector3(),
    }),
    [],
  );
  const startStop = useRef({ inside: 0, dismissed: false });
  const { world, rapier } = useRapier();

  // Ground probe: fixed colliders only (not cars, not the plane).
  useEffect(() => {
    const flags =
      rapier.QueryFilterFlags.EXCLUDE_DYNAMIC | rapier.QueryFilterFlags.EXCLUDE_KINEMATIC;
    setGroundProbe((x, yFrom, z) => {
      const hit = world.castRay(
        new rapier.Ray({ x, y: yFrom, z }, { x: 0, y: -1, z: 0 }),
        60,
        true,
        flags,
      );
      return hit ? yFrom - hit.timeOfImpact : null;
    });
    return () => setGroundProbe(null);
  }, [world, rapier]);

  // Busted and hits end/affect the run.
  useEffect(() => {
    const onBusted = () => {
      if (run.current) useMissions.getState().fail('Busted');
    };
    const api = policeLink.api;
    api?.onBusted.add(onBusted);
    missionRuntime.onHit = (damage) => {
      const r = run.current;
      if (!r) return;
      r.armor = Math.max(0, r.armor - damage);
      sfx.hit();
    };
    return () => {
      api?.onBusted.delete(onBusted);
      missionRuntime.onHit = null;
    };
  }, []);

  // (Re)start the active mission whenever the store asks.
  useEffect(() => {
    const active = useMissions.getState().active;
    if (!city || !active || active.status !== 'running') return;
    const def = active.def;
    missionRuntime.reset();
    policeLink.api?.clear();
    if (def.plane) {
      const spot = resolvePlace(city, 'airstrip');
      const plane = new PlaneSim(spot.x, spot.y, spot.z, longestStraight(city, spot));
      missionRuntime.plane = plane;
      // The pilot waits by the cargo door.
      const pilot = new Actor('pilot', '#e9eef5');
      plane.door(pilot.pos);
      pilot.pos.y = groundAt(city, pilot.pos.x, pilot.pos.z);
      missionRuntime.actors.push(pilot);
    }
    run.current = {
      def,
      stage: -1,
      stageTime: 0,
      timer: null,
      timerMax: null,
      timeScores: [],
      armor: def.armor,
      passengers: 0,
      s: {},
      boarding: [],
      pilot: missionRuntime.actors.find((a) => a.id === 'pilot') ?? null,
      lastBeep: -1,
      hudIn: 0,
      gpsIn: 0,
    };
    sfx.start();
    enterStage(run.current, 0, city);
  }, [runId, city]);

  // Clean up when the mission screen closes.
  useEffect(
    () =>
      useMissions.subscribe((s, prev) => {
        if (prev.active && !s.active) {
          run.current = null;
          missionRuntime.reset();
          useNav.getState().setWaypoint(null);
        }
      }),
    [],
  );

  useFrame((_, rawDt) => {
    const car = vehicleState.active;
    if (!city || !car || useUi.getState().menuOpen) return;
    const dt = Math.min(rawDt, 0.1);
    car.object.getWorldPosition(tmp.car);
    if (tmp.last.lengthSq() === 0) tmp.last.copy(tmp.car);
    tmp.vel.subVectors(tmp.car, tmp.last).divideScalar(Math.max(dt, 1e-3));
    tmp.last.copy(tmp.car);
    car.object.getWorldQuaternion(tmp.q);
    tmp.right.set(-1, 0, 0).applyQuaternion(tmp.q).setY(0).normalize();
    const ctx: Ctx = {
      city,
      dt,
      car: tmp.car,
      carVel: tmp.vel,
      speed: Math.abs(car.speed),
      right: tmp.right,
      ground: (x, z) => groundAt(city, x, z),
    };

    // The plane keeps flying (or sitting) even after the mission ends.
    const plane = missionRuntime.plane;
    const r = run.current;
    if (plane) {
      const departIn =
        r && r.def.stages[r.stage]?.kind === 'hijack' && r.timer !== null ? r.timer : null;
      plane.update(dt, ctx.ground, departIn);
    }
    for (const a of missionRuntime.actors) {
      if (!a.visible) continue;
      if (a.opacity < 1 && a.path.length === 0) a.opacity = Math.max(0, a.opacity - dt * 2);
      if (a.opacity <= 0) a.visible = false;
    }

    const status = useMissions.getState().active?.status;
    if (!r || status !== 'running') {
      if (r && status !== 'running') {
        // Passengers/actors finish walking off after the result.
        for (const a of missionRuntime.actors) if (a.visible) a.step(dt, ctx.ground);
      }
      freeRoam(ctx);
      return;
    }
    missionRuntime.startMarker = null;
    useMissions.getState().patch({ elapsed: useMissions.getState().active!.elapsed + dt });

    // Global failure: wrecked.
    if (r.armor <= 0) return finish(r, { fail: 'Wrecked' });

    r.stageTime += dt;
    const stage = r.def.stages[r.stage]!;
    const counts = stage.kind !== 'hijack' || missionRuntime.plane?.mode === 'parked';
    if (r.timer !== null && counts) {
      r.timer = Math.max(0, r.timer - dt);
      const whole = Math.ceil(r.timer);
      if (whole <= 5 && whole !== r.lastBeep && r.timer > 0) {
        r.lastBeep = whole;
        sfx.beep(whole <= 3);
      }
    }
    const result = step(r, stage, ctx);
    if (result === 'done') {
      if (r.timerMax && r.timer !== null && stage.kind !== 'survive') {
        r.timeScores.push(r.timer / r.timerMax);
      }
      if (r.stage + 1 >= r.def.stages.length) return finish(r, 'done');
      sfx.checkpoint();
      enterStage(r, r.stage + 1, city);
    } else if (result !== 'run') {
      return finish(r, result);
    }

    r.hudIn -= dt;
    if (r.hudIn <= 0) {
      r.hudIn = 0.1;
      pushHud(r, stage);
    }
  });

  /** Free roam: show the selected level's start marker; stopping in it opens the briefing. */
  function freeRoam(ctx: Ctx): void {
    const st = useMissions.getState();
    if (st.active) {
      missionRuntime.startMarker = null;
      return;
    }
    const def = missionFor(st.selected);
    const spot = resolvePlace(ctx.city, def.start);
    missionRuntime.startMarker = marker(spot, 'start');
    const d = flat(ctx.car, spot.x, spot.z);
    const s = startStop.current;
    if (d > MISSIONS.markerRadius + 3) {
      s.inside = 0;
      s.dismissed = false;
      return;
    }
    if (d < MISSIONS.markerRadius && ctx.speed < MISSIONS.stopSpeed && !s.dismissed) {
      s.inside += ctx.dt;
      if (s.inside > 0.6) {
        s.dismissed = true;
        st.brief(def.level);
      }
    }
  }

  return null;
}

function enterStage(r: Run, index: number, city: City): void {
  r.stage = index;
  r.stageTime = 0;
  r.s = {};
  r.lastBeep = -1;
  const stage = r.def.stages[index]!;
  r.timer = stageTime(stage);
  r.timerMax = r.timer;
  if (stage.heat) {
    policeLink.api?.raise(stage.heat.stars, r.def.title);
    if (stage.heat.fire) missionRuntime.fire = { ...stage.heat.fire };
  }
  if (stage.announce) toast(stage.announce, stage.heat ? 'warn' : 'info');
  const target = gpsTarget(r, stage, city);
  useNav.getState().setWaypoint(target ? { x: target.x, z: target.z, label: target.label } : null);
  pushHud(r, stage);
}

/** Where the GPS should point for a stage (null = nowhere, e.g. "lose the police"). */
function gpsTarget(r: Run, stage: Stage, city: City): Spot | null {
  switch (stage.kind) {
    case 'drive':
      return resolvePlace(city, stage.to);
    case 'pickup':
    case 'dropoff':
      return resolvePlace(city, stage.at);
    case 'checkpoints':
      return resolvePlace(city, stage.points[r.s.cp ?? 0]!);
    case 'hijack': {
      const p = missionRuntime.plane;
      return p ? { x: p.pos.x, y: p.pos.y, z: p.pos.z, heading: 0, label: 'Cargo plane' } : null;
    }
    case 'catch':
      return r.pilot
        ? { x: r.pilot.pos.x, y: r.pilot.pos.y, z: r.pilot.pos.z, heading: 0, label: stage.who }
        : null;
    default:
      return null;
  }
}

/** Stopped inside a marker for a moment. */
function stoppedAt(r: Run, ctx: Ctx, spot: Spot, key = 'stop'): boolean {
  const inside = flat(ctx.car, spot.x, spot.z) < MISSIONS.markerRadius;
  r.s[key] = inside && ctx.speed < MISSIONS.stopSpeed ? (r.s[key] ?? 0) + ctx.dt : 0;
  return (r.s[key] ?? 0) > 0.4;
}

/** A spot on the sidewalk beside a road point (people come from / go to the curb). */
function curbBeside(spot: Spot, side: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(
    spot.x + Math.cos(spot.heading) * side * MISSIONS.walkFrom,
    spot.y,
    spot.z - Math.sin(spot.heading) * side * MISSIONS.walkFrom,
  );
}

function step(r: Run, stage: Stage, ctx: Ctx): StepResult {
  const { city, ground } = ctx;
  const outOfTime = r.timer !== null && r.timer <= 0;
  switch (stage.kind) {
    case 'drive': {
      const spot = resolvePlace(city, stage.to);
      missionRuntime.markers = [marker(spot, 'objective')];
      const reached = stage.stop
        ? stoppedAt(r, ctx, spot)
        : flat(ctx.car, spot.x, spot.z) < MISSIONS.markerRadius;
      if (reached) return 'done';
      return outOfTime ? { fail: 'Out of time' } : 'run';
    }

    case 'pickup': {
      const spot = resolvePlace(city, stage.at);
      missionRuntime.markers = r.s.boarding ? [] : [marker(spot, 'objective')];
      if (!r.s.boarding) {
        if (!stoppedAt(r, ctx, spot)) return outOfTime ? { fail: 'Out of time' } : 'run';
        // Waiting for the crew (the timer stops; the alarm's ringing).
        if (stage.wait) {
          r.timer = null;
          r.s.wait = (r.s.wait ?? 0) + ctx.dt;
          if (r.s.wait < stage.wait) return 'run';
        }
        // They come out to the car.
        r.s.boarding = 1;
        r.boarding = [];
        for (let i = 0; i < stage.count; i++) {
          const a = new Actor(`crew${i}`, TINTS[(r.stage + i) % TINTS.length]!);
          curbBeside(spot, i % 2 ? -1 : 1, a.pos);
          a.pos.x += (i - stage.count / 2) * 1.4;
          a.pos.y = ground(a.pos.x, a.pos.z);
          a.speed = stage.wait ? 4.2 : MISSIONS.walkSpeed;
          missionRuntime.actors.push(a);
          r.boarding.push(a);
        }
      }
      // Walk to the car's side (they follow it if you creep away).
      let aboard = 0;
      for (const a of r.boarding) {
        if (!a.visible || a.opacity < 1) {
          aboard++;
          continue;
        }
        const door = ctx.car.clone().addScaledVector(ctx.right, 1.3);
        a.path = [door];
        if (a.step(ctx.dt, ground) || flat(a.pos, door.x, door.z) < 0.6) a.opacity = 0.99;
      }
      if (aboard >= r.boarding.length) {
        r.passengers += r.boarding.length;
        toast(stage.count > 1 ? `${stage.who} are in` : `${stage.who} is in`, 'info');
        return 'done';
      }
      return 'run';
    }

    case 'dropoff': {
      const spot = resolvePlace(city, stage.at);
      if (!r.s.out) {
        missionRuntime.markers = [marker(spot, 'hideout')];
        if (!stoppedAt(r, ctx, spot)) return outOfTime ? { fail: 'Out of time' } : 'run';
        r.s.out = 1;
        missionRuntime.markers = [];
        // Everyone gets out and walks off to the curb.
        for (let i = 0; i < Math.max(1, r.passengers); i++) {
          const a = new Actor(`out${i}`, TINTS[i % TINTS.length]!);
          a.pos.copy(ctx.car).addScaledVector(ctx.right, 1.4 + i * 0.6);
          a.speed = MISSIONS.walkSpeed;
          a.path = [curbBeside(spot, 1).add(new THREE.Vector3(i * 1.2, 0, 0))];
          a.opacity = 0.999;
          missionRuntime.actors.push(a);
        }
        r.passengers = 0;
      }
      for (const a of missionRuntime.actors) if (a.id.startsWith('out')) a.step(ctx.dt, ground);
      r.s.outTime = (r.s.outTime ?? 0) + ctx.dt;
      return r.s.outTime > 1.2 ? 'done' : 'run';
    }

    case 'checkpoints': {
      const i = r.s.cp ?? 0;
      const here = resolvePlace(city, stage.points[i]!);
      const next = stage.points[i + 1];
      missionRuntime.markers = [marker(here, 'objective')];
      if (next) missionRuntime.markers.push(marker(resolvePlace(city, next), 'next'));
      if (flat(ctx.car, here.x, here.z) < MISSIONS.markerRadius) {
        r.s.cp = i + 1;
        if (r.s.cp >= stage.points.length) return 'done';
        sfx.checkpoint();
        const t = resolvePlace(city, stage.points[r.s.cp]!);
        useNav.getState().setWaypoint({ x: t.x, z: t.z, label: t.label });
      }
      return outOfTime ? { fail: 'Out of time' } : 'run';
    }

    case 'hijack': {
      const plane = missionRuntime.plane;
      if (!plane) return 'done';
      if (r.timer !== null && r.timer <= 0) plane.startRoll();
      if (plane.mode === 'airborne' || plane.mode === 'gone') return { fail: 'The plane took off' };
      plane.door(tmp2.door);
      plane.velocity(tmp2.vel);
      missionRuntime.markers = [marker(tmp2.door, 'objective', 4)];
      const near = flat(ctx.car, tmp2.door.x, tmp2.door.z) < MISSIONS.hijack.doorRange;
      const matched =
        Math.hypot(ctx.carVel.x - tmp2.vel.x, ctx.carVel.z - tmp2.vel.z) <
        MISSIONS.hijack.matchSpeed;
      const h = r.s.hold ?? 0;
      r.s.hold =
        near && matched ? h + ctx.dt / stage.hold : Math.max(0, h - (ctx.dt / stage.hold) * 0.5);
      // Keep the pilot by the door while parked.
      if (r.pilot && plane.mode === 'parked') plane.door(r.pilot.pos);
      if (r.pilot && plane.mode === 'rolling') r.pilot.visible = false;
      if (r.s.hold >= 1) {
        plane.hijack();
        toast('Plane hijacked!', 'reward');
        return 'done';
      }
      r.gpsIn -= ctx.dt;
      if (r.gpsIn <= 0 && plane.mode === 'rolling') {
        r.gpsIn = 1;
        useNav.getState().setWaypoint({ x: plane.pos.x, z: plane.pos.z, label: 'Cargo plane' });
      }
      return 'run';
    }

    case 'catch': {
      let pilot = r.pilot;
      if (!pilot) {
        pilot = new Actor('pilot', '#e9eef5');
        pilot.pos.copy(ctx.car).addScaledVector(ctx.right, 12);
        missionRuntime.actors.push(pilot);
        r.pilot = pilot;
      }
      if (!r.s.started) {
        r.s.started = 1;
        pilot.visible = true;
        pilot.opacity = 1;
        missionRuntime.plane?.door(pilot.pos);
        pilot.pos.y = ground(pilot.pos.x, pilot.pos.z);
        pilot.speed = stage.speed;
        // Run for the road point farthest from the car, about escapeDistance away.
        let best: { x: number; z: number } | null = null;
        let bestD = -1;
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          const hit = city.graph.nearest(
            pilot.pos.x + Math.sin(a) * stage.escapeDistance,
            pilot.pos.z + Math.cos(a) * stage.escapeDistance,
            90,
          );
          if (!hit) continue;
          const d = flat(ctx.car, hit.x, hit.z);
          if (d > bestD) {
            bestD = d;
            best = hit;
          }
        }
        const route = best ? city.graph.route({ x: pilot.pos.x, z: pilot.pos.z }, best) : [];
        pilot.path = route.map((p) => new THREE.Vector3(p.x, 0, p.z));
        if (!pilot.path.length && best) pilot.path = [new THREE.Vector3(best.x, 0, best.z)];
      }
      if (r.s.caught) {
        // Walk to the car and get in.
        const door = ctx.car.clone().addScaledVector(ctx.right, 1.3);
        pilot.path = [door];
        pilot.speed = 2.6;
        if (pilot.step(ctx.dt, ground) || flat(pilot.pos, door.x, door.z) < 0.6) {
          pilot.opacity = 0.99;
          r.passengers += 1;
          toast(`Got ${stage.who}`, 'reward');
          return 'done';
        }
        missionRuntime.markers = [];
        return 'run';
      }
      const d = flat(ctx.car, pilot.pos.x, pilot.pos.z);
      // A car flying at him: he dives aside instead of getting hit.
      if (d < 3.5 && ctx.speed > MISSIONS.catch.dodgeSpeed) {
        const side =
          Math.sign(
            (pilot.pos.x - ctx.car.x) * ctx.right.x + (pilot.pos.z - ctx.car.z) * ctx.right.z,
          ) || 1;
        pilot.pos.addScaledVector(ctx.right, side * 7 * ctx.dt);
      }
      if (
        r.stageTime > MISSIONS.catch.headStart &&
        d < MISSIONS.catch.range &&
        ctx.speed < MISSIONS.catch.maxSpeed
      ) {
        r.s.caught = 1;
        toast(`You grabbed ${stage.who}`, 'reward');
        return 'run';
      }
      const finished = pilot.step(ctx.dt, ground);
      missionRuntime.markers = [marker(pilot.pos, 'objective', 2.5)];
      r.gpsIn -= ctx.dt;
      if (r.gpsIn <= 0) {
        r.gpsIn = 1;
        useNav.getState().setWaypoint({ x: pilot.pos.x, z: pilot.pos.z, label: stage.who });
      }
      r.s.distLeft = pilot.path.reduce(
        (acc, p, i, arr) =>
          acc + (i ? p.distanceTo(arr[i - 1]!) : flat(p, pilot.pos.x, pilot.pos.z)),
        0,
      );
      return finished
        ? { fail: `${stage.who[0]!.toUpperCase()}${stage.who.slice(1)} got away` }
        : 'run';
    }

    case 'escape': {
      missionRuntime.markers = [];
      const api = policeLink.api;
      if (api) {
        // A beat before checking, so stars raised this frame register.
        if (r.stageTime > 1 && api.stars() === 0) return 'done';
        return 'run';
      }
      // No police system: hold on for a while instead.
      r.timer ??= MISSIONS.fallbackEscapeSeconds;
      r.timerMax ??= MISSIONS.fallbackEscapeSeconds;
      return r.timer <= 0 ? 'done' : 'run';
    }

    case 'survive': {
      missionRuntime.markers = [];
      return r.timer !== null && r.timer <= 0 ? 'done' : 'run';
    }
  }
}

const tmp2 = { door: new THREE.Vector3(), vel: new THREE.Vector3() };

function pushHud(r: Run, stage: Stage): void {
  let detail: string | null = null;
  let hold: number | null = null;
  switch (stage.kind) {
    case 'checkpoints':
      detail = `${(r.s.cp ?? 0) + 1}/${stage.points.length}`;
      break;
    case 'pickup':
      if (stage.wait && r.s.wait !== undefined && !r.s.boarding) {
        hold = Math.min(1, r.s.wait / stage.wait);
        detail = 'Hold position';
      }
      break;
    case 'hijack': {
      const plane = missionRuntime.plane;
      detail = plane?.mode === 'rolling' ? 'TAKE-OFF ROLL — catch it!' : 'Departs in';
      if ((r.s.hold ?? 0) > 0) hold = r.s.hold!;
      break;
    }
    case 'catch':
      if (r.s.distLeft !== undefined) detail = `${Math.round(r.s.distLeft)} m from escaping`;
      break;
    case 'escape':
      detail = policeLink.api ? 'Break line of sight' : 'Hold on';
      break;
    case 'survive':
      detail = 'Stay alive';
      break;
  }
  useMissions.getState().patch({
    stage: r.stage,
    objective: stage.text,
    timer: r.timer,
    timerMax: r.timerMax,
    detail,
    hold,
    armor: r.armor,
  });
}

function finish(r: Run, result: 'done' | { fail: string }): void {
  missionRuntime.fire = null;
  missionRuntime.markers = [];
  useNav.getState().setWaypoint(null);
  const st = useMissions.getState();
  if (result === 'done') {
    const time = r.timeScores.length
      ? r.timeScores.reduce((a, b) => a + b, 0) / r.timeScores.length
      : 1;
    const armor = r.armor / r.def.armor;
    const R = MISSIONS.rating;
    const rating =
      time >= R.timeLeft && armor >= R.armorLeft
        ? 3
        : time >= R.timeLeft / 2 && armor >= R.armorLeft / 2
          ? 2
          : 1;
    st.patch({ armor: r.armor });
    st.complete(rating);
    sfx.passed();
  } else {
    policeLink.api?.clear();
    st.patch({ armor: r.armor });
    st.fail(result.fail);
    sfx.failed();
  }
}
