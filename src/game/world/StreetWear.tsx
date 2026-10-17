/**
 * Wear and dirt on the streets (CLAUDE.md §10): crack/patch/tar-seam/oil/tire-mark decals on the
 * asphalt, stains/gum/litter on the sidewalks, red no-parking curbs and storm drains.
 * Everything is merged per chunk (decals) or into a single mesh (curb paint, drains), so the
 * whole layer costs a handful of draw calls.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { STYLE } from '../config';
import { useSettings } from '../store/settings';
import {
  BLOCKS,
  CORNER_RADIUS as R,
  CROSSWALK_WIDTH,
  CURB_HEIGHT,
  EXTENT,
  halfWidth,
  PITCH,
  ROADS,
  roadsAlong,
  type Road,
} from './cityPlan';
import {
  decalLength,
  DECAL_SIZE,
  decalUv,
  makeDecalAtlas,
  makeWearTexture,
  type DecalKind,
} from './decalAtlas';
import { propPlacements } from './furnitureLayout';
import { hashString, range, seeded, weighted } from '../../lib/rand';

/** The sidewalk slab's bevel puts its walking surface 2 cm above CURB_HEIGHT. */
export const SLAB_TOP = CURB_HEIGHT + 0.02;
/** How far the bevel pushes the curb face out past the slab outline. */
const CURB_FACE = 0.022;

interface Decal {
  kind: DecalKind;
  x: number;
  y: number;
  z: number;
  /** Direction of the decal's length axis on the ground. */
  yaw: number;
  length: number;
  width: number;
}

