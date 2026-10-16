import { useMemo } from 'react';
import * as THREE from 'three';
import {
  BLOCKS,
  CORNER_RADIUS,
  CROSSWALK_WIDTH,
  CURB_HEIGHT,
  EXTENT,
  halfWidth,
  ROADS,
  roadsAlong,
  STOP_LINE_GAP,
  type Block,
  type Road,
} from './cityPlan';
import { usePbrMaterial } from './materials';

/** Half-size of the ground plane under the whole city. */
const GROUND = 1200;

/** Flat ground quad with UVs in meters, so tiled textures keep real-world scale. */
function groundQuad(x0: number, x1: number, z0: number, z1: number, y = 0): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0], 3),
  );
  g.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3),
  );
  g.setAttribute('uv', new THREE.Float32BufferAttribute([x0, -z0, x0, -z1, x1, -z1, x1, -z0], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/**
 * Raised sidewalk slab for one block, rounded only at corners where two roads meet.
 * Extruded upward; group 0 = top/bottom (paving), group 1 = sides (curb face).
 */
function sidewalkSlab(b: Block): THREE.ExtrudeGeometry {
  const R = CORNER_RADIUS;
  const { sx0: x0, sx1: x1, sz0: z0, sz1: z1, roads } = b;
  const pts: THREE.Vector2[] = [];
  const corner = (rounded: boolean, cx: number, cz: number, a0: number, px: number, pz: number) => {
    if (!rounded) {
      pts.push(new THREE.Vector2(px, -pz));
      return;
    }
    const segments = 10;
    for (let i = 0; i <= segments; i++) {
      const a = a0 + (i / segments) * (Math.PI / 2);
      pts.push(new THREE.Vector2(cx + R * Math.cos(a), -(cz + R * Math.sin(a))));
    }
  };
  // Walk the outline NW → NE → SE → SW (shape space is x, −z).
  corner(!!(roads.n && roads.w), x0 + R, z0 + R, Math.PI, x0, z0);
  corner(!!(roads.n && roads.e), x1 - R, z0 + R, Math.PI * 1.5, x1, z0);
  corner(!!(roads.s && roads.e), x1 - R, z1 - R, 0, x1, z1);
  corner(!!(roads.s && roads.w), x0 + R, z1 - R, Math.PI / 2, x0, z1);
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
    depth: CURB_HEIGHT - 0.02,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
    curveSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.02, 0);
  return geo;
}

type Rect = [x0: number, x1: number, z0: number, z1: number];

/** Converts a rectangle in road space (u along the road, v across it) to world space. */
function roadRect(r: Road, u0: number, u1: number, v0: number, v1: number): Rect {
  const [ua, ub] = u0 < u1 ? [u0, u1] : [u1, u0];
  const [va, vb] = v0 < v1 ? [v0, v1] : [v1, v0];
  return r.axis === 'x'
    ? [ua, ub, r.coord + va, r.coord + vb]
    : [r.coord + va, r.coord + vb, ua, ub];
}

/** Asphalt: east–west roads run the full length; north–south roads skip the crossings. */
function roadSurfaces(): Rect[] {
  const out: Rect[] = [];
  for (const r of roadsAlong('x')) {
    out.push(roadRect(r, -EXTENT, EXTENT, -halfWidth(r), halfWidth(r)));
  }
  for (const r of roadsAlong('z')) {
    let u = -EXTENT;
    for (const c of roadsAlong('x')) {
      out.push(roadRect(r, u, c.coord - halfWidth(c), -halfWidth(r), halfWidth(r)));
      u = c.coord + halfWidth(c);
    }
    out.push(roadRect(r, u, EXTENT, -halfWidth(r), halfWidth(r)));
  }
  return out;
}

interface Stop {
  at: number;
  /** Half-width of the crossing road, or −1 at a road end. */
  half: number;
}

/** Distance from a crossing's center to where lane paint resumes. */
const clearance = (s: Stop) => (s.half < 0 ? 0 : s.half + 0.5 + CROSSWALK_WIDTH + STOP_LINE_GAP);

/** Lane markings for every road segment between intersections, split by paint color. */
function buildMarkings(): { white: Rect[]; yellow: Rect[] } {
  const white: Rect[] = [];
  const yellow: Rect[] = [];
  const line = 0.12;
  for (const r of ROADS) {
    const hw = halfWidth(r);
    const travel = r.laneWidth * r.lanesPerSide;
    // Right-hand traffic: which side of the centerline you drive on when heading toward +u.
    const rightOfPlus = r.axis === 'x' ? 1 : -1;
    const crossings = roadsAlong(r.axis === 'x' ? 'z' : 'x');
    const stops: Stop[] = [
      { at: -EXTENT, half: -1 },
      ...crossings.map((c) => ({ at: c.coord, half: halfWidth(c) })),
      { at: EXTENT, half: -1 },
    ];
    for (let i = 0; i < stops.length - 1; i++) {
      const A = stops[i]!;
      const B = stops[i + 1]!;
      const a = A.at + clearance(A);
      const b = B.at - clearance(B);
      if (b <= a) continue;
      yellow.push(
        roadRect(r, a, b, -0.2 - line / 2, -0.2 + line / 2),
        roadRect(r, a, b, 0.2 - line / 2, 0.2 + line / 2),
      );
      for (const side of [-1, 1]) {
        // Parking lane edge.
        white.push(roadRect(r, a, b, side * travel - 0.05, side * travel + 0.05));
        // Dashed lane dividers on multi-lane roads: 3 m paint, 9 m gap.
        for (let k = 1; k < r.lanesPerSide; k++) {
          const v = side * r.laneWidth * k;
          for (let u = a; u + 3 <= b; u += 12) {
            white.push(roadRect(r, u, u + 3, v - line / 2, v + line / 2));
          }
        }
      }
      // Stop bars on the lanes heading into each crossing, and crosswalks across the road.
      for (const [S, dir] of [
        [A, -1],
        [B, 1],
      ] as const) {
        if (S.half < 0) continue;
        const stopU = S.at - dir * clearance(S);
        white.push(roadRect(r, stopU - 0.25, stopU + 0.25, 0, dir * rightOfPlus * travel));
        const cw0 = S.at - dir * (S.half + 0.5);
        const cw1 = cw0 - dir * CROSSWALK_WIDTH;
        for (let v = -hw + 0.4; v + 0.6 <= hw - 0.3; v += 1.2) {
          white.push(roadRect(r, cw0, cw1, v, v + 0.6));
        }
      }
    }
  }
  return { white, yellow };
}

function rectsToGeometry(rects: Rect[], y: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  rects.forEach(([x0, x1, z0, z1], i) => {
    pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0);
    uv.push(x0, -z0, x0, -z1, x1, -z1, x1, -z0);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    const o = i * 4;
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Blotchy noise used as an alpha mask so paint looks worn into the asphalt. */
function makeWearTexture(): THREE.CanvasTexture {
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

/** Merges many geometries with the same layout into one (fewer draw calls). */
function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'uv'] as const;
  const arrays: Record<(typeof names)[number], number[]> = { position: [], normal: [], uv: [] };
  const index: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  let vertexOffset = 0;
  for (const g of geos) {
    for (const n of names) {
      const src = g.getAttribute(n).array as ArrayLike<number>;
      const dst = arrays[n];
      for (let k = 0; k < src.length; k++) dst.push(src[k]!);
    }
    const gi = g.index
      ? Array.from(g.index.array)
      : [...Array(g.getAttribute('position').count).keys()];
    const base = index.length;
    for (const i of gi) index.push(i + vertexOffset);
    // Preserve ExtrudeGeometry's paving/curb material groups.
    for (const grp of g.groups.length
      ? g.groups
      : [{ start: 0, count: gi.length, materialIndex: 0 }]) {
      groups.push({
        start: base + grp.start,
        count: grp.count,
        materialIndex: grp.materialIndex ?? 0,
      });
    }
    vertexOffset += g.getAttribute('position').count;
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(arrays.position, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normal, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(arrays.uv, 2));
  merged.setIndex(index);
  for (const grp of groups) merged.addGroup(grp.start, grp.count, grp.materialIndex);
  return merged;
}

export function Street() {
  const asphalt = usePbrMaterial('asphalt_02', { tileMeters: 5, normalScale: 1.2 });
  const paving = usePbrMaterial('concrete_pavement', {
    tileMeters: 3,
    metalness: 0,
    color: '#b9bec2',
  });
  const curb = usePbrMaterial('concrete', { tileMeters: 1.5, metalness: 0, color: '#d8d8d4' });

  const geometry = useMemo(
    () => ({
      // Asphalt only where the roads are; a wide ground plane sits under everything else.
      roads: mergeAll(roadSurfaces().map(([x0, x1, z0, z1]) => groundQuad(x0, x1, z0, z1))),
      ground: groundQuad(-GROUND, GROUND, -GROUND, GROUND, -0.01),
      sidewalks: mergeAll(BLOCKS.map(sidewalkSlab)),
      markings: buildMarkings(),
    }),
    [],
  );

  const paint = useMemo(() => {
    const wear = makeWearTexture();
    const common = {
      roughness: 0.75,
      metalness: 0,
      alphaMap: wear,
      alphaTest: 0.35,
      normalMap: asphalt.normalMap,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    };
    return {
      white: new THREE.MeshStandardMaterial({ color: '#e9e9e4', ...common }),
      yellow: new THREE.MeshStandardMaterial({ color: '#d9a21b', ...common }),
      whiteGeo: rectsToGeometry(geometry.markings.white, 0.004),
      yellowGeo: rectsToGeometry(geometry.markings.yellow, 0.004),
    };
  }, [asphalt.normalMap, geometry.markings]);

  return (
    <group>
      <mesh geometry={geometry.roads} material={asphalt} receiveShadow />
      <mesh geometry={geometry.ground} material={paving} receiveShadow />
      <mesh geometry={paint.whiteGeo} material={paint.white} receiveShadow />
      <mesh geometry={paint.yellowGeo} material={paint.yellow} receiveShadow />
      <mesh geometry={geometry.sidewalks} material={[paving, curb]} receiveShadow castShadow />
    </group>
  );
}
