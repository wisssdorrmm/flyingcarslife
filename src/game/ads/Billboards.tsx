import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import bookings from '../../data/billboards.json';
import type { City } from '../city/cityData';
import { BILLBOARDS } from '../config';

/** A booked creative (same shape the future backend will serve). */
interface Booking {
  slot_id: string;
  image: string;
  link: string;
  start_date: string;
  end_date: string;
}

interface Slot {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Board faces the road: yaw (0 faces +z). */
  yaw: number;
}

/** Poster for an empty slot: one of the owner's brands, or the "Advertise here" card. */
function houseTexture(i: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 460;
  const g = c.getContext('2d')!;
  const house = BILLBOARDS.house[i];
  if (house) {
    g.fillStyle = house.bg;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = house.accent;
    g.fillRect(0, c.height - 46, c.width, 46);
    g.fillStyle = house.fg;
    g.font = '800 170px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(house.name, c.width / 2, 245);
    g.font = '600 52px system-ui, sans-serif';
    g.fillText(house.tagline, c.width / 2, 335);
  } else {
    g.fillStyle = '#0d1b22';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#2fd5c0';
    g.lineWidth = 14;
    g.strokeRect(20, 20, c.width - 40, c.height - 40);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.font = '800 110px system-ui, sans-serif';
    g.fillText('ADVERTISE HERE', c.width / 2, 200);
    g.fillStyle = '#2fd5c0';
    g.font = '700 56px system-ui, sans-serif';
    g.fillText(BILLBOARDS.advertise, c.width / 2, 310);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Roadside slots along the main roads, on the sidewalk side, facing the traffic. */
function placeSlots(city: City): Slot[] {
  const slots: Slot[] = [];
  city.index.edges.forEach((e, ei) => {
    if (e.cls !== 'major' && e.cls !== 'minor') return;
    const p = e.pts;
    let acc = BILLBOARDS.spacing * 0.5;
    let n = 0;
    for (let i = 2; i < p.length; i += 2) {
      const sx = p[i]! - p[i - 2]!;
      const sz = p[i + 1]! - p[i - 1]!;
      const l = Math.hypot(sx, sz);
      acc += l;
      if (acc < BILLBOARDS.spacing || l < 1) continue;
      acc = 0;
      const dx = sx / l;
      const dz = sz / l;
      // Right side of a → b, over the sidewalk, facing back across the road.
      const off = e.width / 2 + 2.4;
      const x = p[i - 2]! + sx * 0.5 - dz * off;
      const z = p[i - 1]! + sz * 0.5 + dx * off;
      slots.push({
        id: `road-${ei}-${n++}`,
        x,
        z,
        y: city.heightAt(x, z) + 0.15,
        yaw: Math.atan2(dz, -dx),
      });
    }
  });
  return slots;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Creative order for empty boards: 0 = top advertiser, 4 = "Advertise here". */
const ROTATION = [0, 1, 0, 2, 0, 3, 0, 4];

/**
 * Billboards (CLAUDE.md §6.8): roadside boards along the main roads. A slot booked in
 * src/data/billboards.json (and in its date range) shows that image and opens its link on click;
 * empty slots rotate the owner's brands and an "Advertise here" card.
 */
export function Billboards({ city }: { city: City }) {
  const slots = useMemo(() => placeSlots(city), [city]);
  const house = useMemo(() => [0, 1, 2, 3, 4].map(houseTexture), []);
  const booked = useMemo(() => {
    const d = today();
    const map = new Map<string, Booking>();
    for (const b of bookings as Booking[]) {
      if (b.image && b.start_date <= d && d <= b.end_date) map.set(b.slot_id, b);
    }
    return map;
  }, []);
  const bookedTex = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const map = new Map<string, THREE.Texture>();
    for (const [id, b] of booked) {
      const t = loader.load(b.image);
      t.colorSpace = THREE.SRGBColorSpace;
      map.set(id, t);
    }
    return map;
  }, [booked]);
  useEffect(
    () => () => {
      house.forEach((t) => t.dispose());
      bookedTex.forEach((t) => t.dispose());
    },
    [house, bookedTex],
  );

  // Instanced: posts and frames in two meshes, house boards grouped by creative; booked boards
  // keep their own mesh (own texture, clickable).
  const inst = useMemo(() => {
    const W = BILLBOARDS.width;
    const H = BILLBOARDS.height;
    const L = BILLBOARDS.lift;
    const frameMat = new THREE.MeshStandardMaterial({
      color: '#2a2d31',
      roughness: 0.6,
      metalness: 0.5,
    });
    const posts = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.13, 0.16, L, 8).translate(0, L / 2, -0.15),
      frameMat,
      slots.length * 2,
    );
    const frames = new THREE.InstancedMesh(
      new THREE.BoxGeometry(W + 0.3, H + 0.3, 0.18).translate(0, L + H / 2, -0.12),
      frameMat,
      slots.length,
    );
    const boardGeo = new THREE.PlaneGeometry(W, H).translate(0, L + H / 2, 0);
    const boardMats = house.map(
      (t) =>
        new THREE.MeshStandardMaterial({
          map: t,
          roughness: 0.55,
          emissive: '#ffffff',
          emissiveMap: t,
          emissiveIntensity: 0.12,
        }),
    );
    const boards = boardMats.map((m) => {
      const im = new THREE.InstancedMesh(boardGeo, m, slots.length);
      im.count = 0;
      im.frustumCulled = false;
      return im;
    });
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const at = (s: Slot, dx = 0) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.yaw);
      const off = new THREE.Vector3(dx, 0, 0).applyQuaternion(q);
      return m4.compose(new THREE.Vector3(s.x + off.x, s.y, s.z + off.z), q, one);
    };
    slots.forEach((s, i) => {
      posts.setMatrixAt(i * 2, at(s, -W * 0.3));
      posts.setMatrixAt(i * 2 + 1, at(s, W * 0.3));
      frames.setMatrixAt(i, at(s));
    });
    for (const m of [posts, frames]) {
      m.castShadow = true;
      m.frustumCulled = false;
    }
    return { posts, frames, boards, boardMats, boardGeo, frameMat, at };
  }, [slots, house]);
  useEffect(
    () => () => {
      inst.posts.geometry.dispose();
      inst.frames.geometry.dispose();
      inst.boardGeo.dispose();
      inst.frameMat.dispose();
      inst.boardMats.forEach((m) => m.dispose());
    },
    [inst],
  );

  // Rotate house creatives on empty slots.
  const last = useRef(-1);
  useFrame(({ clock }) => {
    const step = Math.floor(clock.elapsedTime / BILLBOARDS.rotateSeconds);
    if (step === last.current) return;
    last.current = step;
    const counts = inst.boards.map(() => 0);
    slots.forEach((s, i) => {
      if (booked.has(s.id)) return;
      // The top advertiser (creative 0) shows on every other board.
      const k = ROTATION[(i + step) % ROTATION.length]!;
      inst.boards[k]!.setMatrixAt(counts[k]!++, inst.at(s));
    });
    inst.boards.forEach((b, k) => {
      b.count = counts[k]!;
      b.instanceMatrix.needsUpdate = true;
    });
  });

  const W = BILLBOARDS.width;
  const H = BILLBOARDS.height;
  const L = BILLBOARDS.lift;
  return (
    <>
      <primitive object={inst.posts} />
      <primitive object={inst.frames} />
      {inst.boards.map((b, k) => (
        <primitive key={k} object={b} />
      ))}
      {slots
        .filter((s) => booked.has(s.id))
        .map((s) => (
          <mesh
            key={s.id}
            position={[s.x, s.y + L + H / 2, s.z]}
            rotation-y={s.yaw}
            onClick={() => window.open(booked.get(s.id)!.link, '_blank', 'noopener')}
          >
            <planeGeometry args={[W, H]} />
            <meshStandardMaterial map={bookedTex.get(s.id)} roughness={0.55} />
          </mesh>
        ))}
    </>
  );
}
