import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sparkQueue, tireEmitters } from './tireFxState';

const SMOKE_MAX = 180;
const SKID_MAX = 1400;
const SPARK_MAX = 140;

function smokeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Particle {
  p: THREE.Vector3;
  v: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  spin: number;
}

/** Tire smoke, skid marks and impact sparks (one draw call each). */
export function TireFx() {
  const fx = useMemo(() => {
    // Smoke: camera-facing quads with a per-instance alpha.
    const smokeMat = new THREE.MeshBasicMaterial({
      map: smokeTexture(),
      color: '#e9e7e2',
      transparent: true,
      depthWrite: false,
    });
    smokeMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;',
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
        .replace(
          '#include <alphamap_fragment>',
          '#include <alphamap_fragment>\ndiffuseColor.a *= vAlpha;',
        );
    };
    const smokeGeo = new THREE.PlaneGeometry(1, 1);
    const alpha = new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_MAX), 1);
    alpha.setUsage(THREE.DynamicDrawUsage);
    smokeGeo.setAttribute('aAlpha', alpha);
    const smoke = new THREE.InstancedMesh(smokeGeo, smokeMat, SMOKE_MAX);
    smoke.count = 0;
    smoke.frustumCulled = false;
    smoke.renderOrder = 3;

    // Skid marks: a ring buffer of quads on the road.
    const skidPos = new Float32Array(SKID_MAX * 4 * 3);
    const skidIdx: number[] = [];
    for (let i = 0; i < SKID_MAX; i++) {
      const o = i * 4;
      skidIdx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    const skidGeo = new THREE.BufferGeometry();
    const skidAttr = new THREE.BufferAttribute(skidPos, 3);
    skidAttr.setUsage(THREE.DynamicDrawUsage);
    skidGeo.setAttribute('position', skidAttr);
    skidGeo.setIndex(skidIdx);
    const skids = new THREE.Mesh(
      skidGeo,
      new THREE.MeshBasicMaterial({
        color: '#0c0c0d',
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
    );
    skids.frustumCulled = false;
    skids.renderOrder = 1;

    // Sparks: short bright streaks along their velocity.
    const sparks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.035, 0.035, 0.32),
      new THREE.MeshBasicMaterial({
        color: '#ffc46b',
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        transparent: true,
      }),
      SPARK_MAX,
    );
    sparks.count = 0;
    sparks.frustumCulled = false;
    return { smoke, alpha, skids, skidAttr, sparks };
  }, []);

  useEffect(
    () => () => {
      for (const m of [fx.smoke, fx.skids, fx.sparks]) {
        m.geometry.dispose();
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    },
    [fx],
  );

  const sim = useMemo(
    () => ({
      smoke: [] as Particle[],
      sparks: [] as Particle[],
      spawnAcc: new Map<number, number>(),
      lastSkid: new Map<number, THREE.Vector3>(),
      skidHead: 0,
      m4: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(),
      z: new THREE.Vector3(0, 0, 1),
      dir: new THREE.Vector3(),
    }),
    [],
  );

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    // Emit smoke and lay skid marks from each sliding tire.
    for (const [wheel, e] of tireEmitters) {
      if (!e.p || e.slide < 0.12) {
        sim.lastSkid.delete(wheel);
        continue;
      }
      let acc = (sim.spawnAcc.get(wheel) ?? 0) + e.slide * 50 * dt;
      while (acc >= 1 && sim.smoke.length < SMOKE_MAX) {
        acc -= 1;
        sim.smoke.push({
          p: e.p
            .clone()
            .add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.25, (Math.random() - 0.5) * 0.4)),
          v: new THREE.Vector3(
            (Math.random() - 0.5) * 1.2,
            0.7 + Math.random() * 0.7,
            (Math.random() - 0.5) * 1.2,
          ),
          age: 0,
          life: 1.6 + Math.random() * 1.2,
          size: 0.7 + e.slide * 0.6,
          spin: Math.random() * Math.PI * 2,
        });
      }
      sim.spawnAcc.set(wheel, acc);

      const last = sim.lastSkid.get(wheel);
      if (e.slide > 0.3) {
        if (last && last.distanceTo(e.p) > 0.3 && last.distanceTo(e.p) < 4) {
          const dx = e.p.x - last.x;
          const dz = e.p.z - last.z;
          const l = Math.hypot(dx, dz) || 1;
          const rx = (-dz / l) * 0.13;
          const rz = (dx / l) * 0.13;
          const pos = fx.skidAttr.array as Float32Array;
          const o = sim.skidHead * 12;
          const y0 = last.y + 0.03;
          const y1 = e.p.y + 0.03;
          pos.set(
            [
              last.x - rx,
              y0,
              last.z - rz,
              last.x + rx,
              y0,
              last.z + rz,
              e.p.x + rx,
              y1,
              e.p.z + rz,
              e.p.x - rx,
              y1,
              e.p.z - rz,
            ],
            o,
          );
          sim.skidHead = (sim.skidHead + 1) % SKID_MAX;
          fx.skidAttr.needsUpdate = true;
          last.copy(e.p);
        } else if (!last || last.distanceTo(e.p) >= 4) {
          sim.lastSkid.set(wheel, e.p.clone());
        }
      } else sim.lastSkid.delete(wheel);
    }

    // Sparks from impacts.
    while (sparkQueue.length) {
      const b = sparkQueue.shift()!;
      const n = Math.round(10 + b.strength * 14);
      for (let i = 0; i < n && sim.sparks.length < SPARK_MAX; i++) {
        sim.sparks.push({
          p: new THREE.Vector3(b.x, b.y, b.z),
          v: new THREE.Vector3(
            -b.dx * 4 + (Math.random() - 0.5) * 7,
            1.5 + Math.random() * 3.5,
            -b.dz * 4 + (Math.random() - 0.5) * 7,
          ),
          age: 0,
          life: 0.25 + Math.random() * 0.35,
          size: 1,
          spin: 0,
        });
      }
    }

    // Update smoke.
    let n = 0;
    const alpha = fx.alpha.array as Float32Array;
    sim.smoke = sim.smoke.filter((p) => (p.age += dt) < p.life);
    for (const p of sim.smoke) {
      p.p.addScaledVector(p.v, dt);
      p.v.multiplyScalar(1 - 1.2 * dt);
      const k = p.age / p.life;
      const size = p.size * (1 + k * 3.2);
      sim.q.copy(camera.quaternion);
      sim.q.multiply(new THREE.Quaternion().setFromAxisAngle(sim.z, p.spin + k));
      fx.smoke.setMatrixAt(n, sim.m4.compose(p.p, sim.q, sim.s.setScalar(size)));
      alpha[n] = 0.8 * Math.min(1, k * 6) * (1 - k);
      n++;
    }
    fx.smoke.count = n;
    fx.smoke.instanceMatrix.needsUpdate = true;
    fx.alpha.needsUpdate = true;

    // Update sparks.
    n = 0;
    sim.sparks = sim.sparks.filter((p) => (p.age += dt) < p.life);
    for (const p of sim.sparks) {
      p.v.y -= 12 * dt;
      p.p.addScaledVector(p.v, dt);
      sim.dir.copy(p.v).normalize();
      sim.q.setFromUnitVectors(sim.z, sim.dir);
      fx.sparks.setMatrixAt(n, sim.m4.compose(p.p, sim.q, sim.s.set(1, 1, 1 - p.age / p.life)));
      n++;
    }
    fx.sparks.count = n;
    fx.sparks.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <primitive object={fx.skids} />
      <primitive object={fx.smoke} />
      <primitive object={fx.sparks} />
    </>
  );
}
