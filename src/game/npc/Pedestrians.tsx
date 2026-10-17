import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { modelUrl } from '../../lib/assets';
import type { City } from '../city/cityData';
import { CURB } from '../city/format';
import { PEDESTRIANS, PLAYER_ANIMATIONS } from '../config';
import {
  ANIMATION_SOURCE,
  CHARACTER_MODEL,
  characterTemplate,
  cloneCharacter,
  type AnimState,
} from '../player/characterModel';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { vehicleState } from '../vehicles/vehicleState';
import { launchHooks } from '../vehicles/flight';
import { PedSim, type Ped } from './pedSim';
import { applyLookPose, findLookBones, type LookPose } from './pose';

/** Clothing tints (multiplied over the character's texture). */
const TINTS = ['#ffffff', '#c9d8ff', '#ffd2c2', '#d4f0d0', '#f3e2b8', '#e0cdf5'];

interface Avatar {
  holder: THREE.Group;
  fall: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<AnimState, THREE.AnimationAction>>;
  current: THREE.AnimationAction | null;
  animAcc: number;
  pose: LookPose;
  phone: THREE.Mesh;
  lookW: number;
}

const PHONE_GEO = new THREE.BoxGeometry(0.075, 0.15, 0.012);
const PHONE_MAT = new THREE.MeshStandardMaterial({
  color: '#15171a',
  roughness: 0.3,
  metalness: 0.4,
});

