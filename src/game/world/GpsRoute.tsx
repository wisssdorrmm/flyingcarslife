import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useLife } from '../store/life';
import { currentPose, useNav } from '../store/nav';
import { findRoute, routeLength } from './navGraph';

const RECOMPUTE_SECONDS = 0.5;
const ARRIVE_METERS = 9;
/** Keep the line in the right-hand lane rather than on the yellow centerline. */
const LANE_OFFSET = 1.75;
const LINE_WIDTH = 0.7;

/** Chevron texture that scrolls along the route like a GPS arrow trail. */
function chevronTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(180, 107, 255, 0.55)';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#f3e8ff';
  ctx.lineWidth = 9;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(14, 12);
  ctx.lineTo(42, 32);
  ctx.lineTo(14, 52);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Flat ribbon along a polyline, offset to the right of travel; UV u runs in meters. */
function ribbon(points: { x: number; z: number }[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let dist = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(points.length - 1, i + 1)]!;
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // Right of travel for right-hand traffic.
    const rx = -dz;
    const rz = dx;
    if (i > 0) dist += Math.hypot(p.x - points[i - 1]!.x, p.z - points[i - 1]!.z);
    const cx = p.x + rx * LANE_OFFSET;
    const cz = p.z + rz * LANE_OFFSET;
    pos.push(cx - rx * (LINE_WIDTH / 2), 0.04, cz - rz * (LINE_WIDTH / 2));
    pos.push(cx + rx * (LINE_WIDTH / 2), 0.04, cz + rz * (LINE_WIDTH / 2));
    uv.push(dist / 1.6, 0, dist / 1.6, 1);
    if (i > 0) {
      const o = (i - 1) * 2;
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Recomputes the route as the player moves, draws it on the road, and handles arrival. */
export function GpsRoute() {
  const line = useRef<THREE.Mesh>(null);
  const beacon = useRef<THREE.Group>(null);
  const last = useRef(-1);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: chevronTexture(),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    [],
  );
  useEffect(() => () => material.map?.dispose(), [material]);

  useFrame(({ clock }, dt) => {
    if (material.map) material.map.offset.x -= dt * 0.9;
    const nav = useNav.getState();
    const wp = nav.waypoint;
    if (beacon.current) {
      beacon.current.visible = !!wp;
      if (wp) beacon.current.position.set(wp.x, 0, wp.z);
    }
    if (!wp) {
      if (line.current) line.current.visible = false;
      return;
    }
    if (clock.elapsedTime - last.current < RECOMPUTE_SECONDS) return;
    last.current = clock.elapsedTime;
    const pose = currentPose();
    if (!pose) return;
    if (Math.hypot(pose.x - wp.x, pose.z - wp.z) < ARRIVE_METERS) {
      useLife.getState().toast(`You've arrived: ${wp.label}`);
      nav.setWaypoint(null);
      return;
    }
    const route = findRoute(pose.x, pose.z, wp.x, wp.z);
    const full = [{ x: pose.x, z: pose.z }, ...route, { x: wp.x, z: wp.z }];
    nav.setRoute(full, routeLength(full));
    const mesh = line.current;
    if (mesh && route.length > 1) {
      mesh.geometry.dispose();
      mesh.geometry = ribbon(route);
      mesh.visible = true;
    }
  });

  return (
    <>
      <mesh ref={line} material={material} visible={false} renderOrder={2} frustumCulled={false}>
        <bufferGeometry />
      </mesh>
      {/* Destination beacon, visible over rooftops. */}
      <group ref={beacon} visible={false}>
        <mesh position={[0, 30, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 60, 16, 1, true]} />
          <meshBasicMaterial
            color="#ffcc33"
            transparent
            opacity={0.35}
            depthWrite={false}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.4, 2.0, 32]} />
          <meshBasicMaterial color="#ffcc33" transparent opacity={0.8} toneMapped={false} />
        </mesh>
      </group>
    </>
  );
}
