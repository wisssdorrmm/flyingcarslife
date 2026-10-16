import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { modelUrl } from '../../lib/assets';
import { useSettings } from '../store/settings';
import { propPlacements, type PropName } from './furnitureLayout';
import { disposeGroup, extractParts, instanceParts, placement } from './instancing';
import { LAYOUT } from './layout';
import { usePbrMaterial } from './materials';

const { curbHeight: Y } = LAYOUT;

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

function PropInstances({ name, matrices }: { name: PropName; matrices: THREE.Matrix4[] }) {
  const def: PropDef = PROPS[name];
  const gltf = useGLTF(modelUrl(def.model), false, true);
  // Leafy trees are the heaviest shadow casters; phones skip them.
  const tier = useSettings((s) => s.quality.tier);
  const castShadow = name !== 'tree' || tier !== 'low';
  const group = useMemo(() => {
    const offset = def.offset ? new THREE.Matrix4().makeTranslation(...def.offset) : undefined;
    const parts = extractParts(gltf.scene, def.include, offset);
    return instanceParts(parts, matrices, { castShadow });
  }, [gltf, def, matrices, castShadow]);
  useEffect(() => () => disposeGroup(group), [group]);
  return <primitive object={group} />;
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
