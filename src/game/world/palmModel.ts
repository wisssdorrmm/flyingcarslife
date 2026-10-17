/**
 * Procedural palms (CLAUDE.md §10): a tall thin fan palm (avenues) and a short fat date palm
 * (downtown tree pits). Stand-ins until a scanned/authored palm asset is licensed: every part is
 * textured from one painted atlas, so each species is a single instanced draw call.
 *
 * Each vertex carries `sway` = (trunk bend weight, frond flutter weight) for the wind shader.
 */
import * as THREE from 'three';
import { STYLE } from '../config';
import { SHORT_PALM_HEIGHT, TALL_PALM_HEIGHT } from './furnitureLayout';
import { seeded } from '../../lib/rand';

const ATLAS = 1024;

/** Atlas regions in pixels: [x, y, w, h] (canvas space, y down). */
const REGION = {
  tallTrunk: [0, 0, 256, 512],
  shortTrunk: [256, 0, 256, 512],
  skirt: [0, 512, 512, 256],
  fan: [512, 0, 256, 512],
  pinnate: [768, 0, 256, 1024],
  knob: [0, 768, 512, 256],
} as const;
type RegionName = keyof typeof REGION;

/** Maps a 0–1 coordinate inside a region to atlas UV (v up). */
function regionUv(name: RegionName, s: number, t: number): [number, number] {
  const [x, y, w, h] = REGION[name];
  // Keep a 2 px inset so neighbours never bleed in.
  const u = (x + 2 + s * (w - 4)) / ATLAS;
  const v = 1 - (y + 2 + (1 - t) * (h - 4)) / ATLAS;
  return [u, v];
}

// ---------------------------------------------------------------------------
// Atlas painting
// ---------------------------------------------------------------------------

