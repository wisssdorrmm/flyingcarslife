/**
 * Buildings from OSM footprints, extruded to their real heights (SF's height import covers most),
 * styled by use and location: pastel Victorians with bay windows and cornices, shops with awnings,
 * stucco apartments, glass towers and pier warehouses. Facade detail is drawn by the shader.
 */
import { FACADE } from '../../src/game/city/format';
import {
  area,
  centroid,
  pointInRing,
  rng,
  signedArea,
  triangulate,
  type Poly,
  type Pt,
  type Ring,
  type SegmentIndex,
} from './geom';
import type { Height } from './ground';
import { MeshBuilder } from './mesh';
import { areas, parseMeters, type Osm, type Tags } from './parse';
import type { Road } from './roads';

const hex = (h: string): number[] => {
  const n = Number.parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const PALETTE = {
  victorian: [
    '#a9dcc0',
    '#f4c4a1',
    '#cbbbe6',
    '#f3e09a',
    '#b2d4ee',
    '#f3efe6',
    '#f0bfcb',
    '#cadcae',
    '#9fd3d6',
    '#f6d6b0',
  ].map(hex),
  apartment: ['#ebe1cd', '#dcc8a6', '#efeee9', '#d2d5d6', '#d9a98f', '#e6d3b7', '#c9c1b2'].map(hex),
  shop: [
    '#ead8b9',
    '#b9674e',
    '#9fc7c4',
    '#efe9df',
    '#d8b48c',
    '#c7d6b5',
    '#e9c9a0',
    '#8fa8bd',
  ].map(hex),
  tower: ['#6f8fa9', '#7aa3ad', '#8a959e', '#5f7f99', '#9fb2bd'].map(hex),
  warehouse: ['#c9c0ae', '#a9b3b8', '#d6cdb9', '#b8ad97'].map(hex),
  trim: ['#f7f4ec', '#f2ead8', '#ffffff', '#5b6b73', '#7a5a48'].map(hex),
  awning: [
    '#b8312f',
    '#1f6e4a',
    '#1f3f6e',
    '#7a1f3a',
    '#1d7a7a',
    '#d0702a',
    '#2b2b2b',
    '#c9a227',
  ].map(hex),
  roof: ['#77777a', '#838383', '#6d6e70', '#8c8a85', '#5f6062'].map(hex),
};

/** Streets lined with shops (ground-floor retail almost everywhere). */
const COMMERCIAL =
  /^(Columbus Avenue|Grant Avenue|Stockton Street|Jefferson Street|Beach Street|Broadway|Powell Street|The Embarcadero|Union Street|Green Street|Taylor Street)$/;

type Style = 'victorian' | 'shop' | 'tower' | 'apartment' | 'warehouse';

const DEFAULT_HEIGHT: Record<string, number> = {
  house: 9,
  detached: 9,
  residential: 11,
  apartments: 14,
  commercial: 12,
  retail: 8,
  office: 16,
  industrial: 9,
  warehouse: 10,
  garage: 3.5,
  garages: 3.5,
  shed: 3,
  church: 16,
  school: 10,
  hotel: 18,
  yes: 10,
};

function heightOf(t: Tags): number {
  const h = parseMeters(t.height) ?? parseMeters(t['building:height']);
  if (h) return h;
  const levels = Number.parseFloat(t['building:levels'] ?? '');
  if (Number.isFinite(levels) && levels > 0) return levels * 3.3 + 1;
  return DEFAULT_HEIGHT[t.building ?? 'yes'] ?? 10;
}

/** Removes near-duplicate and collinear points. */
function clean(r: Ring): Ring {
  const out: Ring = [];
  for (const p of r) {
    const q = out.at(-1);
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.25) out.push(p);
  }
  const first = out[0];
  const last = out.at(-1);
  if (first && last && out.length > 1 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.25)
    out.pop();
  return out;
}

export interface BuildingInput {
  osm: Osm;
  height: Height;
  terrain: Height;
  roads: SegmentIndex<Road>;
}

export interface Building {
  id: number;
  /** OSM name, or the street address when there's no name. */
  name: string;
  poly: Poly;
  c: Pt;
  style: Style;
  height: number;
}

