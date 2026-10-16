import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { modelUrl } from '../../lib/assets';
import {
  BAY,
  buildingHeight,
  FLOOR_HEIGHT,
  WALL_HEIGHT,
  generateBuildings,
  type BuildingSpec,
  type Side,
  type WallVariant,
} from './buildingLayout';
import { toFloatGeometry } from './instancing';
import { LAYOUT } from './layout';
import { usePbrMaterial } from './materials';

const KIT = 'modular_urban_apartments_facade';
const KIT_MAT = (name: string) => `${KIT}_${name}`;
const CORE_INSET = 0.3;
const BASE_Y = LAYOUT.curbHeight;

interface Placement {
  piece: string;
  matrix: THREE.Matrix4;
  variant: WallVariant;
  lowDetail: boolean;
}

/** Facade frame for a footprint side: origin, run direction (local +x) and outward normal (local +z). */
function facadeFrame(
  b: BuildingSpec,
  side: Side,
): { origin: THREE.Vector3; rotY: number; length: number } {
  switch (side) {
    case 's':
      return { origin: new THREE.Vector3(b.x0, BASE_Y, b.z1), rotY: 0, length: b.x1 - b.x0 };
    case 'n':
      return { origin: new THREE.Vector3(b.x1, BASE_Y, b.z0), rotY: Math.PI, length: b.x1 - b.x0 };
    case 'e':
      return {
        origin: new THREE.Vector3(b.x1, BASE_Y, b.z1),
        rotY: Math.PI / 2,
        length: b.z1 - b.z0,
      };
    case 'w':
      return {
        origin: new THREE.Vector3(b.x0, BASE_Y, b.z0),
        rotY: -Math.PI / 2,
        length: b.z1 - b.z0,
      };
  }
}

/** Chooses kit pieces for every cell of one facade. */
function facadePlacements(b: BuildingSpec, side: Side): Placement[] {
  const { origin, rotY, length } = facadeFrame(b, side);
  const bays = Math.round(length / BAY);
  const base = new THREE.Matrix4().makeRotationY(rotY).setPosition(origin);
  const out: Placement[] = [];
  const put = (piece: string, u: number, y: number) =>
    out.push({
      piece,
      variant: b.variant,
      lowDetail: b.lowDetail,
      matrix: base.clone().multiply(new THREE.Matrix4().makeTranslation(u, y, 0)),
    });

  const top = b.floors - 1;
  const entrance = Math.floor(bays / 2);
  for (let i = 0; i < bays; i++) {
    const u = (i + 1) * BAY; // pieces span local x ∈ [-3, 0]
    for (let f = 0; f < b.floors; f++) {
      const y = f * FLOOR_HEIGHT;
      let opening: string;
      if (f === 0) {
        if (i === entrance)
          opening = b.shopfront ? 'door_centered_large_01' : 'door_centered_small_01';
        else opening = b.shopfront ? 'window_centered_double_01' : `window_${b.windows}_01`;
        if (i !== entrance && !b.shopfront) put('base_standard_01', u, 0);
      } else if (f === top && b.floors >= 3) {
        opening = `window_${b.windows}_03`;
      } else {
        opening = `window_${b.windows}_${b.windowRow}`;
      }
      put(`wall_${opening}`, u, y);
      put(opening, u, y);
      if (f < top) put('dado_standard_standard_01', u, y + WALL_HEIGHT);
    }
    const roofline = top * FLOOR_HEIGHT + WALL_HEIGHT;
    put('cornice_standard_standard_01', u, roofline);
    put('crown_standard_standard_01', u, roofline + 0.2);
  }
  // End caps for the horizontal bands.
  const roofline = top * FLOOR_HEIGHT + WALL_HEIGHT;
  for (const [suffix, u] of [
    ['01', 0],
    ['02', bays * BAY],
  ] as const) {
    put(`cornice_end_${suffix}`, u, roofline);
    put(`crown_end_${suffix}`, u, roofline + 0.2);
    for (let f = 0; f < top; f++) put(`dado_end_${suffix}`, u, f * FLOOR_HEIGHT + WALL_HEIGHT);
  }
  return out;
}