export function makePalmAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const rand = seeded(4242);
  const at = (name: RegionName, draw: (w: number, h: number) => void) => {
    const [x, y, w, h] = REGION[name];
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    draw(w, h);
    ctx.restore();
  };

  // Fan palm trunk: grey-brown with tight growth rings and vertical cracks.
  at('tallTrunk', (w, h) => {
    ctx.fillStyle = '#8a7f72';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3 + rand() * 4) {
      const v = 95 + Math.floor(rand() * 50);
      ctx.fillStyle = `rgba(${v},${v - 8},${v - 18},0.55)`;
      ctx.fillRect(0, y, w, 1 + rand() * 2);
      ctx.fillStyle = 'rgba(40,34,28,0.35)';
      ctx.fillRect(0, y + 2, w, 1);
    }
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(45,38,30,${0.15 + rand() * 0.25})`;
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 10 + rand() * 60);
    }
  });

  // Date palm trunk: diamond pattern of old leaf bases.
  at('shortTrunk', (w, h) => {
    ctx.fillStyle = '#6d5a43';
    ctx.fillRect(0, 0, w, h);
    const cw = 32;
    const ch = 26;
    for (let row = -1; row < h / ch + 1; row++) {
      for (let col = -1; col < w / cw + 1; col++) {
        const cx = col * cw + (row % 2 ? cw / 2 : 0);
        const cy = row * ch;
        const v = 110 + Math.floor(rand() * 40);
        ctx.fillStyle = `rgb(${v},${v - 18},${v - 42})`;
        ctx.beginPath();
        ctx.moveTo(cx, cy - ch * 0.55);
        ctx.lineTo(cx + cw * 0.48, cy);
        ctx.lineTo(cx, cy + ch * 0.55);
        ctx.lineTo(cx - cw * 0.48, cy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(35,26,18,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  });

  // Dead-frond skirt under the fan palm crown: hanging straw, ragged at the bottom.
  at('skirt', (w, h) => {
    for (let i = 0; i < 520; i++) {
      const x = rand() * w;
      const len = h * (0.55 + rand() * 0.45);
      const v = 100 + Math.floor(rand() * 70);
      ctx.strokeStyle = `rgba(${v + 30},${v + 10},${v - 25},0.95)`;
      ctx.lineWidth = 2 + rand() * 4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (rand() - 0.5) * 10, len);
      ctx.stroke();
    }
  });

  // Fan palm frond: a petiole into a round fan of stiff segments.
  at('fan', (w, h) => {
    const px = w / 2;
    const hub = h * 0.45;
    ctx.strokeStyle = '#6b6a3c';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(px, h);
    ctx.lineTo(px, hub);
    ctx.stroke();
    for (let i = 0; i < 46; i++) {
      const a = -Math.PI / 2 + (i / 45 - 0.5) * Math.PI * 1.55;
      const r = h * (0.4 + rand() * 0.06);
      const g = 95 + Math.floor(rand() * 45);
      const tipBrown = rand() < 0.2;
      ctx.strokeStyle = tipBrown
        ? `rgb(${g + 40},${g + 20},60)`
        : `rgb(${g - 30},${g + 10},${g - 55})`;
      ctx.lineWidth = 6 + rand() * 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px, hub);
      ctx.lineTo(px + Math.cos(a) * r, hub + Math.sin(a) * r);
      ctx.stroke();
    }
  });

  // Pinnate (feather) frond for the date palm: rachis with angled leaflets.
  at('pinnate', (w, h) => {
    const cx = w / 2;
    ctx.strokeStyle = '#8b8a4c';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx, h);
    ctx.lineTo(cx, 6);
    ctx.stroke();
    for (let y = h - 70; y > 10; y -= 7) {
      const t = 1 - y / h;
      const len =
        (w / 2 - 6) *
        Math.sin(Math.min(1, (1 - t) * 1.25) * Math.PI * 0.5) *
        (0.85 + rand() * 0.15);
      const g = 90 + Math.floor(rand() * 40);
      ctx.strokeStyle = `rgb(${g - 25},${g + 15},${g - 55})`;
      ctx.lineWidth = 3.5;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(cx + side * len, y - len * 0.75);
        ctx.stroke();
      }
    }
  });

  // Date palm crown knob: tightly packed leaf bases, green-brown.
  at('knob', (w, h) => {
    ctx.fillStyle = '#5f5a33';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      const v = 80 + Math.floor(rand() * 60);
      ctx.fillStyle = `rgba(${v},${v - 5},${v - 45},0.8)`;
      ctx.beginPath();
      ctx.ellipse(
        rand() * w,
        rand() * h,
        6 + rand() * 6,
        3 + rand() * 3,
        rand() * 0.5,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

class Builder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  sway: number[] = [];
  idx: number[] = [];

  vert(p: THREE.Vector3, n: THREE.Vector3, uv: [number, number], sway: [number, number]): number {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(...uv);
    this.sway.push(...sway);
    return this.pos.length / 3 - 1;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(this.sway, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Trunk bend weight at height y of a palm of height h (matches the wind shader). */
const bend = (y: number, h: number) => (y / h) ** 2;

/**
 * A tapered, gently curving tube. `center(t)` and `radius(t)` describe the axis for t = 0..1;
 * `uvTop` lets a short section use only part of its atlas region.
 */
function tube(
  b: Builder,
  region: RegionName,
  segments: number,
  rings: number,
  center: (t: number) => THREE.Vector3,
  radius: (t: number) => number,
  height: number,
  uvTop = 1,
) {
  const base = b.pos.length / 3;
  const n = new THREE.Vector3();
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const c = center(t);
    const r = radius(t);
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      n.set(Math.cos(a), 0, Math.sin(a));
      const p = c.clone().addScaledVector(n, r);
      b.vert(p, n, regionUv(region, j / segments, t * uvTop), [bend(p.y, height), 0]);
    }
  }
  const row = segments + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = base + i * row + j;
      b.idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
}

/**
 * One frond: a strip that leaves the crown at `elevation`, arcs and droops.
 * The blade lies roughly flat (its width runs sideways), so it reads from below and above.
 */
function frond(
  b: Builder,
  region: RegionName,
  origin: THREE.Vector3,
  azimuth: number,
  elevation: number,
  length: number,
  width: number,
  droop: number,
  height: number,
  steps: number,
) {
  const dir = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const up = new THREE.Vector3(0, 1, 0);
  const base = b.pos.length / 3;
  const normal = new THREE.Vector3();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const along = length * t;
    const p = origin
      .clone()
      .addScaledVector(dir, along * Math.cos(elevation))
      .addScaledVector(up, along * Math.sin(elevation) - droop * length * t * t);
    // Blade normal: mostly up, tilted toward the droop.
    normal
      .copy(up)
      .addScaledVector(dir, 0.3 + t * 0.6 * droop)
      .normalize();
    const flutter = t * t;
    const sway: [number, number] = [bend(Math.min(p.y, height), height), flutter];
    // Slight V (keel) so the blade isn't paper flat.
    const keel = width * 0.12;
    b.vert(
      p
        .clone()
        .addScaledVector(side, -width / 2)
        .addScaledVector(up, keel),
      normal,
      regionUv(region, 0, t),
      sway,
    );
    b.vert(
      p
        .clone()
        .addScaledVector(side, width / 2)
        .addScaledVector(up, keel),
      normal,
      regionUv(region, 1, t),
      sway,
    );
  }
  for (let i = 0; i < steps; i++) {
    const a = base + i * 2;
    // Front face up (lit side seen from above; DoubleSide flips it from below).
    b.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
}

/** Tall, thin fan palm (Washingtonia-like). Nominal height 16 m; instances scale it. */
export function tallPalmGeometry(): THREE.BufferGeometry {
  const H = TALL_PALM_HEIGHT;
  const lean = 0.6;
  const b = new Builder();
  const rand = seeded(11);
  const axis = (y: number) => new THREE.Vector3(lean * (y / H) ** 2, y, 0);
  tube(
    b,
    'tallTrunk',
    7,
    10,
    (t) => axis(t * (H - 1.6)),
    // Flared foot, slim top.
    (t) => 0.17 + 0.07 * (1 - t) + 0.12 * Math.max(0, 1 - t * 12),
    H,
  );
  // Shaggy dead-frond skirt just under the crown.
  tube(
    b,
    'skirt',
    8,
    2,
    (t) => axis(H - 1.6 + t * 1.5),
    (t) => 0.62 - 0.32 * t,
    H,
  );
  const crown = axis(H - 0.15);
  for (let i = 0; i < 24; i++) {
    const az = (i / 24) * Math.PI * 2 + rand() * 0.3;
    const el = -0.1 + rand() * 1.1;
    frond(
      b,
      'fan',
      crown,
      az,
      el,
      2.6 + rand() * 0.6,
      1.7 + rand() * 0.3,
      0.35 + rand() * 0.3,
      H,
      4,
    );
  }
  return b.build();
}

/** Short, fat date palm (Phoenix-like). Nominal height 5.5 m to the crown. */
export function shortPalmGeometry(): THREE.BufferGeometry {
  const H = SHORT_PALM_HEIGHT;
  const b = new Builder();
  const rand = seeded(23);
  const axis = (y: number) => new THREE.Vector3(0.12 * (y / H) ** 2, y, 0);
  tube(
    b,
    'shortTrunk',
    10,
    5,
    (t) => axis(t * H),
    (t) => 0.42 - 0.04 * t + 0.1 * Math.max(0, 1 - t * 8),
    H,
  );
  // Pineapple-like knob where the fronds spring from.
  tube(
    b,
    'knob',
    10,
    3,
    (t) => axis(H + t * 0.9),
    (t) => 0.52 + 0.18 * Math.sin(t * Math.PI) - 0.25 * t,
    H,
    1,
  );
  const crown = axis(H + 0.75);
  for (let i = 0; i < 34; i++) {
    const az = i * 2.39996 + rand() * 0.2; // golden angle spiral
    const el = -0.15 + rand() * 1.05;
    frond(b, 'pinnate', crown, az, el, 4 + rand() * 0.9, 1.05, 0.55 + rand() * 0.25, H, 5);
  }
  return b.build();
}

// ---------------------------------------------------------------------------
// Wind shader
// ---------------------------------------------------------------------------

export const palmUniforms = {
  uTime: { value: 0 },
  uAmp: { value: STYLE.palms.swayAmplitude },
  uSpeed: { value: STYLE.palms.swaySpeed },
};

/** Adds wind sway to a (standard or depth) material, sharing the same uniforms. */
export function addPalmWind(mat: THREE.Material): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, palmUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        attribute vec2 sway;
        uniform float uTime;
        uniform float uAmp;
        uniform float uSpeed;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec2 ip = instanceMatrix[3].xz;
          #else
            vec2 ip = vec2(0.0);
          #endif
          float ph = ip.x * 0.13 + ip.y * 0.17;
          float gust = 0.65 + 0.35 * sin(uTime * 0.21 + ph * 0.5);
          float s = sin(uTime * uSpeed + ph) * gust;
          float s2 = sin(uTime * uSpeed * 1.63 + ph * 1.3);
          transformed.x += uAmp * sway.x * s;
          transformed.z += uAmp * 0.35 * sway.x * s2;
          float f = sin(uTime * 2.7 + transformed.x * 1.7 + transformed.z * 2.1 + ph);
          transformed.y += 0.09 * sway.y * f;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'palm-wind';
}
