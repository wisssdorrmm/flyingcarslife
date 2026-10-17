import { useEffect, useMemo } from 'react';
import { useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { City } from '../city/cityData';
import { TEST_SCENES } from '../config';
import { carParkBase, carParkLayout, type Box } from './carParkLayout';

const C = TEST_SCENES.carPark;

const MATERIALS: Record<Box['mat'], THREE.Material> = {
  concrete: new THREE.MeshStandardMaterial({ color: '#b9b6ae', roughness: 0.9 }),
  roof: new THREE.MeshStandardMaterial({ color: '#f3f2ee', roughness: 0.75 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: '#bfe3ea',
    roughness: 0.05,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  }),
  rail: new THREE.MeshStandardMaterial({ color: '#cfd4d8', roughness: 0.3, metalness: 0.8 }),
  planter: new THREE.MeshStandardMaterial({ color: '#8c8f93', roughness: 0.8 }),
  shrub: new THREE.MeshStandardMaterial({ color: '#4f7f3a', roughness: 1 }),
  line: new THREE.MeshStandardMaterial({ color: '#9da3a8', roughness: 0.8 }),
};

/**
 * A multi-level rooftop car park with ramps, white roof deck, pillars, glass barriers and
 * planters (CLAUDE.md §6.2 test scene "Rooftop launch"), with box colliders for everything.
 */
export function RooftopCarPark({ city }: { city: City }) {
  const { world, rapier } = useRapier();
  const base = useMemo(() => carParkBase(city), [city]);
  const layout = useMemo(() => carParkLayout(), []);

  const meshes = useMemo(() => {
    const byMat = new Map<Box['mat'], THREE.BufferGeometry[]>();
    for (const b of layout.boxes) {
      const g = new THREE.BoxGeometry(b.h[0] * 2, b.h[1] * 2, b.h[2] * 2);
      if (b.tilt) g.rotateX(b.tilt);
      g.translate(...b.c);
      let list = byMat.get(b.mat);
      if (!list) byMat.set(b.mat, (list = []));
      list.push(g.toNonIndexed());
    }
    return [...byMat].map(([mat, list]) => {
      const mesh = new THREE.Mesh(mergeGeometries(list)!, MATERIALS[mat]);
      mesh.castShadow = mat !== 'glass' && mat !== 'line';
      mesh.receiveShadow = true;
      return mesh;
    });
  }, [layout]);
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes]);

  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(C.x, base, C.z));
    const q = new THREE.Quaternion();
    for (const b of layout.boxes) {
      if (b.mat === 'line' || b.mat === 'shrub') continue;
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), b.tilt ?? 0);
      world.createCollider(
        rapier.ColliderDesc.cuboid(...b.h)
          .setTranslation(...b.c)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
        body,
      );
    }
    return () => world.removeRigidBody(body);
  }, [world, rapier, base, layout]);

  return (
    <group position={[C.x, base, C.z]}>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}
