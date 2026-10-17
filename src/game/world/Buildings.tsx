import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { modelUrl } from '../../lib/assets';
import {
  BAY,
  buildingHeight,
  FLOOR_HEIGHT,
  WALL_HEIGHT,
  cityBuildings,
  entranceBay,
  facadeFrame,
  type BuildingSpec,
  type Side,
  type WallVariant,
} from './buildingLayout';
import { makeFacadeShellMaterial } from './facadeShell';
import { toFloatGeometry } from './instancing';
import { cityPlaces } from '../places/placement';
import { CURB_HEIGHT } from './cityPlan';
import { usePbrMaterial } from './materials';
import { useSettings } from '../store/settings';

const KIT = 'modular_urban_apartments_facade';
const KIT_MAT = (name: string) => `${KIT}_${name}`;
const CORE_INSET = 0.3;
const BASE_Y = CURB_HEIGHT;

interface Placement {
  piece: string;
  matrix: THREE.Matrix4;
  variant: WallVariant;
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
      matrix: base.clone().multiply(new THREE.Matrix4().makeTranslation(u, y, 0)),
    });

  const top = b.floors - 1;
  const entrance = entranceBay(bays);
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
    color: '#f1e5d2',
  });
  const stuccoBox = usePbrMaterial('white_stucco', {
    tileMeters: 2,
    metalness: 0,
    color: '#f1e5d2',
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
      // Warm sun-bleached LA stucco tones (CLAUDE.md §10).
      plaster_cream: plaster('#e8dac6'),
      plaster_grey: plaster('#dcd3c6'),
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
        // Blue-teal tint, as in West Coast office glazing.
        color: '#1d3640',
        metalness: 0.85,
        roughness: 0.06,
        envMapIntensity: 1.3,
      }),
      interior: new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.95 }),
    }),
    [],
  );

  const city = useMemo(() => {
    // Places mark their buildings (shopfronts, landmark facades) before anything is built.
    cityPlaces();
    const specs = cityBuildings();
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

    /** Instanced facade pieces for a set of buildings; `lowDetail` drops frames, sills and doors. */
    const facadeGroup = (bs: BuildingSpec[], lowDetail: boolean, only?: Side) => {
      const group = new THREE.Group();
      const buckets = new Map<
        string,
        { geo: THREE.BufferGeometry; mat: THREE.Material; mats: THREE.Matrix4[] }
      >();
      for (const b of bs) {
        for (const side of b.streetSides) {
          if (only && side !== only) continue;
          for (const p of facadePlacements(b, side)) {
            primitivesOf(p.piece).forEach((prim, idx) => {
              const src = prim.material;
              if (lowDetail && src.name === KIT_MAT('objects')) return;
              const isPlaster = src.name === KIT_MAT('plaster');
              const isGlass = src.name === KIT_MAT('glass');
              const key = `${p.piece}#${idx}${isPlaster ? `:${p.variant}` : ''}`;
              let bucket = buckets.get(key);
              if (!bucket) {
                const mat = isPlaster ? walls[p.variant].kit : isGlass ? shared.glass : src;
                bucket = { geo: prim.geometry, mat, mats: [] };
                buckets.set(key, bucket);
              }
              bucket.mats.push(p.matrix);
            });
          }
        }
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
      return group;
    };

    /**
     * Every building shell in the city merged into one mesh (a handful of draw calls): street faces
     * get windows painted by the facade-shell shader, other faces are brick party walls, tops are
     * tar roofs. Up close the full facades stand just in front of these shells.
     */
    const variants = Object.keys(walls) as WallVariant[];
    const shellMaterials = [
      ...variants.map((v) => makeFacadeShellMaterial(walls[v].box as THREE.MeshStandardMaterial)),
      walls.red_brick.box,
      walls.dark_brick.box,
      roof,
    ];
    const PARTY_RED = variants.length;
    const PARTY_DARK = variants.length + 1;
    const ROOF = variants.length + 2;
    const lists: THREE.BufferGeometry[][] = shellMaterials.map(() => []);
    const addBox = (
      w: number,
      h: number,
      d: number,
      at: THREE.Matrix4,
      faceMat: (number | null)[],
      info: [number, number],
    ) => {
      const box = meterBox(w, h, d).applyMatrix4(at);
      const n = box.getAttribute('position').count;
      const infoArr = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) infoArr.set(info, i * 2);
      box.setAttribute('facadeInfo', new THREE.BufferAttribute(infoArr, 2));
      box.groups.forEach((g, face) => {
        const mat = faceMat[face];
        if (mat === null || mat === undefined) return;
        const part = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'uv', 'facadeInfo']) {
          part.setAttribute(name, box.getAttribute(name));
        }
        part.setIndex(Array.from(box.index!.array).slice(g.start, g.start + g.count));
        lists[mat]!.push(part);
      });
    };
    for (const b of specs) {
      const h = buildingHeight(b) - 0.2 + BASE_Y;
      const x0 = b.x0 + (b.streetSides.includes('w') ? CORE_INSET : 0);
      const x1 = b.x1 - (b.streetSides.includes('e') ? CORE_INSET : 0);
      const z0 = b.z0 + (b.streetSides.includes('n') ? CORE_INSET : 0);
      const z1 = b.z1 - (b.streetSides.includes('s') ? CORE_INSET : 0);
      const party = b.variant === 'dark_brick' ? PARTY_DARK : PARTY_RED;
      const facade = variants.indexOf(b.variant);
      const face = (s: Side) => (b.streetSides.includes(s) ? facade : party);
      const info: [number, number] = [h, b.shopfront ? 1 : 0];
      // BoxGeometry face order: +x, −x, +y, −y, +z, −z. Shells start at street level; no bottom.
      addBox(
        x1 - x0,
        h,
        z1 - z0,
        new THREE.Matrix4().makeTranslation((x0 + x1) / 2, h / 2, (z0 + z1) / 2),
        [face('e'), face('w'), ROOF, null, face('s'), face('n')],
        info,
      );
      // Short wall returns hide the gap between each facade end and the inset shell.
      for (const s of b.streetSides) {
        const { origin, rotY, length } = facadeFrame(b, s);
        for (const u of [0.1, length - 0.1]) {
          const p = new THREE.Vector3(u, 0, -(CORE_INSET + 0.05) / 2)
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY)
            .add(origin);
          const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(p.x, h / 2, p.z);
          addBox(0.2, h, CORE_INSET + 0.05, m, [party, party, ROOF, null, party, party], info);
        }
      }
    }
    const used = lists.map((l, i) => ({ l, i })).filter(({ l }) => l.length > 0);
    const shells = new THREE.Mesh(
      mergeGeometries(
        used.map(({ l }) => mergeGeometries(l, false)!),
        true,
      )!,
      used.map(({ i }) => shellMaterials[i]!),
    );
    shells.name = 'building-shells';
    shells.castShadow = true;
    shells.receiveShadow = true;

    // Full facades grouped per block side, shown only when near the camera and facing it.
    const bySide = new Map<string, { side: Side; bs: BuildingSpec[] }>();
    for (const b of specs) {
      for (const side of b.streetSides) {
        const key = `${b.blockId}:${side}`;
        const entry = bySide.get(key) ?? { side, bs: [] };
        entry.bs.push(b);
        bySide.set(key, entry);
      }
    }
    const OUTWARD: Record<Side, [number, number]> = {
      n: [0, -1],
      s: [0, 1],
      e: [1, 0],
      w: [-1, 0],
    };
    const blocks = [...bySide.values()].map(({ side, bs }) => {
      // The facade line: a thin rectangle along the side's building line.
      const xs = bs.flatMap((b) => (side === 'e' ? [b.x1] : side === 'w' ? [b.x0] : [b.x0, b.x1]));
      const zs = bs.flatMap((b) => (side === 's' ? [b.z1] : side === 'n' ? [b.z0] : [b.z0, b.z1]));
      const bounds = {
        x0: Math.min(...xs),
        x1: Math.max(...xs),
        z0: Math.min(...zs),
        z1: Math.max(...zs),
      };
      // Facades are built lazily when the camera first comes near, and freed when it's far.
      return {
        build: () => facadeGroup(bs, false, side),
        near: null as THREE.Group | null,
        bounds,
        outward: OUTWARD[side],
      };
    });
    const facadeRoot = new THREE.Group();
    facadeRoot.name = 'facades';
    return { shells, blocks, facadeRoot };
  }, [gltf, walls, roof, shared]);

  // Level of detail per block side: full facades only nearby and facing the camera.
  const quality = useSettings((s) => s.quality);
  const lastCheck = useRef(-1);
  useFrame(({ camera, clock }) => {
    if (clock.elapsedTime - lastCheck.current < 0.1) return;
    lastCheck.current = clock.elapsedTime;
    const { x, z } = camera.position;
    let builds = 0;
    for (const b of city.blocks) {
      const dx = Math.max(b.bounds.x0 - x, 0, x - b.bounds.x1);
      const dz = Math.max(b.bounds.z0 - z, 0, z - b.bounds.z1);
      const d = Math.hypot(dx, dz);
      // In front of the facade (with a little slack for the camera swinging round a corner).
      const front = (x - b.bounds.x0) * b.outward[0] + (z - b.bounds.z0) * b.outward[1] > -3;
      const want = front && d < quality.buildingDetailDistance;
      // Build at most two block sides per check so approaching a district never hitches.
      if (want && !b.near && builds < 2) {
        b.near = b.build();
        city.facadeRoot.add(b.near);
        builds++;
      }
      if (b.near) b.near.visible = want;
      // Free facades far behind us (instance buffers only; kit geometry is shared).
      if (b.near && d > quality.buildingDetailDistance * 2.5) {
        city.facadeRoot.remove(b.near);
        b.near.traverse(
          (o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose(),
        );
        b.near = null;
      }
    }
  });

  useEffect(
    () => () => {
      // Instanced pieces share cached kit geometry; only the merged shells are owned here.
      city.shells.geometry.dispose();
    },
    [city],
  );

  return (
    <group name="buildings">
      <primitive object={city.shells} />
      <primitive object={city.facadeRoot} />
    </group>
  );
}

useGLTF.preload(modelUrl(KIT), false, true);
