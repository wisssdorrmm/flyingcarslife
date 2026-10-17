import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { playerState } from '../player/playerState';
import { vehicleState } from '../vehicles/vehicleState';
import {
  COLLIDER_CHUNK,
  colliderStreaming,
  streamCollidersAround,
  type ColliderChunk,
} from './colliderStreaming';
import * as THREE from 'three';
import { CAR_COLLIDER, PARKED } from '../vehicles/parkedLayout';
import { buildingHeight, cityBuildings } from './buildingLayout';
import { MAST_ARMS, ARM_HEIGHT, propPlacements, streetLightPlacements } from './furnitureLayout';
import { BLOCKS, CORNER_RADIUS, CURB_HEIGHT } from './cityPlan';

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

const Y = CURB_HEIGHT;

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
 * Static collision for the block: ground, raised sidewalks (real curb steps), buildings, poles,
 * props and parked cars. Primitives only — they're cheaper and more robust than trimeshes.
 */
export function WorldColliders() {
  const { boxes, cylinders } = useMemo(() => {
    const boxes: Box[] = [];
    const cylinders: Cylinder[] = [];

    // Sidewalk slabs: the block rectangle minus rounded corners, as two overlapping boxes
    // (each shrunk by the corner radius on one axis) plus a cylinder or square per corner.
    const R = CORNER_RADIUS;
    const hy = Y / 2;
    for (const b of BLOCKS) {
      const { sx0, sx1, sz0, sz1, roads } = b;
      const cx = (sx0 + sx1) / 2;
      const cz = (sz0 + sz1) / 2;
      boxes.push({
        half: [(sx1 - sx0) / 2, hy, (sz1 - sz0) / 2 - R],
        position: [cx, hy, cz],
        rotY: 0,
      });
      boxes.push({
        half: [(sx1 - sx0) / 2 - R, hy, (sz1 - sz0) / 2],
        position: [cx, hy, cz],
        rotY: 0,
      });
      for (const [rounded, x, z] of [
        [!!(roads.n && roads.w), sx0 + R, sz0 + R],
        [!!(roads.n && roads.e), sx1 - R, sz0 + R],
        [!!(roads.s && roads.w), sx0 + R, sz1 - R],
        [!!(roads.s && roads.e), sx1 - R, sz1 - R],
      ] as const) {
        if (rounded) cylinders.push({ halfHeight: hy, radius: R, position: [x, hy, z] });
        else boxes.push({ half: [R, hy, R], position: [x, hy, z], rotY: 0 });
      }
    }

    for (const b of cityBuildings()) {
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

  // Thousands of static colliders are created straight through Rapier, once. As React collider
  // components they'd each be re-synced (and flagged as moved) every frame.
  // Rapier 0.14's per-step cost also grows with the total collider count (~2.5 ms for the city),
  // so colliders are grouped into chunks and only those near the player/car stay enabled.
  const { world, rapier } = useRapier();
  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    const rot = new THREE.Quaternion();
    const byChunk = new Map<string, ColliderChunk>();
    const add = (
      desc: InstanceType<typeof rapier.ColliderDesc>,
      [x, y, z]: Vec3,
      rotY = 0,
      radius = 0,
    ) => {
      rot.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rotY);
      const c = world.createCollider(
        desc.setTranslation(x, y, z).setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w }),
        body,
      );
      // Big colliders (sidewalk slabs) count as near when any part of them is close.
      if (radius > COLLIDER_CHUNK) return; // the ground: always on
      const key = `${Math.floor(x / COLLIDER_CHUNK)},${Math.floor(z / COLLIDER_CHUNK)}`;
      let chunk = byChunk.get(key);
      if (!chunk) {
        chunk = {
          x: (Math.floor(x / COLLIDER_CHUNK) + 0.5) * COLLIDER_CHUNK,
          z: (Math.floor(z / COLLIDER_CHUNK) + 0.5) * COLLIDER_CHUNK,
          colliders: [],
          enabled: true,
        };
        byChunk.set(key, chunk);
      }
      chunk.colliders.push(c);
    };
    // Ground under everything (top at y = 0).
    add(rapier.ColliderDesc.cuboid(1200, 0.5, 1200), [0, -0.5, 0], 0, Infinity);
    for (const b of boxes) {
      add(
        rapier.ColliderDesc.cuboid(...b.half),
        b.position,
        b.rotY,
        Math.hypot(b.half[0], b.half[2]),
      );
    }
    for (const c of cylinders) {
      add(rapier.ColliderDesc.cylinder(c.halfHeight, c.radius), c.position, 0, c.radius);
    }
    colliderStreaming.chunks = [...byChunk.values()];
    return () => {
      colliderStreaming.chunks = [];
      world.removeRigidBody(body);
    };
  }, [world, rapier, boxes, cylinders]);

  const last = useRef(-1);
  const focus = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, clock }) => {
    if (clock.elapsedTime - last.current < 0.25) return;
    last.current = clock.elapsedTime;
    const obj = vehicleState.active?.object ?? playerState.object;
    if (obj) obj.getWorldPosition(focus);
    else focus.copy(camera.position);
    streamCollidersAround(focus.x, focus.z);
  });

  return null;
}
