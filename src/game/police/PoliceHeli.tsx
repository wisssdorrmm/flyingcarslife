import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { POLICE } from '../config';
import { vehicleState } from '../vehicles/vehicleState';
import { pursuit } from './pursuit';

/** Side livery: navy with a white band and a fictional "CITY POLICE" title. */
function liveryTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#16233a';
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#f2f3f4';
  ctx.fillRect(0, 120, 512, 46);
  ctx.fillStyle = '#16233a';
  ctx.font = '800 34px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CITY POLICE', 256, 156);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function heliGeometries() {
  const body = new THREE.SphereGeometry(1, 20, 14);
  body.scale(1.15, 1.1, 2.1);
  const boom = new THREE.CylinderGeometry(0.16, 0.28, 5.2, 10);
  boom.rotateX(Math.PI / 2);
  boom.translate(0, 0.35, -4.3);
  const fin = new THREE.BoxGeometry(0.08, 1.3, 0.8);
  fin.translate(0, 0.95, -6.7);
  const stab = new THREE.BoxGeometry(1.8, 0.06, 0.5);
  stab.translate(0, 0.45, -6.2);
  const skids: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const skid = new THREE.CylinderGeometry(0.06, 0.06, 3.6, 6);
    skid.rotateX(Math.PI / 2);
    skid.translate(s * 0.95, -1.35, 0);
    skids.push(skid);
    for (const z of [-0.8, 0.8]) {
      const leg = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6);
      leg.translate(s * 0.9, -1.1, z);
      skids.push(leg);
    }
  }
  const rotor = mergeGeometries([
    new THREE.BoxGeometry(10.5, 0.05, 0.28),
    new THREE.BoxGeometry(0.28, 0.05, 10.5),
  ])!;
  rotor.translate(0, 1.35, 0);
  const tailRotor = new THREE.BoxGeometry(0.04, 1.4, 0.16);
  tailRotor.translate(0.12, 0.95, -6.7);
  const glass = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45);
  glass.rotateX(Math.PI / 2.4);
  glass.scale(1.0, 0.9, 1.3);
  glass.translate(0, 0.15, 0.9);
  const flat = (l: THREE.BufferGeometry[]) =>
    mergeGeometries(l.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  return {
    body,
    tail: flat([boom, fin, stab]),
    metal: flat(skids),
    rotor,
    tailRotor,
    glass,
    disc: new THREE.CircleGeometry(5.3, 32).rotateX(-Math.PI / 2).translate(0, 1.36, 0),
    beam: new THREE.ConeGeometry(4, 34, 20, 1, true).translate(0, -17, 0),
  };
}

/**
 * The police helicopter (from 4 stars). It flies above and a little behind the player, follows
 * into the air, and lights them up with a searchlight. Visual only: no collider.
 */
export function PoliceHeli() {
  const root = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Mesh>(null);
  const tailRotor = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  const geo = useMemo(heliGeometries, []);
  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({
        map: liveryTexture(),
        roughness: 0.35,
        metalness: 0.2,
      }),
      tail: new THREE.MeshStandardMaterial({ color: '#16233a', roughness: 0.4, metalness: 0.2 }),
      metal: new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.5, metalness: 0.6 }),
      rotor: new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: '#0e141a', roughness: 0.05, metalness: 0.5 }),
      disc: new THREE.MeshBasicMaterial({
        color: '#9aa3ab',
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      }),
      beam: new THREE.MeshBasicMaterial({
        color: '#fff6dc',
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        // Front faces only: from inside the cone (the chase camera) it doesn't white out the view.
        side: THREE.FrontSide,
      }),
    }),
    [],
  );
  const unit = useMemo(
    () => ({ position: new THREE.Vector3(), velocity: new THREE.Vector3() }),
    [],
  );
  const tmp = useMemo(
    () => ({ car: new THREE.Vector3(), want: new THREE.Vector3(), q: new THREE.Quaternion() }),
    [],
  );
  const placed = useRef(false);

  useEffect(() => {
    pursuit.heli = unit;
    return () => {
      if (pursuit.heli === unit) pursuit.heli = null;
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      });
    };
  }, [unit, geo, mats]);

  useFrame(({ clock }, dt) => {
    const g = root.current;
    const car = vehicleState.active;
    if (!g || !car) return;
    car.object.getWorldPosition(tmp.car);
    if (!placed.current) {
      // Arrive from a distance rather than pop in overhead.
      unit.position.set(tmp.car.x + 220, tmp.car.y + 70, tmp.car.z + 160);
      placed.current = true;
    }
    // Hold a spot above and a little behind the player, leading them by their speed.
    const lead = Math.min(25, Math.abs(car.speed) * 0.8);
    const h = car.heading ?? 0;
    tmp.want.set(
      tmp.car.x - Math.sin(h) * (14 - lead),
      tmp.car.y + POLICE.heli.height,
      tmp.car.z - Math.cos(h) * (14 - lead),
    );
    const toX = tmp.want.x - unit.position.x;
    const toY = tmp.want.y - unit.position.y;
    const toZ = tmp.want.z - unit.position.z;
    const d = Math.hypot(toX, toY, toZ);
    const speed = Math.min(POLICE.heli.speed, d * 0.9);
    const k = 1 - Math.exp(-dt * 1.6);
    unit.velocity.x += ((d > 0 ? (toX / d) * speed : 0) - unit.velocity.x) * k;
    unit.velocity.y += ((d > 0 ? (toY / d) * speed : 0) - unit.velocity.y) * k;
    unit.velocity.z += ((d > 0 ? (toZ / d) * speed : 0) - unit.velocity.z) * k;
    unit.position.addScaledVector(unit.velocity, dt);
    g.position.copy(unit.position);
    // Face the player; bank and pitch into the motion.
    const yaw = Math.atan2(tmp.car.x - unit.position.x, tmp.car.z - unit.position.z);
    const fwdSpeed = unit.velocity.x * Math.sin(yaw) + unit.velocity.z * Math.cos(yaw);
    const sideSpeed = unit.velocity.x * Math.cos(yaw) - unit.velocity.z * Math.sin(yaw);
    g.rotation.set(Math.min(0.3, fwdSpeed * 0.012), yaw, -sideSpeed * 0.012, 'YXZ');
    if (rotor.current) rotor.current.rotation.y = clock.elapsedTime * 28;
    if (tailRotor.current) tailRotor.current.rotation.x = clock.elapsedTime * 40;
    // Searchlight aimed at the car.
    if (beam.current) {
      const local = g.worldToLocal(tmp.car.clone());
      tmp.q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), local.normalize());
      beam.current.quaternion.copy(tmp.q);
    }
  });

  return (
    <group ref={root}>
      <mesh geometry={geo.body} material={mats.body} castShadow />
      <mesh geometry={geo.tail} material={mats.tail} castShadow />
      <mesh geometry={geo.metal} material={mats.metal} />
      <mesh geometry={geo.glass} material={mats.glass} />
      <mesh ref={rotor} geometry={geo.rotor} material={mats.rotor} castShadow />
      <mesh geometry={geo.disc} material={mats.disc} />
      <mesh ref={tailRotor} geometry={geo.tailRotor} material={mats.rotor} />
      <mesh ref={beam} geometry={geo.beam} material={mats.beam} position={[0, -1.2, 0.8]} />
    </group>
  );
}