export function collectBuildings({ osm, height, terrain, roads }: BuildingInput): Building[] {
  const out: Building[] = [];
  for (const { poly, tags, id } of areas(
    osm,
    (t) => !!t.building && t.building !== 'roof' && !t['building:part'],
  )) {
    const p: Poly = {
      outer: clean(poly.outer),
      holes: poly.holes.map(clean).filter((h) => h.length >= 3),
    };
    if (p.outer.length < 3) continue;
    const a = area(p);
    if (a < 8) continue;
    const h = Math.min(Math.max(heightOf(tags), 3), 260);
    const c = centroid(p.outer);
    const rand = rng(id);
    const onPier = height(c[0], c[1]) - terrain(c[0], c[1]) > 1;
    const near = roads.nearest(c, 40);
    const mainStreet = near && COMMERCIAL.test(near.data.name);
    let style: Style;
    if (h >= 45) style = 'tower';
    else if (
      /industrial|warehouse|hangar/.test(tags.building ?? '') ||
      onPier ||
      (a > 2500 && h < 18)
    )
      style = 'warehouse';
    else if (/retail|commercial/.test(tags.building ?? '') || tags.shop || (mainStreet && h <= 30))
      style = 'shop';
    else if (
      near &&
      near.data.cls !== 'residential' &&
      near.data.cls !== 'service' &&
      h <= 25 &&
      rand() < 0.45
    )
      style = 'shop';
    else if (h <= 15 && a < 450) style = 'victorian';
    else style = 'apartment';
    const name =
      tags.name ?? (tags['addr:housenumber'] && tags['addr:street'] ? `${tags['addr:housenumber']} ${tags['addr:street']}` : '');
    out.push({ id, name, poly: p, c, style, height: h });
  }
  return out;
}

const pick = <T>(list: T[], r: () => number): T => list[Math.floor(r() * list.length)]!;

export function buildBuildings(
  list: Building[],
  { height, roads }: Omit<BuildingInput, 'osm'>,
): MeshBuilder {
  const m = new MeshBuilder();
  for (const b of list) {
    const rand = rng(b.id * 7 + 1);
    const paint = pick(PALETTE[b.style], rand);
    const trim =
      b.style === 'victorian' ? pick(PALETTE.trim.slice(0, 3), rand) : pick(PALETTE.trim, rand);
    const awning = pick(PALETTE.awning, rand);
    const roofColor = pick(PALETTE.roof, rand);
    const ring = b.poly.outer;
    const gMin = Math.min(...ring.map(([x, z]) => height(x, z)));
    const base = gMin - 1.5;
    const top = height(b.c[0], b.c[1]) + b.height;
    const v = (y: number) => y - gMin;
    const wallStyle = FACADE[b.style];

    // Walls (outer ring and courtyards), facing away from the building.
    let u = 0;
    for (const r of [ring, ...b.poly.holes]) {
      // OSM rings have any winding: material is inside the outer ring and outside holes.
      const side = (signedArea(r) > 0 ? 1 : -1) * (r === ring ? 1 : -1);
      for (let i = 0; i < r.length; i++) {
        const a = r[i]!;
        const c = r[(i + 1) % r.length]!;
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (len < 0.05) continue;
        const dir: Pt = [(c[0] - a[0]) / len, (c[1] - a[1]) / len];
        // Outward normal: material is on the (−dz, dx) side when side > 0.
        const out: Pt = side > 0 ? [dir[1], -dir[0]] : [-dir[1], dir[0]];
        const street = r === ring && len >= 3 ? streetFacing(a, c, out, roads) : null;
        const style =
          b.style === 'tower' || b.style === 'warehouse'
            ? wallStyle
            : street
              ? wallStyle
              : FACADE.apartment;
        quadWall(m, a, c, base, top, u, len, v, paint, style, side < 0);
        if (street && (b.style === 'victorian' || b.style === 'shop')) {
          cornice(m, a, c, out, top, trim, v);
        }
        if (street && b.style === 'victorian' && len >= 4.5 && b.height >= 7) {
          const n = Math.max(1, Math.floor(len / 6));
          for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n;
            const center: Pt = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];
            const y0 = Math.max(gMin, height(center[0], center[1])) + 2.9;
            const y1 = top - 1.0;
            if (y1 - y0 > 2.4) bayWindow(m, center, dir, out, y0, y1, v, paint, trim);
          }
        }
        if (street && b.style === 'shop' && len >= 3.5) {
          const n = Math.max(1, Math.floor(len / 5.5));
          for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n;
            const center: Pt = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];
            const g = Math.max(gMin, height(center[0], center[1]));
            const w = Math.min(4.2, len / n - 0.8);
            if (w > 1.5 && g + 3.4 < top - 1)
              awningAt(
                m,
                center,
                dir,
                out,
                w,
                g,
                rand() < 0.5 ? awning : pick(PALETTE.awning, rand),
                v,
              );
          }
        }
        u += len;
      }
    }

    // Flat roof, plus a few rooftop boxes on bigger roofs.
    roof(m, b.poly, top, roofColor);
    if (area(b.poly) > 140 && b.style !== 'victorian') {
      const boxes = 1 + Math.floor(rand() * 3);
      const xs = ring.map((p) => p[0]);
      const zs = ring.map((p) => p[1]);
      for (let k = 0; k < boxes * 4 && k < 12; k++) {
        const p: Pt = [
          Math.min(...xs) + rand() * (Math.max(...xs) - Math.min(...xs)),
          Math.min(...zs) + rand() * (Math.max(...zs) - Math.min(...zs)),
        ];
        const s = 1.2 + rand() * 1.8;
        const box: Ring = [
          [p[0] - s, p[1] - s],
          [p[0] + s, p[1] - s],
          [p[0] + s, p[1] + s],
          [p[0] - s, p[1] + s],
        ];
        if (!box.every((q) => pointInRing(q, ring))) continue;
        const hb = 1.2 + rand() * 2;
        boxOn(m, box, top, top + hb, pick(PALETTE.roof, rand), v);
      }
    }
  }
  return m;
}

