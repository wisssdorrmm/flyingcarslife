import { useMemo } from 'react';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { CAR_COLLIDER, PARKED } from '../vehicles/parkedLayout';
import { buildingHeight, generateBuildings } from './buildingLayout';
import { MAST_ARMS, ARM_HEIGHT, propPlacements, streetLightPlacements } from './furnitureLayout';
import { LAYOUT } from './layout';

type Vec3 = [number, number, number];

interface Box {
  half: Vec3;
  position: Vec3;
  rotY: number;
}

interface Cylinder {
  halfHeight: number;
  radius: number;
  position: Vec3;
}

const Y = LAYOUT.curbHeight;

function decompose(m: THREE.Matrix4): { position: THREE.Vector3; rotY: number; scale: number } {
  const position = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  m.decompose(position, q, s);
  return { position, rotY: new THREE.Euler().setFromQuaternion(q, 'YXZ').y, scale: s.x };
}

/** Offset a local point by a Y rotation. */
function rotateY(x: number, z: number, rot: number): [number, number] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [x * c + z * s, -x * s + z * c];
}

/**
 * Static collision for the block: ground, buildings, poles, props and parked cars.
 * Sidewalk curbs are trimesh colliders on the sidewalk meshes themselves (see Street).
 */
export function WorldColliders() {
  const { boxes, cylinders } = useMemo(() => {
    const boxes: Box[] = [];
    const cylinders: Cylinder[] = [];

    for (const b of generateBuildings()) {
      const h = buildingHeight(b) + Y;
      boxes.push({
        half: [(b.x1 - b.x0) / 2, h / 2, (b.z1 - b.z0) / 2],
        position: [(b.x0 + b.x1) / 2, h / 2, (b.z0 + b.z1) / 2],
        rotY: 0,
      });
    }

    for (const m of streetLightPlacements()) {
      const { position: p } = decompose(m);
      cylinders.push({ halfHeight: 4.3, radius: 0.13, position: [p.x, p.y + 4.3, p.z] });
    }
    for (const arm of MAST_ARMS) {
      const h = (ARM_HEIGHT + 0.4) / 2;
      cylinders.push({ halfHeight: h, radius: 0.22, position: [arm.pole[0], Y + h, arm.pole[1]] });
    }

    const props = propPlacements();
    for (const m of props.tree) {
      const { position: p } = decompose(m);
      cylinders.push({ halfHeight: 1.2, radius: 0.14, position: [p.x, p.y + 1.2, p.z] });
    }
    for (const m of props.hydrant) {
      const { position: p } = decompose(m);
      cylinders.push({ halfHeight: 0.4, radius: 0.17, position: [p.x, p.y + 0.4, p.z] });
    }
    for (const m of props.trashCan) {
      const { position: p } = decompose(m);
      cylinders.push({ halfHeight: 0.46, radius: 0.3, position: [p.x, p.y + 0.46, p.z] });
    }
    for (const m of props.utilityBox) {
      const { position: p, rotY } = decompose(m);
      boxes.push({ half: [0.26, 0.56, 0.22], position: [p.x, p.y + 0.56, p.z], rotY });
    }
    for (const m of props.bench) {
      const { position: p, rotY } = decompose(m);
      boxes.push({ half: [1.18, 0.42, 0.32], position: [p.x, p.y + 0.42, p.z], rotY });
    }

    for (const car of PARKED) {
      const [cx, cy, cz] = CAR_COLLIDER.center;
      const [ox, oz] = rotateY(cx, cz, car.heading);
      boxes.push({
        half: [...CAR_COLLIDER.halfExtents],
        position: [car.position[0] + ox, car.position[1] + cy, car.position[2] + oz],
        rotY: car.heading,
      });
    }
    return { boxes, cylinders };
  }, []);

  return (
    <RigidBody type="fixed" colliders={false}>
      {/* Ground under everything (top at y = 0). */}
      <CuboidCollider args={[1200, 0.5, 1200]} position={[0, -0.5, 0]} />
      {boxes.map((b, i) => (
        <CuboidCollider
          key={`b${i}`}
          args={b.half}
          position={b.position}
          rotation={[0, b.rotY, 0]}
        />
      ))}
      {cylinders.map((c, i) => (
        <CylinderCollider key={`c${i}`} args={[c.halfHeight, c.radius]} position={c.position} />
      ))}
    </RigidBody>
  );
}
