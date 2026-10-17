/**
 * Procedural wear-and-dirt decal atlas (CLAUDE.md §10: "nothing should look clean").
 * One 4×4 canvas atlas, painted once at load, so every road/sidewalk decal in the city shares a
 * single texture and material. Each cell keeps a transparent border so mipmaps don't bleed.
 */
import * as THREE from 'three';
import { range, seeded } from './rand';

export type DecalKind =
  // Road
  | 'crackNet'
  | 'crackLong'
  | 'patch'
  | 'tarSeam'
  | 'oil'
  | 'drips'
  | 'tireMarks'
  | 'bleach'
  // Sidewalk
  | 'stain'
  | 'gum'
  | 'swCrack'
  | 'leaves'
  | 'cup'
  | 'paper'
  | 'butts'
  | 'spill';

const ORDER: DecalKind[] = [
  'crackNet',
  'crackLong',
  'patch',
  'tarSeam',
  'oil',
  'drips',
  'tireMarks',
  'bleach',
  'stain',
  'gum',
  'swCrack',
  'leaves',
  'cup',
  'paper',
  'butts',
  'spill',
];

const SIZE = 1024;
const CELL = 256;
const PAD = 10;

/** UV rectangle [u0, v0, u1, v1] of a decal kind inside the atlas. */
export function decalUv(kind: DecalKind): [number, number, number, number] {
  const i = ORDER.indexOf(kind);
  const col = i % 4;
  const row = Math.floor(i / 4);
  const u0 = (col * CELL + PAD) / SIZE;
  const u1 = ((col + 1) * CELL - PAD) / SIZE;
  // Canvas y grows down; texture v grows up (flipY).
  const v1 = 1 - (row * CELL + PAD) / SIZE;
  const v0 = 1 - ((row + 1) * CELL - PAD) / SIZE;
  return [u0, v0, u1, v1];
}

type Ctx = CanvasRenderingContext2D;
type Rand = () => number;

/** A wandering polyline from (x0,y0) heading `angle`, used for cracks and seams. */
function wander(rand: Rand, x0: number, y0: number, angle: number, steps: number, step: number) {
  const pts: [number, number][] = [[x0, y0]];
  let x = x0;
  let y = y0;
  let a = angle;
  for (let i = 0; i < steps; i++) {
    a += (rand() - 0.5) * 0.9;
    x += Math.cos(a) * step * (0.6 + rand() * 0.8);
    y += Math.sin(a) * step * (0.6 + rand() * 0.8);
    pts.push([x, y]);
  }
  return pts;
}