function streetFacing(a: Pt, c: Pt, out: Pt, roads: SegmentIndex<Road>): Road | null {
  const mid: Pt = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
  const probe: Pt = [mid[0] + out[0] * 1.5, mid[1] + out[1] * 1.5];
  const hit = roads.nearest(probe, 26);
  if (!hit) return null;
  const gap = hit.d - hit.data.width / 2;
  if (gap > 9) return null;
  const tx = hit.q[0] - mid[0];
  const tz = hit.q[1] - mid[1];
  const l = Math.hypot(tx, tz) || 1;
  return (tx * out[0] + tz * out[1]) / l > 0.6 ? hit.data : null;
}

function quadWall(
  m: MeshBuilder,
  a: Pt,
  c: Pt,
  y0: number,
  y1: number,
  u0: number,
  len: number,
  v: (y: number) => number,
  color: number[],
  style: number,
  flip: boolean,
): void {
  const b0 = m.vert(a[0], y0, a[1], [u0, v(y0)], color, style);
  const b1 = m.vert(c[0], y0, c[1], [u0 + len, v(y0)], color, style);
  const t1 = m.vert(c[0], y1, c[1], [u0 + len, v(y1)], color, style);
  const t0 = m.vert(a[0], y1, a[1], [u0, v(y1)], color, style);
  // quad(b0, b1, t1, t0) faces (−dz, dx); we want the opposite unless the ring is reversed.
  if (flip) m.quad(b0, b1, t1, t0);
  else m.quad(b1, b0, t0, t1);
}

/** Vertical face from p to q facing `out` (any orientation), with per-face UVs. */
function face(
  m: MeshBuilder,
  p: Pt,
  q: Pt,
  out: Pt,
  y0: number,
  y1: number,
  uv: (i: 0 | 1, y: number) => [number, number],
  color: number[],
  style: number,
): void {
  const b0 = m.vert(p[0], y0, p[1], uv(0, y0), color, style);
  const b1 = m.vert(q[0], y0, q[1], uv(1, y0), color, style);
  const t1 = m.vert(q[0], y1, q[1], uv(1, y1), color, style);
  const t0 = m.vert(p[0], y1, p[1], uv(0, y1), color, style);
  // quad(b0, b1, t1, t0) faces (−dz, dx) of p→q.
  const dx = q[0] - p[0];
  const dz = q[1] - p[1];
  if (-dz * out[0] + dx * out[1] >= 0) m.quad(b0, b1, t1, t0);
  else m.quad(b1, b0, t0, t1);
}

/** Horizontal polygon (convex, ring order any) facing up or down. */
function cap(
  m: MeshBuilder,
  r: Ring,
  y: number,
  up: boolean,
  color: number[],
  style: number,
  v: (y: number) => number,
): void {
  const ids = r.map(([x, z]) => m.vert(x, y, z, [0, v(y)], color, style));
  for (let i = 1; i + 1 < r.length; i++) {
    const a = r[0]!;
    const b = r[i]!;
    const c = r[i + 1]!;
    const ny = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
    if (ny > 0 === up) m.tri(ids[0]!, ids[i]!, ids[i + 1]!);
    else m.tri(ids[0]!, ids[i + 1]!, ids[i]!);
  }
}

function cornice(
  m: MeshBuilder,
  a: Pt,
  c: Pt,
  out: Pt,
  top: number,
  color: number[],
  v: (y: number) => number,
): void {
  const d = 0.35;
  const y0 = top - 0.55;
  const y1 = top + 0.12;
  const pa: Pt = [a[0] + out[0] * d, a[1] + out[1] * d];
  const pc: Pt = [c[0] + out[0] * d, c[1] + out[1] * d];
  const uv = (): [number, number] => [0, 0];
  face(m, pa, pc, out, y0, y1, uv, color, FACADE.trim);
  cap(m, [a, c, pc, pa], y0, false, color, FACADE.trim, v);
  cap(m, [a, c, pc, pa], y1, true, color, FACADE.trim, v);
}