/** Box with UVs scaled to meters so tiled materials keep real-world size. */
function meterBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const faceSizes: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  faceSizes.forEach(([su, sv], face) => {
    for (let k = 0; k < 4; k++) {
      const i = face * 4 + k;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  });
  return g;
}

interface WallMaterials {
  /** For kit pieces (UV 0–1 per 3 m panel). */
  kit: THREE.Material;
  /** For boxes with meter UVs (party walls, returns). */
  box: THREE.Material;
}

function useWallMaterials(
  kitPlaster: THREE.MeshStandardMaterial,
): Record<WallVariant, WallMaterials> {
  const redKit = usePbrMaterial('brick_wall_02', { repeat: [1.5, 1.5], metalness: 0 });
  const redBox = usePbrMaterial('brick_wall_02', { tileMeters: 2, metalness: 0 });
  const darkKit = usePbrMaterial('dark_brick_wall', { repeat: [1.5, 1.5], metalness: 0 });
  const darkBox = usePbrMaterial('dark_brick_wall', { tileMeters: 2, metalness: 0 });
  const stuccoKit = usePbrMaterial('white_stucco', {
    repeat: [1.5, 1.5],
    metalness: 0,
    color: '#ece6da',
  });
  const stuccoBox = usePbrMaterial('white_stucco', {
    tileMeters: 2,
    metalness: 0,
    color: '#ece6da',
  });

  return useMemo(() => {
    const plaster = (color: string): WallMaterials => {
      const kit = kitPlaster.clone();
      kit.color.set(color);
      const box = kitPlaster.clone();
      box.color.set(color);
      for (const key of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'metalnessMap'] as const) {
        const t = kitPlaster[key];
        if (t) {
          const c = t.clone();
          c.wrapS = c.wrapT = THREE.RepeatWrapping;
          c.repeat.set(1 / BAY, 1 / BAY);
          c.needsUpdate = true;
          box[key] = c;
        }
      }
      return { kit, box };
    };
    // Kit wall panels are single planes, authored double-sided.
    for (const m of [redKit, darkKit, stuccoKit]) m.side = THREE.DoubleSide;
    return {
      plaster_cream: plaster('#f3e7d3'),
      plaster_grey: plaster('#d4d6d6'),
      red_brick: { kit: redKit, box: redBox },
      dark_brick: { kit: darkKit, box: darkBox },
      stucco: { kit: stuccoKit, box: stuccoBox },
    };
  }, [kitPlaster, redKit, redBox, darkKit, darkBox, stuccoKit, stuccoBox]);
}

