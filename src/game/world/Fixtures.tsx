import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { signalColor, type SignalColor, type SignalPhase } from '../systems/trafficSignals';
import {
  ARM_HEIGHT,
  HEAD_CENTER,
  MAST_ARMS as ARMS,
  streetLightPlacements,
  yawFor,
} from './furnitureLayout';
import { LAYOUT } from './layout';
import { usePbrMaterial } from './materials';

const { curbHeight: Y } = LAYOUT;
const UP = new THREE.Vector3(0, 1, 0);

function at(g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  return g.translate(x, y, z);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // mergeGeometries needs matching attributes; drop extras some generators add.
  const clean = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(n.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) n.deleteAttribute(name);
    }
    return n;
  });
  const merged = mergeGeometries(clean);
  if (!merged) throw new Error('mergeGeometries failed');
  return merged;
}

// ---------------------------------------------------------------------------
// Street lights: US "cobra head" on a tapered galvanized pole.
// ---------------------------------------------------------------------------

function streetLightGeometry() {
  const arm = new THREE.TubeGeometry(
    new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 8.1, 0),
      new THREE.Vector3(1.0, 8.95, 0),
      new THREE.Vector3(3.1, 8.95, 0),
    ),
    16,
    0.05,
    8,
  );
  const head = new THREE.SphereGeometry(0.5, 20, 10);
  head.scale(0.8, 0.17, 0.34);
  const metal = merge([
    at(new THREE.CylinderGeometry(0.2, 0.26, 0.55, 14), 0, 0.275, 0),
    at(new THREE.CylinderGeometry(0.07, 0.12, 8.6, 14), 0, 4.3, 0),
    arm,
    at(head, 3.5, 8.95, 0),
  ]);
  const lens = new THREE.SphereGeometry(0.5, 16, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  lens.scale(0.6, 0.12, 0.25);
  at(lens, 3.55, 8.9, 0);
  return { metal, lens };
}

function StreetLights() {
  const galvanized = usePbrMaterial('metal_plate', {
    tileMeters: 1,
    color: '#a7abae',
    roughness: 0.6,
  });
  const objects = useMemo(() => {
    const { metal, lens } = streetLightGeometry();
    const matrices = streetLightPlacements();
    const lensMat = new THREE.MeshStandardMaterial({
      color: '#d9d6cc',
      roughness: 0.25,
      emissive: '#ffd9a0',
      emissiveIntensity: 0, // lit at night once the day/night cycle lands (Phase 5)
    });
    return [metal, lens].map((geo, i) => {
      const inst = new THREE.InstancedMesh(geo, i === 0 ? galvanized : lensMat, matrices.length);
      matrices.forEach((m, k) => inst.setMatrixAt(k, m));
      inst.castShadow = i === 0;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      return inst;
    });
  }, [galvanized]);
  useEffect(() => () => objects.forEach((o) => o.geometry.dispose()), [objects]);
  return (
    <>
      {objects.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Traffic signals: mast arms on the far side of each approach.
// ---------------------------------------------------------------------------

const LENS_Y: Record<SignalColor, number> = { red: 0.33, yellow: 0, green: -0.33 };
const LENS_ON: Record<SignalColor, string> = {
  red: '#ff2a1a',
  yellow: '#ffb000',
  green: '#19ff9a',
};
const LENS_OFF: Record<SignalColor, string> = {
  red: '#3a0d0a',
  yellow: '#3a2a08',
  green: '#08301f',
};

function poleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const arm of ARMS) {
    const [px, pz] = arm.pole;
    const [dx, dz] = arm.dir;
    const length = Math.max(...arm.heads) + 0.6;
    parts.push(at(new THREE.CylinderGeometry(0.22, 0.28, 0.5, 16), px, Y + 0.25, pz));
    parts.push(
      at(
        new THREE.CylinderGeometry(0.14, 0.18, ARM_HEIGHT + 0.4, 16),
        px,
        Y + (ARM_HEIGHT + 0.4) / 2,
        pz,
      ),
    );
    const beam = new THREE.CylinderGeometry(0.065, 0.11, length, 12);
    beam.rotateZ(-Math.PI / 2); // along +x, thick end at the pole
    beam.translate(length / 2, 0, 0);
    beam.rotateY(yawFor(dx, dz));
    parts.push(at(beam, px, Y + ARM_HEIGHT, pz));
    // Hangers from the arm down to each head.
    for (const d of arm.heads) {
      parts.push(
        at(
          new THREE.CylinderGeometry(0.025, 0.025, 0.25, 6),
          px + dx * d,
          Y + ARM_HEIGHT - 0.15,
          pz + dz * d,
        ),
      );
    }
  }
  return merge(parts);
}

function headGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new RoundedBoxGeometry(0.36, 1.05, 0.26, 2, 0.04)];
  parts.push(at(new THREE.BoxGeometry(0.62, 1.3, 0.02), 0, 0, -0.14)); // backplate
  for (const y of Object.values(LENS_Y)) {
    const visor = new THREE.CylinderGeometry(
      0.135,
      0.135,
      0.22,
      16,
      1,
      true,
      -Math.PI / 2,
      Math.PI,
    );
    visor.rotateX(Math.PI / 2);
    parts.push(at(visor, 0, y, 0.24));
  }
  return merge(parts);
}

