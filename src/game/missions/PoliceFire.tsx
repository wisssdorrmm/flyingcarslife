import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { MISSIONS, POLICE } from '../config';
import { lineOfSight } from '../police/sight';
import { useUi } from '../store/ui';
import { vehicleState } from '../vehicles/vehicleState';
import { policeLink, type PoliceUnit } from './policeLink';
import { missionRuntime } from './runtime';
import { sfx } from './sfx';

const TRACERS = 32;
const SPARKS = 96;
const FLASHES = 10;

interface Tracer {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  len: number;
  alive: boolean;
}

interface Spark {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
}

/**
 * Police gunfire, only while a mission turns it on (missionRuntime.fire): cruisers and the
 * helicopter within range and with a clear line of sight shoot at the player's car. Shots show as
 * tracers with muzzle flashes; hits throw sparks off the car and cost armor. No gore — it's the
 * car that takes the hits.
 */
export function PoliceFire() {
  const { world, rapier } = useRapier();
  const camera = useThree((s) => s.camera);
  const cooldowns = useRef(new Map<PoliceUnit, number>());
  const tracers = useMemo<Tracer[]>(
    () =>
      Array.from({ length: TRACERS }, () => ({
        from: new THREE.Vector3(),
        to: new THREE.Vector3(),
        t: 0,
        len: 0,
        alive: false,
      })),
    [],
  );
  const sparks = useMemo<Spark[]>(
    () =>
      Array.from({ length: SPARKS }, () => ({
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        life: 0,
      })),
    [],
  );
  const meshes = useMemo(() => {
    const tracerGeo = new THREE.BoxGeometry(0.05, 0.05, 1);
    const tracer = new THREE.InstancedMesh(
      tracerGeo,
      new THREE.MeshBasicMaterial({
        color: '#ffe7a3',
        toneMapped: false,
        transparent: true,
        opacity: 0.9,
      }),
      TRACERS,
    );
    const spark = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.06),
      new THREE.MeshBasicMaterial({ color: '#ffc861', toneMapped: false }),
      SPARKS,
    );
    const flashTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,250,220,1)');
      g.addColorStop(0.3, 'rgba(255,190,80,0.8)');
      g.addColorStop(1, 'rgba(255,120,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const flashMat = new THREE.SpriteMaterial({
      map: flashTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const flashes = Array.from({ length: FLASHES }, () => {
      const s = new THREE.Sprite(flashMat);
      s.visible = false;
      s.scale.setScalar(0.9);
      return { s, life: 0 };
    });
    for (const m of [tracer, spark]) {
      m.frustumCulled = false;
      m.count = 0;
    }
    return { tracer, spark, flashes, flashTex, flashMat };
  }, []);
  useEffect(
    () => () => {
      for (const m of [meshes.tracer, meshes.spark]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      meshes.flashTex.dispose();
      meshes.flashMat.dispose();
    },
    [meshes],
  );

  const tmp = useMemo(
    () => ({
      car: new THREE.Vector3(),
      muzzle: new THREE.Vector3(),
      aim: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      dir: new THREE.Vector3(),
      right: new THREE.Vector3(),
      s: new THREE.Vector3(1, 1, 1),
      z: new THREE.Vector3(0, 0, 1),
    }),
    [],
  );

  const burst = (at: THREE.Vector3, count: number, speed: number) => {
    let n = 0;
    for (const s of sparks) {
      if (s.life > 0) continue;
      s.p.copy(at);
      s.v.set(
        (Math.random() - 0.5) * speed,
        Math.random() * speed * 0.8,
        (Math.random() - 0.5) * speed,
      );
      s.life = 0.25 + Math.random() * 0.25;
      if (++n >= count) break;
    }
  };

  useFrame((_, rawDt) => {
    if (useUi.getState().menuOpen) return;
    const dt = Math.min(rawDt, 0.1);
    const car = vehicleState.active;
    // Missions set their own fire; otherwise police shoot from 2 stars (CLAUDE.md §6.3).
    const stars = policeLink.api?.stars() ?? 0;
    const fire = missionRuntime.fire ?? (stars > 0 ? (POLICE.fireByStars[stars] ?? null) : null);
    const F = MISSIONS.fire;

    // Shooting.
    if (car && fire && policeLink.api) {
      car.object.getWorldPosition(tmp.car);
      tmp.car.y += 0.8;
      tmp.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      for (const unit of policeLink.api.units()) {
        const d = unit.position.distanceTo(tmp.car);
        let cd = (cooldowns.current.get(unit) ?? Math.random() / fire.rate) - dt;
        if (d < F.range && cd <= 0) {
          cd = (0.6 + Math.random() * 0.8) / fire.rate;
          tmp.muzzle.copy(unit.position);
          tmp.muzzle.y += 1.6;
          if (!lineOfSight(world, rapier, tmp.muzzle, tmp.car, car.bodyHandle)) {
            cooldowns.current.set(unit, cd * 0.5);
            continue;
          }
          const chance =
            fire.accuracy *
            THREE.MathUtils.clamp(1 - (d - 10) * F.accuracyFalloff, 0.25, 1.3) *
            THREE.MathUtils.clamp(1 - Math.abs(car.speed) * F.speedDodge, 0.35, 1);
          const hit = Math.random() < chance;
          tmp.aim.copy(tmp.car);
          if (!hit) {
            // Near miss: past the car into the street.
            tmp.aim.x += (Math.random() - 0.5) * 6;
            tmp.aim.z += (Math.random() - 0.5) * 6;
            tmp.aim.y -= 0.8 + Math.random() * 0.5;
          }
          const tr = tracers.find((t) => !t.alive);
          if (tr) {
            tr.from.copy(tmp.muzzle);
            tr.to.copy(tmp.aim);
            tr.len = tr.from.distanceTo(tr.to);
            tr.t = 0;
            tr.alive = true;
          }
          const fl = meshes.flashes.find((f) => f.life <= 0);
          if (fl) {
            fl.s.position.copy(tmp.muzzle);
            fl.life = 0.06;
          }
          tmp.dir.subVectors(tmp.muzzle, camera.position).normalize();
          sfx.shot(d, tmp.dir.dot(tmp.right));
          if (hit) {
            // Bullets dent the car; in a mission they also cost armor.
            car.hitBy?.(tmp.aim, POLICE.damagePerHit);
            missionRuntime.onHit?.(F.damagePerHit);
            burst(tmp.aim, 10, 6);
          } else {
            burst(tmp.aim, 4, 3);
          }
        }
        cooldowns.current.set(unit, cd);
      }
      // Forget units that are gone.
      const live = new Set(policeLink.api.units());
      for (const u of cooldowns.current.keys()) if (!live.has(u)) cooldowns.current.delete(u);
    }

    // Tracers fly along their line.
    let n = 0;
    for (const t of tracers) {
      if (!t.alive) continue;
      t.t += (F.tracerSpeed * dt) / Math.max(t.len, 0.1);
      if (t.t >= 1) {
        t.alive = false;
        continue;
      }
      tmp.dir.subVectors(t.to, t.from).normalize();
      tmp.muzzle.lerpVectors(t.from, t.to, t.t);
      tmp.q.setFromUnitVectors(tmp.z, tmp.dir);
      tmp.s.set(1, 1, Math.min(4, t.len * 0.25));
      tmp.m.compose(tmp.muzzle, tmp.q, tmp.s);
      meshes.tracer.setMatrixAt(n++, tmp.m);
    }
    meshes.tracer.count = n;
    meshes.tracer.instanceMatrix.needsUpdate = true;

    // Sparks.
    n = 0;
    tmp.q.identity();
    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.v.y -= 9.8 * dt;
      s.p.addScaledVector(s.v, dt);
      tmp.s.setScalar(Math.max(0.2, s.life * 3));
      tmp.m.compose(s.p, tmp.q, tmp.s);
      meshes.spark.setMatrixAt(n++, tmp.m);
    }
    meshes.spark.count = n;
    meshes.spark.instanceMatrix.needsUpdate = true;

    for (const f of meshes.flashes) {
      f.life -= dt;
      f.s.visible = f.life > 0;
    }
  });

  return (
    <>
      <primitive object={meshes.tracer} />
      <primitive object={meshes.spark} />
      {meshes.flashes.map((f, i) => (
        <primitive key={i} object={f.s} />
      ))}
    </>
  );
}
