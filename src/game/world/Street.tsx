import { useMemo } from 'react';
import * as THREE from 'three';
import { LAYOUT } from './layout';
import { usePbrMaterial } from './materials';

const {
  mainHalfWidth: MH,
  crossHalfWidth: CH,
  streetLength: L,
  curbHeight,
  cornerRadius: R,
} = LAYOUT;
/** Half-size of the ground plane under the whole block. */
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
 * One raised sidewalk block per quadrant, with a rounded corner at the intersection.
 * Extruded upward; group 0 = top/bottom (paving), group 1 = sides (curb face).
 */
function sidewalkBlock(sx: 1 | -1, sz: 1 | -1): THREE.ExtrudeGeometry {
  // Shape is drawn in (x, -z) and the extrusion is rotated to point up.
  const pts: THREE.Vector2[] = [];
  const cx = sx * CH;
  const cz = sz * MH;
  const segments = 10;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * (Math.PI / 2);
    const x = cx + sx * (R - R * Math.cos(a));
    const z = cz + sz * (R - R * Math.sin(a));
    pts.push(new THREE.Vector2(x, -z));
  }
  pts.push(new THREE.Vector2(sx * L, -cz));
  pts.push(new THREE.Vector2(sx * L, -sz * L));
  pts.push(new THREE.Vector2(cx, -sz * L));
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
    depth: curbHeight - 0.02,
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

/** All lane markings as axis-aligned rectangles, split by paint color. */
function buildMarkings(): { white: Rect[]; yellow: Rect[] } {
  const white: Rect[] = [];
  const yellow: Rect[] = [];
  const cw = LAYOUT.crosswalkWidth;
  const gap = LAYOUT.stopLineGap;
  const line = 0.12;
  const mainStop = CH + 0.5 + cw + gap; // x of Main Street stop lines
  const crossStop = MH + 0.5 + cw + gap; // z of 1st Ave stop lines

  for (const s of [-1, 1]) {
    // Main Street (along x), split either side of the intersection.
    const [a, b] = s < 0 ? [-L, -mainStop] : [mainStop, L];
    yellow.push([a, b, -0.2 - line / 2, -0.2 + line / 2], [a, b, 0.2 - line / 2, 0.2 + line / 2]);
    const travel = LAYOUT.mainLanes.travel;
    for (const side of [-1, 1]) {
      // Parking lane edge.
      const zp = side * travel * 2;
      white.push([a, b, zp - 0.05, zp + 0.05]);
      // Dashed lane divider: 3 m paint, 9 m gap (US 10 ft / 30 ft).
      const zd = side * travel;
      for (let x = a; x + 3 <= b; x += 12) white.push([x, x + 3, zd - line / 2, zd + line / 2]);
    }
    // Stop bar across the inbound lanes (traffic drives on the right).
    const sx = s;
    const inbound: [number, number] = sx < 0 ? [0, travel * 2] : [-travel * 2, 0];
    white.push([sx * mainStop - 0.25, sx * mainStop + 0.25, inbound[0], inbound[1]]);
    // Continental crosswalk across Main Street.
    const x0 = sx < 0 ? -CH - 0.5 - cw : CH + 0.5;
    for (let z = -MH + 0.4; z + 0.6 <= MH - 0.3; z += 1.2) white.push([x0, x0 + cw, z, z + 0.6]);

    // 1st Avenue (along z).
    const [c, d] = s < 0 ? [-L, -crossStop] : [crossStop, L];
    yellow.push([-0.2 - line / 2, -0.2 + line / 2, c, d], [0.2 - line / 2, 0.2 + line / 2, c, d]);
    const ct = LAYOUT.crossLanes.travel;
    for (const side of [-1, 1]) white.push([side * ct - 0.05, side * ct + 0.05, c, d]);
    // Northbound (−z) uses the east half; southbound the west half.
    const inboundX: [number, number] = s > 0 ? [0, ct] : [-ct, 0];
    white.push([inboundX[0], inboundX[1], s * crossStop - 0.25, s * crossStop + 0.25]);
    const z0 = s < 0 ? -MH - 0.5 - cw : MH + 0.5;
    for (let x = -CH + 0.4; x + 0.6 <= CH - 0.3; x += 1.2) white.push([x, x + 0.6, z0, z0 + cw]);
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
      roads: [groundQuad(-L, L, -MH, MH), groundQuad(-CH, CH, -L, -MH), groundQuad(-CH, CH, MH, L)],
      ground: groundQuad(-GROUND, GROUND, -GROUND, GROUND, -0.01),
      sidewalks: (
        [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ] as const
      ).map(([sx, sz]) => sidewalkBlock(sx, sz)),
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
      {geometry.roads.map((g, i) => (
        <mesh key={i} geometry={g} material={asphalt} receiveShadow />
      ))}
      <mesh geometry={geometry.ground} material={paving} receiveShadow />
      <mesh geometry={paint.whiteGeo} material={paint.white} receiveShadow />
      <mesh geometry={paint.yellowGeo} material={paint.yellow} receiveShadow />
      {geometry.sidewalks.map((g, i) => (
        <mesh key={i} geometry={g} material={[paving, curb]} receiveShadow castShadow />
      ))}
    </group>
  );
}
