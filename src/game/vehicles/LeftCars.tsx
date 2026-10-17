import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { modelUrl } from '../../lib/assets';
import { parkedCarGeometries, policeCarGeometries } from '../city/propModels';
import { usePlayerCar, type LeftCar } from '../store/playerCar';
import { buildStaticCar, CAR_MODEL } from './carModel';

/** Cars the player got out of, standing where they were left (solid, so you can bump them). */
export function LeftCars() {
  const left = usePlayerCar((s) => s.left);
  return (
    <>
      {left.map((c) => (
        <LeftCarView key={c.id} car={c} />
      ))}
    </>
  );
}

function LeftCarView({ car }: { car: LeftCar }) {
  const gltf = useGLTF(modelUrl(CAR_MODEL), false, true);
  const object = useMemo(() => {
    if (car.model === 'ev') return buildStaticCar(gltf.scene, { paint: car.paint });
    const g = parkedCarGeometries();
    const group = new THREE.Group();
    if (car.model === 'police') {
      const p = policeCarGeometries();
      group.add(
        new THREE.Mesh(
          p.doors,
          new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.4 }),
        ),
        new THREE.Mesh(
          p.lightbar,
          new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.5 }),
        ),
      );
    }
    group.add(
      new THREE.Mesh(
        g.body,
        new THREE.MeshStandardMaterial({ color: car.paint, roughness: 0.35, metalness: 0.3 }),
      ),
      new THREE.Mesh(
        g.glass,
        new THREE.MeshStandardMaterial({ color: '#101418', roughness: 0.08 }),
      ),
      new THREE.Mesh(
        g.wheels,
        new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.8 }),
      ),
    );
    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    return group;
  }, [car.model, car.paint, gltf]);
  useEffect(
    () => () => {
      object.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && car.model !== 'ev') m.geometry.dispose();
      });
    },
    [object, car.model],
  );
  return (
    <RigidBody type="fixed" position={car.position} quaternion={car.rotation} colliders={false}>
      <CuboidCollider args={[0.9, 0.55, 2.15]} position={[0, 0.7, 0.1]} />
      <primitive object={object} />
    </RigidBody>
  );
}