function roadPoint(r: Road, u: number, v: number): [number, number] {
  return r.axis === 'x' ? [u, r.coord + v] : [r.coord + v, u];
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

function roadDecals(): Decal[] {
  const out: Decal[] = [];
  for (const r of ROADS) {
    const rand = seeded(hashString(`wear:${r.id}`));
    // Every road wears differently: some crackier, some oilier, some patched to death.
    const crack = range(rand, 0.5, 1.6);
    const oil = range(rand, 0.6, 1.5);
    const patch = range(rand, 0.2, 1.4);
    const seam = range(rand, 0.4, 1.5);
    const weights: Partial<Record<DecalKind, number>> = {
      crackNet: crack,
      crackLong: 0.8 * crack,
      patch: 0.35 * patch,
      tarSeam: 0.7 * seam,
      oil: oil,
      drips: 0.6 * oil,
      tireMarks: 0.45,
      bleach: 0.2,
    };
    const hw = halfWidth(r);
    const along = r.axis === 'x' ? 0 : Math.PI / 2;
    const travel = r.laneWidth * r.lanesPerSide;
    const laneCenters: number[] = [];
    for (const side of [-1, 1]) {
      for (let k = 0; k < r.lanesPerSide; k++) laneCenters.push(side * r.laneWidth * (k + 0.5));
      // Parked cars drip the most.
      laneCenters.push(side * (travel + r.parking / 2), side * (travel + r.parking / 2));
    }
    const crossings = roadsAlong(r.axis === 'x' ? 'z' : 'x');
    const n = Math.round(2 * EXTENT * STYLE.decals.roadPerMeter);

    for (let i = 0; i < n; i++) {
      const kind = weighted(rand, weights as Record<DecalKind, number>);
      const length = decalLength(rand, kind);
      let width = length * DECAL_SIZE[kind].aspect;
      let u = range(rand, -EXTENT + 3, EXTENT - 3);
      let v: number;
      let yaw = rand() * Math.PI * 2;
      let lenOut = length;

      if (kind === 'oil' || kind === 'drips') {
        v = laneCenters[Math.floor(rand() * laneCenters.length)]! + (rand() - 0.5) * 0.5;
        yaw = along + (rand() - 0.5) * 0.4;
      } else if (kind === 'tireMarks') {
        // Braking streaks on the approach to a crossing, in the right-hand lanes.
        const c = crossings[Math.floor(rand() * crossings.length)]!;
        const dir = rand() < 0.5 ? -1 : 1;
        u = c.coord - dir * (halfWidth(c) + 0.5 + CROSSWALK_WIDTH + range(rand, 3, 14));
        const rightOfPlus = r.axis === 'x' ? 1 : -1;
        v = dir * rightOfPlus * r.laneWidth * (Math.floor(rand() * r.lanesPerSide) + 0.5);
        width = 3.2;
        yaw = along + (rand() - 0.5) * 0.08;
      } else if (kind === 'tarSeam' && rand() < 0.4) {
        // Some seams run across the road (joints between paving runs).
        lenOut = Math.min(length, 2 * hw - 0.8);
        v = 0;
        yaw = along + Math.PI / 2;
      } else if (kind === 'tarSeam' || kind === 'crackLong' || kind === 'patch') {
        yaw = along + (rand() < 0.5 ? 0 : Math.PI) + (rand() - 0.5) * 0.12;
        v = range(rand, -hw, hw);
      } else {
        v = range(rand, -hw, hw);
      }

      // Keep the decal on the asphalt.
      const cos = Math.abs(Math.cos(yaw - along));
      const sin = Math.abs(Math.sin(yaw - along));
      const across = (lenOut * sin + width * cos) / 2;
      const limit = hw - 0.12 - across;
      if (limit < 0) continue;
      v = THREE.MathUtils.clamp(v, -limit, limit);
      const [x, z] = roadPoint(r, u, v);
      // Each decal sits a hair higher than the last so overlaps never z-fight.
      out.push({ kind, x, y: 0.006 + (i % 7) * 0.0004, z, yaw, length: lenOut, width });
    }
  }
  return out;
}

const SIDEWALK_WEIGHTS: Partial<Record<DecalKind, number>> = {
  stain: 0.26,
  gum: 0.2,
  swCrack: 0.14,
  leaves: 0.12,
  cup: 0.06,
  paper: 0.08,
  butts: 0.08,
  spill: 0.06,
};

function sidewalkDecals(): Decal[] {
  const out: Decal[] = [];
  for (const b of BLOCKS) {
    const rand = seeded(hashString(`walk:${b.id}`));
    // Strips between the curb and the building line, one per side that faces a road.
    const strips: { x0: number; x1: number; z0: number; z1: number }[] = [];
    const xs0 = b.sx0 + R;
    const xs1 = b.sx1 - R;
    const zs0 = b.sz0 + R;
    const zs1 = b.sz1 - R;
    if (b.roads.n) strips.push({ x0: xs0, x1: xs1, z0: b.sz0 + 0.3, z1: b.z0 - 0.15 });
    if (b.roads.s) strips.push({ x0: xs0, x1: xs1, z0: b.z1 + 0.15, z1: b.sz1 - 0.3 });
    if (b.roads.w) strips.push({ x0: b.sx0 + 0.3, x1: b.x0 - 0.15, z0: zs0, z1: zs1 });
    if (b.roads.e) strips.push({ x0: b.x1 + 0.15, x1: b.sx1 - 0.3, z0: zs0, z1: zs1 });
    for (const s of strips) {
      const len = Math.max(s.x1 - s.x0, s.z1 - s.z0);
      const n = Math.round(len * STYLE.decals.sidewalkPerMeter * range(rand, 0.6, 1.4));
      for (let i = 0; i < n; i++) {
        const kind = weighted(rand, SIDEWALK_WEIGHTS as Record<DecalKind, number>);
        const length = decalLength(rand, kind);
        const half = length / 2;
        if (s.x1 - s.x0 < length || s.z1 - s.z0 < length) continue;
        out.push({
          kind,
          x: range(rand, s.x0 + half, s.x1 - half),
          z: range(rand, s.z0 + half, s.z1 - half),
          y: SLAB_TOP + 0.003 + (i % 5) * 0.0004,
          yaw: rand() * Math.PI * 2,
          length,
          width: length * DECAL_SIZE[kind].aspect,
        });
      }
    }
  }
  return out;
}

/** A painted run of curb: `axis` is the direction it runs, `line` its fixed coordinate. */
interface CurbRun {
  axis: 'x' | 'z';
  line: number;
  a: number;
  b: number;
  /** +1/−1: which way the road is from the curb. */
  out: number;
}

function redCurbRuns(): CurbRun[] {
  const runs: CurbRun[] = [];
  const [minLen, maxLen] = STYLE.redCurbLength;
  for (const b of BLOCKS) {
    const rand = seeded(hashString(`curb:${b.id}`));
    const { n, s, w, e } = b.roads;
    const maybe = (run: CurbRun) => {
      if (rand() < STYLE.redCurbChance) runs.push(run);
    };
    const len = () => range(rand, minLen, maxLen);
    // Red curbs run away from each rounded corner (no parking near crosswalks).
    if (n && w) {
      const l = len();
      maybe({ axis: 'x', line: b.sz0, a: b.sx0 + R, b: b.sx0 + R + l, out: -1 });
      maybe({ axis: 'z', line: b.sx0, a: b.sz0 + R, b: b.sz0 + R + len(), out: -1 });
    }
    if (n && e) {
      maybe({ axis: 'x', line: b.sz0, a: b.sx1 - R - len(), b: b.sx1 - R, out: -1 });
      maybe({ axis: 'z', line: b.sx1, a: b.sz0 + R, b: b.sz0 + R + len(), out: 1 });
    }
    if (s && e) {
      maybe({ axis: 'x', line: b.sz1, a: b.sx1 - R - len(), b: b.sx1 - R, out: 1 });
      maybe({ axis: 'z', line: b.sx1, a: b.sz1 - R - len(), b: b.sz1 - R, out: 1 });
    }
    if (s && w) {
      maybe({ axis: 'x', line: b.sz1, a: b.sx0 + R, b: b.sx0 + R + len(), out: 1 });
      maybe({ axis: 'z', line: b.sx0, a: b.sz1 - R - len(), b: b.sz1 - R, out: -1 });
    }
  }
  // Fire hydrants always get red curb either side.
  const ew = roadsAlong('x');
  const p = new THREE.Vector3();
  for (const m of propPlacements().hydrant) {
    p.setFromMatrixPosition(m);
    const road = ew.reduce((best, r) =>
      Math.abs(p.z - r.coord) < Math.abs(p.z - best.coord) ? r : best,
    );
    const side = Math.sign(p.z - road.coord);
    runs.push({
      axis: 'x',
      line: road.coord + side * halfWidth(road),
      a: p.x - 3,
      b: p.x + 3,
      out: -side,
    });
  }
  return runs;
}

/** Storm drains: a grate in the gutter by one end of each block side, with a curb inlet. */
function drainRuns(): CurbRun[] {
  const out: CurbRun[] = [];
  for (const b of BLOCKS) {
    const rand = seeded(hashString(`drain:${b.id}`));
    const at = (lo: number, hi: number) => {
      const off = range(rand, R + 1.5, R + 4);
      const c = rand() < 0.5 ? lo + off : hi - off;
      return [c - 0.7, c + 0.7] as const;
    };
    if (b.roads.n) out.push({ axis: 'x', line: b.sz0, ...ab(at(b.sx0, b.sx1)), out: -1 });
    if (b.roads.s) out.push({ axis: 'x', line: b.sz1, ...ab(at(b.sx0, b.sx1)), out: 1 });
    if (b.roads.w) out.push({ axis: 'z', line: b.sx0, ...ab(at(b.sz0, b.sz1)), out: -1 });
    if (b.roads.e) out.push({ axis: 'z', line: b.sx1, ...ab(at(b.sz0, b.sz1)), out: 1 });
  }
  return out;
}
const ab = ([a, b]: readonly [number, number]) => ({ a, b });

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

class QuadBuilder {
  pos: number[] = [];
  uv: number[] = [];
  nor: number[] = [];
  idx: number[] = [];

  /** Adds a quad from 4 corners (counter-clockwise seen from the side the normal faces). */
  quad(c: [number, number, number][], uvs: [number, number][], n: [number, number, number]): void {
    const o = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(...c[i]!);
      this.uv.push(...uvs[i]!);
      this.nor.push(...n);
    }
    this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

function addDecal(q: QuadBuilder, d: Decal): void {
  const cx = Math.cos(d.yaw);
  const cz = Math.sin(d.yaw);
  const hl = d.length / 2;
  const hw = d.width / 2;
  const corner = (sl: number, sw: number): [number, number, number] => [
    d.x + cx * hl * sl - cz * hw * sw,
    d.y,
    d.z + cz * hl * sl + cx * hw * sw,
  ];
  const [u0, v0, u1, v1] = decalUv(d.kind);
  // Wound so the face points up (+y).
  q.quad(
    [corner(-1, -1), corner(-1, 1), corner(1, 1), corner(1, -1)],
    [
      [u0, v1],
      [u0, v0],
      [u1, v0],
      [u1, v1],
    ],
    [0, 1, 0],
  );
}

/** Paint on the curb: the vertical face, the bevel and a strip of the top edge. */
function addCurbRun(
  q: QuadBuilder,
  r: CurbRun,
  faceTop: number,
  faceBottom: number,
  topWidth: number,
): void {
  const P = (along: number, across: number, y: number): [number, number, number] =>
    r.axis === 'x' ? [along, y, r.line + across] : [r.line + across, y, along];
  const o = r.out;
  const n: [number, number, number] = r.axis === 'x' ? [0, 0, o] : [o, 0, 0];
  const len = r.b - r.a;
  const uvs = (h: number): [number, number][] => [
    [0, 0],
    [len, 0],
    [len, h],
    [0, h],
  ];
  // Quads are wound per side so they face the road (front side), regardless of `out`.
  const flip = (c: [number, number, number][]) =>
    (r.axis === 'x' ? o > 0 : o < 0) ? c : [c[1]!, c[0]!, c[3]!, c[2]!];
  q.quad(
    flip([
      P(r.a, o * CURB_FACE, faceBottom),
      P(r.b, o * CURB_FACE, faceBottom),
      P(r.b, o * CURB_FACE, faceTop),
      P(r.a, o * CURB_FACE, faceTop),
    ]),
    uvs(faceTop - faceBottom),
    n,
  );
  if (topWidth <= 0) return;
  q.quad(
    flip([
      P(r.a, o * CURB_FACE, faceTop),
      P(r.b, o * CURB_FACE, faceTop),
      P(r.b, 0, SLAB_TOP + 0.0015),
      P(r.a, 0, SLAB_TOP + 0.0015),
    ]),
    uvs(0.03),
    [n[0] * 0.7, 0.7, n[2] * 0.7],
  );
  q.quad(
    flip([
      P(r.a, 0, SLAB_TOP + 0.0015),
      P(r.b, 0, SLAB_TOP + 0.0015),
      P(r.b, -o * topWidth, SLAB_TOP + 0.0015),
      P(r.a, -o * topWidth, SLAB_TOP + 0.0015),
    ]),
    uvs(topWidth),
    [0, 1, 0],
  );
}

/** Drain grates lie flat in the gutter in front of each inlet. */
function addGrate(q: QuadBuilder, r: CurbRun): void {
  const mid = (r.a + r.b) / 2;
  const P = (along: number, across: number): [number, number, number] =>
    r.axis === 'x' ? [along, 0.008, r.line + across] : [r.line + across, 0.008, along];
  const near = r.out * 0.08;
  const far = r.out * 0.72;
  const c = [P(mid - 0.48, near), P(mid + 0.48, near), P(mid + 0.48, far), P(mid - 0.48, far)];
  // Face up whichever way the run points.
  const up = (r.axis === 'x' ? r.out < 0 : r.out > 0) ? c : [c[1]!, c[0]!, c[3]!, c[2]!];
  q.quad(
    up,
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    [0, 1, 0],
  );
}

function makeGrateTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#4a4744';
  ctx.fillRect(0, 0, 128, 96);
  ctx.fillStyle = '#0a0a0a';
  for (let x = 12; x < 120; x += 10) ctx.fillRect(x, 12, 5, 72);
  ctx.strokeStyle = '#2e2b28';
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, 122, 90);
  // Rust and grime.
  const rand = seeded(7);
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(110,62,30,0.25)' : 'rgba(20,18,16,0.25)';
    ctx.fillRect(rand() * 128, rand() * 96, 1 + rand() * 4, 1 + rand() * 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

interface Chunk {
  mesh: THREE.Mesh;
  cx: number;
  cz: number;
}

const chunkKey = (x: number, z: number) =>
  `${Math.floor((x + EXTENT) / PITCH)},${Math.floor((z + EXTENT) / PITCH)}`;

export function StreetWear() {
  const tier = useSettings((s) => s.quality.tier);
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy());

  const materials = useMemo(() => {
    const atlas = makeDecalAtlas(Math.min(maxAniso, 8));
    const wear = makeWearTexture();
    const grate = makeGrateTexture();
    grate.anisotropy = Math.min(maxAniso, 4);
    return {
      decal: new THREE.MeshStandardMaterial({
        map: atlas,
        transparent: true,
        depthWrite: false,
        roughness: 0.9,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
      red: new THREE.MeshStandardMaterial({
        color: '#a8352c',
        roughness: 0.85,
        metalness: 0,
        alphaMap: wear,
        alphaTest: 0.32,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      inlet: new THREE.MeshStandardMaterial({
        color: '#0d0d0d',
        roughness: 1,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      grate: new THREE.MeshStandardMaterial({
        map: grate,
        roughness: 0.65,
        metalness: 0.55,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
    };
  }, [maxAniso]);
  useEffect(
    () => () => {
      for (const m of Object.values(materials)) {
        m.map?.dispose();
        m.alphaMap?.dispose();
        m.dispose();
      }
    },
    [materials],
  );

  const { chunks, curbs } = useMemo(() => {
    const byChunk = new Map<string, QuadBuilder>();
    for (const d of [...roadDecals(), ...sidewalkDecals()]) {
      const key = chunkKey(d.x, d.z);
      let q = byChunk.get(key);
      if (!q) byChunk.set(key, (q = new QuadBuilder()));
      addDecal(q, d);
    }
    const chunks: Chunk[] = [...byChunk].map(([key, q]) => {
      const [i, j] = key.split(',').map(Number) as [number, number];
      const mesh = new THREE.Mesh(q.build(), materials.decal);
      mesh.receiveShadow = true;
      // Draw after opaque ground, before other transparents.
      mesh.renderOrder = -1;
      return { mesh, cx: -EXTENT + (i + 0.5) * PITCH, cz: -EXTENT + (j + 0.5) * PITCH };
    });

    const red = new QuadBuilder();
    for (const r of redCurbRuns()) addCurbRun(red, r, 0.155, 0.0, 0.16);
    const inlets = new QuadBuilder();
    const grates = new QuadBuilder();
    for (const r of drainRuns()) {
      addCurbRun(inlets, r, 0.12, 0.035, 0);
      addGrate(grates, r);
    }
    const curbs = [
      new THREE.Mesh(red.build(), materials.red),
      new THREE.Mesh(inlets.build(), materials.inlet),
      new THREE.Mesh(grates.build(), materials.grate),
    ];
    for (const m of curbs) m.receiveShadow = true;
    return { chunks, curbs };
  }, [materials]);
  useEffect(
    () => () => {
      for (const c of chunks) c.mesh.geometry.dispose();
      for (const m of curbs) m.geometry.dispose();
    },
    [chunks, curbs],
  );

  const last = useRef(-1);
  useFrame(({ camera, clock }) => {
    if (clock.elapsedTime - last.current < 0.25) return;
    last.current = clock.elapsedTime;
    const reach = STYLE.decals.visibleDistance[tier] + PITCH * 0.71;
    for (const c of chunks) {
      c.mesh.visible = Math.hypot(c.cx - camera.position.x, c.cz - camera.position.z) < reach;
    }
  });

  return (
    <group>
      {chunks.map((c, i) => (
        <primitive key={i} object={c.mesh} />
      ))}
      {curbs.map((m, i) => (
        <primitive key={`c${i}`} object={m} />
      ))}
    </group>
  );
}
