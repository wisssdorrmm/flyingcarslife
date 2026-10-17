import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { TRAFFIC } from '../config';
import type { City } from '../city/cityData';
import {
  busGeometries,
  parkedCarGeometries,
  PARKED_PAINTS,
  policeCarGeometries,
} from '../city/propModels';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { carContactHooks } from '../vehicles/contacts';
import { vehicleState } from '../vehicles/vehicleState';
import { TrafficSim, trafficRef, type Agent } from './trafficSim';

const CAR_HALF = { x: 0.9, y: 0.65, z: 2.2 };
const BUS_HALF = { x: 1.28, y: 1.5, z: 5.7 };

/**
 * AI cars and buses around the player: spawned in a ring out of close view, driven by
 * TrafficSim, drawn with instancing, and given collision bodies when near the player. A hard hit
 * wrecks a car: it turns into a physics body and is cleared later.
 */
export function Traffic({ city }: { city: City }) {
  const tier = useSettings((s) => s.quality.tier);
  const { world, rapier } = useRapier();
  const sim = useMemo(() => new TrafficSim(city.index), [city]);
  const bodies = useRef(new Map<Agent, RigidBody>());
  const byHandle = useRef(new Map<number, Agent>());
  const rand = useMemo(() => Math.random, []);
  const focus = useMemo(() => new THREE.Vector3(), []);
  const spawnTimer = useRef(0);

  const meshes = useMemo(() => {
    const car = parkedCarGeometries();
    const bus = busGeometries();
    const cop = policeCarGeometries();
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, cap: number) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    const glass = new THREE.MeshStandardMaterial({ color: '#101418', roughness: 0.08 });
    const tire = new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.8 });
    return {
      carBody: mk(
        car.body,
        new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.35, metalness: 0.3 }),
        80,
      ),
      carGlass: mk(car.glass, glass, 80),
      carWheels: mk(car.wheels, tire, 80),
      busBody: mk(
        bus.body,
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }),
        16,
      ),
      busGlass: mk(bus.glass, glass, 16),
      busWheels: mk(bus.wheels, tire, 16),
      copBody: mk(
        cop.body,
        new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.35, metalness: 0.3 }),
        8,
      ),
      copDoors: mk(
        cop.doors,
        new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.4 }),
        8,
      ),
      copGlass: mk(cop.glass, glass, 8),
      copWheels: mk(cop.wheels, tire, 8),
      copBar: mk(
        cop.lightbar,
        new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.5 }),
        8,
      ),
    };
  }, []);

  useEffect(() => {
    trafficRef.sim = sim;
    if (useSettings.getState().debug) Object.assign(window, { __traffic: sim });
    const hook = (handle: number, impulse: number) => {
      const a = byHandle.current.get(handle);
      if (!a || a.wrecked || impulse < TRAFFIC.wreckImpulse) return;
      a.wrecked = true;
      const body = bodies.current.get(a);
      if (body) {
        body.setBodyType(rapier.RigidBodyType.Dynamic, true);
        // Keep its momentum along the road.
        body.setLinvel({ x: a.dx * a.v, y: 0, z: a.dz * a.v }, true);
      }
    };
    carContactHooks.add(hook);
    const bodyMap = bodies.current;
    const handles = byHandle.current;
    return () => {
      carContactHooks.delete(hook);
      for (const b of bodyMap.values()) world.removeRigidBody(b);
      bodyMap.clear();
      handles.clear();
      if (trafficRef.sim === sim) trafficRef.sim = null;
    };
  }, [sim, world, rapier]);

  useEffect(
    () => () => {
      for (const m of Object.values(meshes)) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    },
    [meshes],
  );

  const addBody = (a: Agent) => {
    const half = a.bus ? BUS_HALF : CAR_HALF;
    const y = city.heightAt(a.x, a.z);
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(a.x, y, a.z),
    );
    world.createCollider(
      rapier.ColliderDesc.cuboid(half.x, half.y, half.z)
        .setTranslation(0, half.y + 0.05, 0)
        .setMass(a.bus ? 9000 : 1300),
      body,
    );
    bodies.current.set(a, body);
    byHandle.current.set(body.handle, a);
  };
  const removeBody = (a: Agent) => {
    const body = bodies.current.get(a);
    if (!body) return;
    byHandle.current.delete(body.handle);
    world.removeRigidBody(body);
    bodies.current.delete(a);
  };

  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const crushed = useMemo(() => new THREE.Vector3(1.04, 0.86, 0.9), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const car = vehicleState.active;
    if (!car) return;
    if (useUi.getState().menuOpen) return;
    car.object.getWorldPosition(focus);

    // Keep the population topped up, spawning out of close view.
    spawnTimer.current -= dt;
    const target = TRAFFIC.count[tier];
    if (spawnTimer.current <= 0 && sim.agents.length < target) {
      spawnTimer.current = sim.agents.length < target / 2 ? 0.05 : 0.4;
      for (let tries = 0; tries < 12; tries++) {
        const ei = Math.floor(rand() * sim.edgeCount);
        const edge = sim.edge(ei);
        if (edge.cls === 'service' || edge.length < 30) continue;
        const mid = edge.pts.length / 2;
        const mx = edge.pts[Math.floor(mid / 2) * 2]!;
        const mz = edge.pts[Math.floor(mid / 2) * 2 + 1]!;
        const d = Math.hypot(mx - focus.x, mz - focus.z);
        // The first wave (while the game starts) may appear close by; later ones out of view.
        const minD = sim.time < 2 ? 25 : TRAFFIC.spawnMin;
        if (d < minD || d > TRAFFIC.spawnMax) continue;
        if (sim.agents.some((o) => Math.hypot(o.x - mx, o.z - mz) < 18)) continue;
        const busCount = sim.agents.filter((o) => o.bus).length;
        const bus = edge.bus && busCount < 4 && rand() < TRAFFIC.busShare * 3;
        if (sim.spawn(ei, rand(), bus, rand)) break;
      }
    }

    // Step the simulation with the player as an obstacle.
    sim.step(dt, [{ x: focus.x, z: focus.z, v: Math.max(0, car.speed) }], rand);

    // Bodies of cars taken out of the sim elsewhere (hijacked) go too.
    for (const a of [...bodies.current.keys()]) if (!sim.agents.includes(a)) removeBody(a);

    // Despawn far cars and old wrecks; manage collision bodies.
    for (const a of [...sim.agents]) {
      const d = Math.hypot(a.x - focus.x, a.z - focus.z);
      if (a.wrecked) a.wreckAge += dt;
      const gone =
        d > TRAFFIC.despawn ||
        (a.stuck > 45 && d > 60) ||
        (a.wrecked && (a.wreckAge > TRAFFIC.wreckSeconds || d > 250));
      if (gone) {
        removeBody(a);
        sim.remove(a);
        continue;
      }
      const near = d < TRAFFIC.physicsRadius;
      if (near && !bodies.current.has(a)) addBody(a);
      else if (!near && !a.wrecked) removeBody(a);
    }

    // Draw (and drive the kinematic bodies).
    const counts = { car: 0, bus: 0, cop: 0 };
    for (const a of sim.agents) {
      const body = bodies.current.get(a);
      if (a.wrecked && body) {
        const t = body.translation();
        const r = body.rotation();
        p.set(t.x, t.y, t.z);
        q.set(r.x, r.y, r.z, r.w);
        a.x = t.x;
        a.z = t.z;
      } else {
        const len = a.bus ? 5 : 2;
        const yb = city.heightAt(a.x - a.dx * len, a.z - a.dz * len);
        const yf = city.heightAt(a.x + a.dx * len, a.z + a.dz * len);
        e.set(-Math.atan2(yf - yb, len * 2), a.heading, 0);
        q.setFromEuler(e);
        p.set(a.x, (yf + yb) / 2, a.z);
        if (body) {
          body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
          body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
        }
      }
      // Wrecks look crushed.
      m4.compose(p, q, a.wrecked ? crushed : one);
      if (a.police) {
        const i = counts.cop++;
        if (i >= meshes.copBody.instanceMatrix.count) continue;
        for (const m of [
          meshes.copBody,
          meshes.copDoors,
          meshes.copGlass,
          meshes.copWheels,
          meshes.copBar,
        ]) {
          m.setMatrixAt(i, m4);
        }
      } else if (a.bus) {
        const i = counts.bus++;
        if (i >= meshes.busBody.instanceMatrix.count) continue;
        meshes.busBody.setMatrixAt(i, m4);
        meshes.busGlass.setMatrixAt(i, m4);
        meshes.busWheels.setMatrixAt(i, m4);
      } else {
        const i = counts.car++;
        if (i >= meshes.carBody.instanceMatrix.count) continue;
        meshes.carBody.setMatrixAt(i, m4);
        meshes.carBody.setColorAt(i, PARKED_PAINTS[a.paint % PARKED_PAINTS.length]!);
        meshes.carGlass.setMatrixAt(i, m4);
        meshes.carWheels.setMatrixAt(i, m4);
      }
    }
    for (const [k, mesh] of Object.entries(meshes)) {
      mesh.count = k.startsWith('bus') ? counts.bus : k.startsWith('cop') ? counts.cop : counts.car;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      {Object.entries(meshes).map(([k, m]) => (
        <primitive key={k} object={m} />
      ))}
    </>
  );
}