export function Buildings() {
  const gltf = useGLTF(modelUrl(KIT), false, true);
  const roof = usePbrMaterial('asphalt_02', { tileMeters: 6, metalness: 0, color: '#8a8782' });

  const kitMaterials = useMemo(() => {
    const byName = new Map<string, THREE.MeshStandardMaterial>();
    for (const m of Object.values(gltf.materials))
      byName.set(m.name, m as THREE.MeshStandardMaterial);
    return byName;
  }, [gltf]);
  const kitPlaster = kitMaterials.get(KIT_MAT('plaster'));
  if (!kitPlaster) throw new Error('Facade kit is missing its plaster material');
  const walls = useWallMaterials(kitPlaster);

  const shared = useMemo(
    () => ({
      // Opaque, reflective glass: from the street, windows read as sky reflections over dark rooms.
      glass: new THREE.MeshStandardMaterial({
        color: '#1a2027',
        metalness: 0.85,
        roughness: 0.06,
        envMapIntensity: 1.3,
      }),
      interior: new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.95 }),
    }),
    [],
  );

  const scene = useMemo(() => {
    const specs = generateBuildings();
    const group = new THREE.Group();
    group.name = 'buildings';

    // 1. Collect every kit piece placement.
    const placements = specs.flatMap((b) => b.streetSides.flatMap((s) => facadePlacements(b, s)));

    // 2. One InstancedMesh per (piece primitive, wall variant if plaster).
    const buckets = new Map<
      string,
      { geo: THREE.BufferGeometry; mat: THREE.Material; mats: THREE.Matrix4[] }
    >();
    // Meshopt quantization stores a dequantize transform on each node, so bake the node's
    // local matrix into piece geometry (the export pipeline zeroes the showcase layout).
    const pieceCache = new Map<
      string,
      { geometry: THREE.BufferGeometry; material: THREE.Material }[]
    >();
    const primitivesOf = (piece: string) => {
      const cached = pieceCache.get(piece);
      if (cached) return cached;
      const node = gltf.nodes[piece];
      if (!node) {
        console.warn(`Facade kit piece not found: ${piece}`);
        return [];
      }
      node.updateMatrix();
      const meshes = (node as THREE.Mesh).isMesh
        ? [node as THREE.Mesh]
        : node.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh);
      const prims = meshes.map((mesh) => {
        mesh.updateMatrix();
        const m = mesh === node ? node.matrix : node.matrix.clone().multiply(mesh.matrix);
        return {
          geometry: toFloatGeometry(mesh.geometry).applyMatrix4(m),
          material: mesh.material as THREE.Material,
        };
      });
      pieceCache.set(piece, prims);
      return prims;
    };
    for (const p of placements) {
      primitivesOf(p.piece).forEach((prim, idx) => {
        const src = prim.material;
        const isPlaster = src.name === KIT_MAT('plaster');
        const isGlass = src.name === KIT_MAT('glass');
        // Low-detail facades keep walls, glass and rooflines but drop frames, sills and doors.
        if (p.lowDetail && src.name === KIT_MAT('objects')) return;
        const key = `${p.piece}#${idx}${isPlaster ? `:${p.variant}` : ''}${p.lowDetail ? ':lod' : ''}`;
        let bucket = buckets.get(key);
        if (!bucket) {
          const mat = isPlaster ? walls[p.variant].kit : isGlass ? shared.glass : src;
          bucket = { geo: prim.geometry, mat, mats: [] };
          buckets.set(key, bucket);
        }
        bucket.mats.push(p.matrix);
      });
    }
    for (const { geo, mat, mats } of buckets.values()) {
      const inst = new THREE.InstancedMesh(geo, mat, mats.length);
      mats.forEach((m, i) => inst.setMatrixAt(i, m));
      // The plain core boxes cast the building shadows; facade detail would double the shadow pass.
      inst.castShadow = false;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      group.add(inst);
    }

    // 3. Building cores: dark interior behind facades, party walls elsewhere, flat roof on top.
    for (const b of specs) {
      const h = buildingHeight(b) - 0.2 + BASE_Y;
      const x0 = b.x0 + (b.streetSides.includes('w') ? CORE_INSET : 0);
      const x1 = b.x1 - (b.streetSides.includes('e') ? CORE_INSET : 0);
      const z0 = b.z0 + (b.streetSides.includes('n') ? CORE_INSET : 0);
      const z1 = b.z1 - (b.streetSides.includes('s') ? CORE_INSET : 0);
      // Party walls are plain brick unless the building itself is brick.
      const party = b.variant === 'dark_brick' ? walls.dark_brick.box : walls.red_brick.box;
      const face = (s: Side) => (b.streetSides.includes(s) ? shared.interior : party);
      // BoxGeometry face order: +x, −x, +y, −y, +z, −z
      const core = new THREE.Mesh(meterBox(x1 - x0, h, z1 - z0), [
        face('e'),
        face('w'),
        roof,
        shared.interior,
        face('s'),
        face('n'),
      ]);
      // Cores start at street level so buildings beyond the sidewalks never float.
      core.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
      core.castShadow = true;
      core.receiveShadow = true;
      group.add(core);

      // Short wall returns hide the gap between each facade end and the inset core.
      for (const s of b.streetSides) {
        const { origin, rotY, length } = facadeFrame(b, s);
        for (const u of [0.1, length - 0.1]) {
          const ret = new THREE.Mesh(meterBox(0.2, h, CORE_INSET + 0.05), party);
          ret.position.set(u, h / 2, -(CORE_INSET + 0.05) / 2);
          ret.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(origin);
          ret.position.y = h / 2;
          ret.rotation.y = rotY;
          ret.castShadow = true;
          group.add(ret);
        }
      }
    }
    return group;
  }, [gltf, walls, shared, roof]);

  useEffect(
    () => () => {
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
      });
    },
    [scene],
  );

  return <primitive object={scene} />;
}

useGLTF.preload(modelUrl(KIT), false, true);