/** People walking the sidewalks around the player (see pedSim.ts for behavior). */
export function Pedestrians({ city }: { city: City }) {
  const tier = useSettings((s) => s.quality.tier);
  const charGltf = useGLTF(modelUrl(CHARACTER_MODEL), false, true);
  const animGltf = useGLTF(modelUrl(ANIMATION_SOURCE), false, true);
  const sim = useMemo(() => new PedSim(city.index), [city]);
  useEffect(() => {
    if (useSettings.getState().debug) Object.assign(window, { __peds: sim });
  }, [sim]);
  const root = useRef<THREE.Group>(null);
  const avatars = useRef(new Map<Ped, Avatar>());
  const last = useRef<THREE.Vector3 | null>(null);
  const focus = useMemo(() => new THREE.Vector3(), []);
  const spawnTimer = useRef(0);
  const nearby = useRef({ timer: 0, edges: [] as number[] });
  const lookTarget = useMemo(() => new THREE.Vector3(), []);

  const template = useMemo(
    () =>
      characterTemplate(charGltf.scene, animGltf.scene, animGltf.animations, charGltf.animations),
    [charGltf, animGltf],
  );
  const tinted = useMemo(() => {
    const base = cloneCharacter(template).mesh.material as THREE.MeshStandardMaterial;
    return TINTS.map((c) => {
      const m = base.clone();
      m.color.multiply(new THREE.Color(c));
      return m;
    });
  }, [template]);

  const makeAvatar = (p: Ped): Avatar => {
    const { root: body, mesh } = cloneCharacter(template);
    mesh.material = tinted[p.tint % tinted.length]!;
    const fall = new THREE.Group();
    fall.add(body);
    const holder = new THREE.Group();
    holder.add(fall);
    const mixer = new THREE.AnimationMixer(mesh);
    const actions: Avatar['actions'] = {};
    for (const s of ['idle', 'walk', 'run'] as AnimState[]) {
      const clip = template.clips[s];
      if (clip) actions[s] = mixer.clipAction(clip);
    }
    root.current?.add(holder);
    const pose = findLookBones(mesh.skeleton);
    // Phone in the right hand (shown while filming a launch). Hand bones are scaled with the rig.
    const phone = new THREE.Mesh(PHONE_GEO, PHONE_MAT);
    phone.visible = false;
    if (pose.rightHand) {
      const s = new THREE.Vector3();
      pose.rightHand.getWorldScale(s);
      phone.scale.setScalar(1 / Math.max(s.x, 1e-3));
      phone.position.set(0, 0.08 / Math.max(s.x, 1e-3), 0.03 / Math.max(s.x, 1e-3));
      pose.rightHand.add(phone);
    }
    return {
      holder,
      fall,
      mixer,
      actions,
      current: null,
      animAcc: Math.random() * 0.1,
      pose,
      phone,
      lookW: 0,
    };
  };
  const dropAvatar = (p: Ped) => {
    const a = avatars.current.get(p);
    if (!a) return;
    a.mixer.stopAllAction();
    root.current?.remove(a.holder);
    avatars.current.delete(p);
  };

  // A rocket launch nearby: people stop, look up and point (some film it).
  useEffect(() => {
    const hook = (at: { x: number; z: number }) => sim.lookUp(at.x, at.z, Math.random);
    launchHooks.add(hook);
    return () => {
      launchHooks.delete(hook);
    };
  }, [sim]);

  useEffect(() => {
    const map = avatars.current;
    return () => {
      for (const a of map.values()) a.mixer.stopAllAction();
      map.clear();
    };
  }, [sim]);
  useEffect(() => () => tinted.forEach((m) => m.dispose()), [tinted]);

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const car = vehicleState.active?.object;
    if (!car) return;
    if (useUi.getState().menuOpen) return;
    car.getWorldPosition(focus);
    // Car velocity from frame-to-frame movement.
    const prev = last.current ?? focus.clone();
    const vx = (focus.x - prev.x) / Math.max(dt, 1e-3);
    const vz = (focus.z - prev.z) / Math.max(dt, 1e-3);
    last.current = focus.clone();

    // Top up the crowd on nearby sidewalks (from a cached list of streets in the spawn ring).
    nearby.current.timer -= dt;
    if (nearby.current.timer <= 0) {
      nearby.current.timer = 2;
      nearby.current.edges = [];
      for (let ei = 0; ei < sim.edgeCount; ei++) {
        const e = sim.edge(ei);
        if (e.cls === 'service' || e.length < 25) continue;
        const m = Math.floor(e.pts.length / 4) * 2;
        const d = Math.hypot(e.pts[m]! - focus.x, e.pts[m + 1]! - focus.z);
        if (d >= PEDESTRIANS.spawnMin * 0.5 && d <= PEDESTRIANS.spawnMax) nearby.current.edges.push(ei);
      }
    }
    spawnTimer.current -= dt;
    const list = nearby.current.edges;
    if (spawnTimer.current <= 0 && list.length && sim.peds.length < PEDESTRIANS.count[tier]) {
      spawnTimer.current = 0.12;
      const p = sim.spawn(list[Math.floor(Math.random() * list.length)]!, Math.random(), Math.random);
      avatars.current.set(p, makeAvatar(p));
    }

    sim.step(dt, { x: focus.x, z: focus.z, vx, vz }, Math.random);

    camera.getWorldPosition(prev);
    for (const p of [...sim.peds]) {
      const d = Math.hypot(p.x - focus.x, p.z - focus.z);
      if (d > PEDESTRIANS.despawn) {
        dropAvatar(p);
        sim.remove(p);
        continue;
      }
      const a = avatars.current.get(p);
      if (!a) continue;
      a.holder.position.set(p.x, city.heightAt(p.x, p.z) + CURB, p.z);
      a.holder.rotation.y = p.heading;
      // Knocked down: tip over onto the back; ease back up afterwards.
      const down = p.state === 'down';
      a.fall.rotation.x = THREE.MathUtils.damp(
        a.fall.rotation.x,
        down ? -Math.PI / 2 : 0,
        down ? 14 : 4,
        dt,
      );
      a.fall.position.y = THREE.MathUtils.damp(a.fall.position.y, down ? 0.2 : 0, 10, dt);

      const want: AnimState = p.state === 'flee' ? 'run' : p.state === 'walk' ? 'walk' : 'idle';
      const looking = p.state === 'look';
      a.lookW = THREE.MathUtils.damp(a.lookW, looking ? 1 : 0, looking ? 4 : 3, dt);
      a.phone.visible = looking && p.phone && a.lookW > 0.5;
      const action = a.actions[want] ?? a.actions.idle ?? null;
      if (action && action !== a.current) {
        action.reset().fadeIn(0.25).play();
        a.current?.fadeOut(0.25);
        a.current = action;
      }
      if (action) {
        const natural = PLAYER_ANIMATIONS[want].natural;
        action.timeScale = down
          ? 0
          : natural > 0
            ? (want === 'run' ? PEDESTRIANS.runSpeed : p.speed) / natural
            : 1;
      }
      // Far away people animate at a lower rate.
      a.animAcc += dt;
      const interval = d < PEDESTRIANS.animRange ? 0 : 0.1;
      if (a.animAcc >= interval) {
        a.mixer.update(a.animAcc);
        a.animAcc = 0;
        // Pose layer over the fresh animation pose: look up, point or film.
        if (a.lookW > 0.01) {
          a.holder.updateMatrixWorld(true);
          applyLookPose(
            a.pose,
            a.holder,
            lookTarget.copy(focus).setY(focus.y + 1),
            p.phone,
            a.lookW,
          );
        }
      }
    }
  });

  return <group ref={root} />;
}

useGLTF.preload(modelUrl(CHARACTER_MODEL), false, true);
useGLTF.preload(modelUrl(ANIMATION_SOURCE), false, true);