function headMatrices(phase: SignalPhase): THREE.Matrix4[] {
  return ARMS.filter((a) => a.phase === phase).flatMap((a) =>
    a.heads.map((d) => {
      const m = new THREE.Matrix4().makeRotationAxis(UP, Math.atan2(a.face[0], a.face[1]));
      return m.setPosition(a.pole[0] + a.dir[0] * d, Y + HEAD_CENTER, a.pole[1] + a.dir[1] * d);
    }),
  );
}

function TrafficSignals() {
  const paint = usePbrMaterial('metal_plate', { tileMeters: 1, color: '#3b3f42', roughness: 0.55 });
  const { objects, lenses } = useMemo(() => {
    const housing = new THREE.MeshStandardMaterial({ color: '#16181a', roughness: 0.6 });
    const all = [...headMatrices('A'), ...headMatrices('B')];
    const poles = new THREE.Mesh(poleGeometry(), paint);
    poles.castShadow = poles.receiveShadow = true;
    const heads = new THREE.InstancedMesh(headGeometry(), housing, all.length);
    all.forEach((m, i) => heads.setMatrixAt(i, m));
    heads.castShadow = true;
    heads.computeBoundingSphere();

    const lensGeo = (y: number) => new THREE.CircleGeometry(0.11, 24).translate(0, y, 0.135);
    const lenses: { phase: SignalPhase; color: SignalColor; mat: THREE.MeshStandardMaterial }[] =
      [];
    const lensMeshes: THREE.InstancedMesh[] = [];
    for (const phase of ['A', 'B'] as const) {
      const ms = headMatrices(phase);
      for (const color of ['red', 'yellow', 'green'] as const) {
        const mat = new THREE.MeshStandardMaterial({
          color: LENS_OFF[color],
          emissive: LENS_ON[color],
          emissiveIntensity: 0,
          roughness: 0.2,
        });
        const inst = new THREE.InstancedMesh(lensGeo(LENS_Y[color]), mat, ms.length);
        ms.forEach((m, i) => inst.setMatrixAt(i, m));
        inst.computeBoundingSphere();
        lenses.push({ phase, color, mat });
        lensMeshes.push(inst);
      }
    }
    return { objects: [poles, heads, ...lensMeshes], lenses };
  }, [paint]);

  useEffect(() => () => objects.forEach((o) => o.geometry.dispose()), [objects]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (const l of lenses) {
      l.mat.emissiveIntensity = signalColor(l.phase, t) === l.color ? 4 : 0;
    }
  });

  return (
    <>
      {objects.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
    </>
  );
}

export function Fixtures() {
  return (
    <>
      <StreetLights />
      <TrafficSignals />
    </>
  );
}
