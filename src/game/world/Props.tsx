import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { modelUrl } from '../../lib/assets';
import { useSettings } from '../store/settings';
import { propPlacements, type PropName } from './furnitureLayout';
import { disposeGroup, extractParts, instanceParts, placement } from './instancing';
import { CURB_HEIGHT as Y } from './cityPlan';
import { usePbrMaterial } from './materials';

interface PropDef {
  model: string;
  /** Which nodes make up one copy (models ship several variants side by side). */
  include?: (name: string) => boolean;
  /** Undo the model's showcase position so the prop sits at its own origin. */
  offset?: [number, number, number];
}

const PROPS = {
  hydrant: {
    model: 'fire_hydrant',
    include: (n) => n.startsWith('fire_hydrant') && !n.includes('aged'),
    offset: [0.3, 0, 0],
  },
  trashCan: {
    model: 'metal_trash_can',
    include: (n) => n.startsWith('metal_trash_can') && !n.includes('rust'),
    offset: [-0.5, 0, 0],
  },
  bench: {
    model: 'modular_street_seating',
    include: (n) =>
      [
        'legs_single',
        'legs_double',
        'crossbar',
        'suspended_support_01',
        'back_support_r',
        'back_support_l',
        'arm_rest_01',
        'arm_rest_02',
        'seat',
        'seat_back',
      ].includes(n),
    offset: [1.16, 0, 0],
  },
  utilityBox: { model: 'utility_box_01' },
  manhole: { model: 'water_manhole_cover' },
  tree: { model: 'tree_small_02' },
} satisfies Record<PropName, PropDef>;

/** Tree pits: a recessed soil square edged in steel, under every tree. */
function TreePits({ trees }: { trees: THREE.Matrix4[] }) {
  const soil = usePbrMaterial('concrete', { tileMeters: 1, metalness: 0, color: '#4a3b2c' });
  const mesh = useMemo(() => {
    const geo = new THREE.BoxGeometry(1.4, 0.02, 1.4);
    const inst = new THREE.InstancedMesh(geo, soil, trees.length);
    const p = new THREE.Vector3();
    trees.forEach((m, i) => {
      p.setFromMatrixPosition(m);
      inst.setMatrixAt(i, placement(p.x, Y + 0.001, p.z));
    });
    inst.receiveShadow = true;
    return inst;
  }, [soil, trees]);
  useEffect(() => () => mesh.geometry.dispose(), [mesh]);
  return <primitive object={mesh} />;
}

/** Props are grouped into square chunks so far-away ones can be hidden cheaply. */
const CHUNK = 60;
/** How far (m) each prop stays visible; trees are the heaviest. */
const VISIBLE_DISTANCE: Record<PropName, number> = {
  tree: 120,
  hydrant: 90,
  trashCan: 90,
  bench: 110,
  utilityBox: 110,
  manhole: 70,
};

function PropInstances({ name, matrices }: { name: PropName; matrices: THREE.Matrix4[] }) {
  const def: PropDef = PROPS[name];
  const gltf = useGLTF(modelUrl(def.model), false, true);
  // Leafy trees are the heaviest shadow casters; phones skip them.
  const tier = useSettings((s) => s.quality.tier);
  const castShadow = name !== 'tree' || tier !== 'low';
  const chunks = useMemo(() => {
    const offset = def.offset ? new THREE.Matrix4().makeTranslation(...def.offset) : undefined;
    const parts = extractParts(gltf.scene, def.include, offset);
    const byChunk = new Map<string, THREE.Matrix4[]>();
    const p = new THREE.Vector3();
    for (const m of matrices) {
      p.setFromMatrixPosition(m);
      const key = `${Math.floor(p.x / CHUNK)},${Math.floor(p.z / CHUNK)}`;
      byChunk.set(key, [...(byChunk.get(key) ?? []), m]);
    }
    return [...byChunk].map(([key, ms]) => {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      return {
        group: instanceParts(parts, ms, { castShadow }),
        center: new THREE.Vector2((cx + 0.5) * CHUNK, (cz + 0.5) * CHUNK),
      };
    });
  }, [gltf, def, matrices, castShadow]);
  useEffect(() => () => chunks.forEach((c) => disposeGroup(c.group)), [chunks]);

  const last = useRef(0);
  useFrame(({ camera, clock }) => {
    if (clock.elapsedTime - last.current < 0.25) return;
    last.current = clock.elapsedTime;
    const reach = VISIBLE_DISTANCE[name] + CHUNK * 0.71;
    for (const c of chunks) {
      c.group.visible =
        Math.hypot(c.center.x - camera.position.x, c.center.y - camera.position.z) < reach;
    }
  });

  return (
    <>
      {chunks.map((c, i) => (
        <primitive key={i} object={c.group} />
      ))}
    </>
  );
}

export function Props() {
  const layout = useMemo(propPlacements, []);
  return (
    <group>
      {(Object.keys(PROPS) as PropName[]).map((name) => (
        <PropInstances key={name} name={name} matrices={layout[name]} />
      ))}
      <TreePits trees={layout.tree} />
    </group>
  );
}

for (const def of Object.values(PROPS)) useGLTF.preload(modelUrl(def.model), false, true);