function stroke(ctx: Ctx, pts: [number, number][], width: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

/** A crack: a dirty halo, then the dark fissure, tapering as it goes. */
function crack(ctx: Ctx, rand: Rand, pts: [number, number][], width: number) {
  stroke(ctx, pts, width * 4, 'rgba(30,26,22,0.13)');
  for (let i = 0; i < pts.length - 1; i++) {
    const w = width * (1 - (i / pts.length) * 0.6) * (0.8 + rand() * 0.4);
    stroke(ctx, [pts[i]!, pts[i + 1]!], w, 'rgba(14,12,11,0.88)');
  }
}

function blob(ctx: Ctx, x: number, y: number, r: number, inner: string, outer: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Each painter draws into a CELL×CELL box at the origin, inside PAD. */
const PAINTERS: Record<DecalKind, (ctx: Ctx, rand: Rand) => void> = {
  crackNet(ctx, rand) {
    const main = wander(rand, 20, 40 + rand() * 170, 0, 14, 17);
    crack(ctx, rand, main, 3.2);
    for (let b = 0; b < 6; b++) {
      const [x, y] = main[2 + Math.floor(rand() * (main.length - 4))]!;
      const a = (rand() < 0.5 ? -1 : 1) * (0.7 + rand() * 0.9);
      crack(ctx, rand, wander(rand, x, y, a, 4 + Math.floor(rand() * 5), 14), 1.8);
    }
  },
  crackLong(ctx, rand) {
    const main = wander(rand, 14, 128, 0, 22, 11.5);
    crack(ctx, rand, main, 2.8);
    for (let b = 0; b < 4; b++) {
      const [x, y] = main[3 + Math.floor(rand() * (main.length - 6))]!;
      crack(ctx, rand, wander(rand, x, y, (rand() - 0.5) * 3, 3, 10), 1.4);
    }
  },
  patch(ctx, rand) {
    // A utility cut: fresher, darker asphalt with a sealed edge.
    const pts: [number, number][] = [
      [PAD + 8 + rand() * 10, PAD + 8 + rand() * 10],
      [CELL - PAD - 8 - rand() * 10, PAD + 8 + rand() * 10],
      [CELL - PAD - 8 - rand() * 10, CELL - PAD - 8 - rand() * 10],
      [PAD + 8 + rand() * 10, CELL - PAD - 8 - rand() * 10],
    ];
    ctx.fillStyle = 'rgba(38,38,40,0.55)';
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 900; i++) {
      const v = 20 + Math.floor(rand() * 60);
      ctx.fillStyle = `rgba(${v},${v},${v},${0.25 + rand() * 0.3})`;
      ctx.fillRect(28 + rand() * 200, 28 + rand() * 200, 1 + rand() * 2.5, 1 + rand() * 2.5);
    }
    stroke(ctx, [...pts, pts[0]!], 4, 'rgba(12,12,12,0.75)');
  },
  tarSeam(ctx, rand) {
    // Crack sealant "tar snake": glossy black, wavy, with blobs where it pooled.
    const pts = wander(rand, 12, 128, 0, 26, 9.4).map(
      ([x, y]) => [x, 128 + (y - 128) * 0.35] as [number, number],
    );
    stroke(ctx, pts, 30, 'rgba(10,10,12,0.8)');
    stroke(ctx, pts, 8, 'rgba(70,72,78,0.3)');
    for (let i = 0; i < 6; i++) {
      const [x, y] = pts[Math.floor(rand() * pts.length)]!;
      blob(ctx, x, y, 16 + rand() * 12, 'rgba(10,10,12,0.8)', 'rgba(10,10,12,0)');
    }
  },
  oil(ctx, rand) {
    for (let i = 0; i < 26; i++) {
      const r = 18 + rand() * 50;
      blob(
        ctx,
        128 + (rand() - 0.5) * 120,
        128 + (rand() - 0.5) * 90,
        r,
        'rgba(8,8,8,0.3)',
        'rgba(8,8,8,0)',
      );
    }
    blob(ctx, 128, 128, 46, 'rgba(6,6,6,0.5)', 'rgba(6,6,6,0)');
  },
  drips(ctx, rand) {
    for (let i = 0; i < 18; i++) {
      const x = 30 + rand() * 196;
      const y = 128 + (rand() - 0.5) * 60;
      blob(ctx, x, y, 5 + rand() * 16, 'rgba(8,8,8,0.55)', 'rgba(8,8,8,0)');
    }
  },
  tireMarks(ctx, rand) {
    // Two rubber streaks, a car's track width apart, with a gentle curve.
    const bend = (rand() - 0.5) * 40;
    for (const lane of [70, 186]) {
      for (let k = 0; k < 14; k++) {
        const off = (rand() - 0.5) * 18;
        ctx.strokeStyle = `rgba(14,14,14,${0.09 + rand() * 0.09})`;
        ctx.lineWidth = 2 + rand() * 4;
        ctx.beginPath();
        const start = 14 + rand() * 40;
        const end = 242 - rand() * 50;
        ctx.moveTo(start, lane + off);
        ctx.quadraticCurveTo(128, lane + off + bend, end, lane + off + bend * 0.3);
        ctx.stroke();
      }
    }
  },
  bleach(ctx, rand) {
    for (let i = 0; i < 14; i++) {
      blob(
        ctx,
        128 + (rand() - 0.5) * 130,
        128 + (rand() - 0.5) * 130,
        30 + rand() * 60,
        'rgba(200,196,188,0.07)',
        'rgba(200,196,188,0)',
      );
    }
  },
  stain(ctx, rand) {
    const hue = rand() < 0.5 ? '58,48,38' : '40,40,38';
    for (let i = 0; i < 18; i++) {
      blob(
        ctx,
        128 + (rand() - 0.5) * 120,
        128 + (rand() - 0.5) * 120,
        14 + rand() * 50,
        `rgba(${hue},0.3)`,
        `rgba(${hue},0)`,
      );
    }
  },
  gum(ctx, rand) {
    for (let i = 0; i < 70; i++) {
      const old = rand() < 0.6;
      const v = old ? 70 + Math.floor(rand() * 60) : 25 + Math.floor(rand() * 25);
      ctx.fillStyle = `rgba(${v},${v},${v - 4},${0.6 + rand() * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(
        20 + rand() * 216,
        20 + rand() * 216,
        2 + rand() * 4,
        2 + rand() * 3.5,
        rand() * 3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  },
  swCrack(ctx, rand) {
    const main = wander(rand, 16, 30 + rand() * 60, 0.6 + rand() * 0.3, 15, 14);
    crack(ctx, rand, main, 2);
    const [x, y] = main[Math.floor(main.length / 2)]!;
    crack(ctx, rand, wander(rand, x, y, -0.6, 6, 12), 1.3);
  },
  leaves(ctx, rand) {
    const colors = ['#8a6a3a', '#a07c42', '#6f5a33', '#9b8a4a', '#5d4a2c', '#b39050'];
    for (let i = 0; i < 16; i++) {
      const x = 30 + rand() * 196;
      const y = 30 + rand() * 196;
      const a = rand() * Math.PI;
      const L = 12 + rand() * 14;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(2, 2, L, L * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors[Math.floor(rand() * colors.length)]!;
      ctx.beginPath();
      ctx.ellipse(0, 0, L, L * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(50,35,20,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-L, 0);
      ctx.lineTo(L, 0);
      ctx.stroke();
      ctx.restore();
    }
  },
  cup(ctx) {
    // A paper cup lying on its side, seen from above, with its soft contact shadow.
    blob(ctx, 132, 138, 95, 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0)');
    const body = ctx.createLinearGradient(0, 70, 0, 186);
    body.addColorStop(0, '#d9d7d2');
    body.addColorStop(0.45, '#fbfaf7');
    body.addColorStop(1, '#bdbab4');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(48, 84);
    ctx.lineTo(206, 66);
    ctx.lineTo(206, 190);
    ctx.lineTo(48, 172);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(176,44,38,0.85)';
    ctx.fillRect(110, 76, 28, 104);
    ctx.fillStyle = '#e8e6e1';
    ctx.beginPath();
    ctx.ellipse(206, 128, 14, 62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
  },
  paper(ctx, rand) {
    blob(ctx, 130, 134, 105, 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0)');
    // Crumpled sheet: a jagged outline filled with faceted light/shade.
    const pts: [number, number][] = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const r = 70 + rand() * 40;
      pts.push([128 + Math.cos(a) * r, 128 + Math.sin(a) * r * 0.85]);
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const q = pts[(i + 1) % pts.length]!;
      const v = 200 + Math.floor(rand() * 50);
      ctx.fillStyle = `rgb(${v},${v},${v - 6})`;
      ctx.beginPath();
      ctx.moveTo(128 + (rand() - 0.5) * 30, 128 + (rand() - 0.5) * 30);
      ctx.lineTo(p[0], p[1]);
      ctx.lineTo(q[0], q[1]);
      ctx.closePath();
      ctx.fill();
    }
  },
  butts(ctx, rand) {
    for (let i = 0; i < 9; i++) {
      const x = 40 + rand() * 176;
      const y = 40 + rand() * 176;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rand() * Math.PI);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-15, -2, 32, 9);
      ctx.fillStyle = '#c8894a';
      ctx.fillRect(-16, -4, 12, 8);
      ctx.fillStyle = '#ece8df';
      ctx.fillRect(-4, -4, 16, 8);
      ctx.fillStyle = '#3a3633';
      ctx.fillRect(11, -4, 3, 8);
      ctx.restore();
    }
  },
  spill(ctx, rand) {
    ctx.fillStyle = 'rgba(34,30,26,0.28)';
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = 60 + rand() * 45;
      const x = 128 + Math.cos(a) * r;
      const y = 128 + Math.sin(a) * r * 0.75;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.fill();
    for (let i = 0; i < 6; i++) {
      blob(
        ctx,
        128 + (rand() - 0.5) * 220,
        128 + (rand() - 0.5) * 200,
        6 + rand() * 12,
        'rgba(34,30,26,0.3)',
        'rgba(34,30,26,0)',
      );
    }
  },
};

/** Paints the atlas. Call once; the texture is shared by every decal mesh. */
export function makeDecalAtlas(anisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const rand = seeded(20261017);
  ORDER.forEach((kind, i) => {
    ctx.save();
    ctx.translate((i % 4) * CELL, Math.floor(i / 4) * CELL);
    ctx.beginPath();
    ctx.rect(PAD, PAD, CELL - PAD * 2, CELL - PAD * 2);
    ctx.clip();
    PAINTERS[kind](ctx, rand);
    ctx.restore();
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

/** Real-world size range (length × width, meters) for each decal kind. */
export const DECAL_SIZE: Record<DecalKind, { length: [number, number]; aspect: number }> = {
  crackNet: { length: [1.6, 3.4], aspect: 1 },
  crackLong: { length: [3, 7], aspect: 0.22 },
  patch: { length: [1.6, 4.5], aspect: 0.6 },
  tarSeam: { length: [3, 9], aspect: 0.1 },
  oil: { length: [0.9, 1.9], aspect: 0.8 },
  drips: { length: [0.8, 1.6], aspect: 0.5 },
  tireMarks: { length: [5, 11], aspect: 0.32 },
  bleach: { length: [2, 4.5], aspect: 1 },
  stain: { length: [0.6, 1.6], aspect: 1 },
  gum: { length: [0.8, 1.4], aspect: 1 },
  swCrack: { length: [1, 2.2], aspect: 1 },
  leaves: { length: [0.5, 0.9], aspect: 1 },
  cup: { length: [0.2, 0.24], aspect: 1 },
  paper: { length: [0.24, 0.34], aspect: 1 },
  butts: { length: [0.35, 0.5], aspect: 1 },
  spill: { length: [0.6, 1.3], aspect: 1 },
};

export const decalLength = (rand: Rand, kind: DecalKind) => range(rand, ...DECAL_SIZE[kind].length);

/** Blotchy noise used as an alpha mask so paint looks worn into the asphalt. */
export function makeWearTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  let seed = 1337;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) {
    const r = 1 + rand() * rand() * 9;
    const v = Math.floor(rand() * 120);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.6, 0.6);
  return tex;
}