function bayWindow(
  m: MeshBuilder,
  center: Pt,
  t: Pt,
  out: Pt,
  y0: number,
  y1: number,
  v: (y: number) => number,
  paint: number[],
  trim: number[],
): void {
  const at = (s: number, o: number): Pt => [
    center[0] + t[0] * s + out[0] * o,
    center[1] + t[1] * s + out[1] * o,
  ];
  const wl = at(-1.4, 0);
  const fl = at(-0.85, 0.75);
  const fr = at(0.85, 0.75);
  const wr = at(1.4, 0);
  const uvFace = (i: 0 | 1, y: number): [number, number] => [i, v(y)];
  for (const [p, q] of [
    [wl, fl],
    [fl, fr],
    [fr, wr],
  ] as const) {
    const mid: Pt = [(p[0] + q[0]) / 2 - center[0], (p[1] + q[1]) / 2 - center[1]];
    const l = Math.hypot(mid[0], mid[1]) || 1;
    face(m, p, q, [mid[0] / l, mid[1] / l], y0, y1, uvFace, paint, FACADE.bay);
  }
  cap(m, [wl, fl, fr, wr], y0, false, trim, FACADE.trim, v);
  cap(m, [wl, fl, fr, wr], y1, true, trim, FACADE.trim, v);
}

function awningAt(
  m: MeshBuilder,
  center: Pt,
  t: Pt,
  out: Pt,
  w: number,
  g: number,
  color: number[],
  v: (y: number) => number,
): void {
  const at = (s: number, o: number): Pt => [
    center[0] + t[0] * s + out[0] * o,
    center[1] + t[1] * s + out[1] * o,
  ];
  const yIn = g + 3.4;
  const yOut = g + 2.8;
  const depth = 1.3;
  const wl = at(-w / 2, 0.02);
  const wr = at(w / 2, 0.02);
  const fl = at(-w / 2, depth);
  const fr = at(w / 2, depth);
  // Sloped canopy, both sides.
  const ids = [
    m.vert(wl[0], yIn, wl[1], [0, v(yIn)], color, FACADE.awning),
    m.vert(wr[0], yIn, wr[1], [w, v(yIn)], color, FACADE.awning),
    m.vert(fr[0], yOut, fr[1], [w, v(yOut)], color, FACADE.awning),
    m.vert(fl[0], yOut, fl[1], [0, v(yOut)], color, FACADE.awning),
  ];
  const [i0, i1, i2, i3] = ids as [number, number, number, number];
  m.quad(i0, i1, i2, i3);
  m.quad(i0, i3, i2, i1);
  // Valance.
  face(m, fl, fr, out, yOut - 0.3, yOut, (i, y) => [i * w, v(y)], color, FACADE.awning);
  face(
    m,
    fr,
    fl,
    [-out[0], -out[1]],
    yOut - 0.3,
    yOut,
    (i, y) => [i * w, v(y)],
    color,
    FACADE.awning,
  );
}

function roof(m: MeshBuilder, p: Poly, y: number, color: number[]): void {
  const { verts, tris } = triangulate(p);
  const ids = verts.map(([x, z]) => m.vert(x, y, z, [0, 0], color, FACADE.plain));
  for (let i = 0; i < tris.length; i += 3) {
    const a = verts[tris[i]!]!;
    const b = verts[tris[i + 1]!]!;
    const c = verts[tris[i + 2]!]!;
    const ny = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
    if (ny > 0) m.tri(ids[tris[i]!]!, ids[tris[i + 1]!]!, ids[tris[i + 2]!]!);
    else m.tri(ids[tris[i]!]!, ids[tris[i + 2]!]!, ids[tris[i + 1]!]!);
  }
}

function boxOn(
  m: MeshBuilder,
  r: Ring,
  y0: number,
  y1: number,
  color: number[],
  v: (y: number) => number,
): void {
  const c = centroid(r);
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % r.length]!;
    const mid: Pt = [(p[0] + q[0]) / 2 - c[0], (p[1] + q[1]) / 2 - c[1]];
    const l = Math.hypot(mid[0], mid[1]) || 1;
    face(m, p, q, [mid[0] / l, mid[1] / l], y0, y1, () => [0, 0], color, FACADE.plain);
  }
  cap(m, r, y1, true, color, FACADE.plain, v);
}
