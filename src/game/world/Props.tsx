import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { modelUrl } from '../../lib/assets';
import { useSettings } from '../store/settings';
import { disposeGroup, extractParts, instanceParts, placement } from './instancing';
import { LAYOUT } from './layout';
import { usePbrMaterial } from './materials';

const { mainHalfWidth: MH, crossHalfWidth: CH, curbHeight: Y } = LAYOUT;

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
  coveredCar: { model: 'covered_car' },
  tree: { model: 'tree_small_02' },
} satisfies Record<string, PropDef>;

type PropName = keyof typeof PROPS;

/** Where every prop goes. Positions are world meters; rotation is about Y. */
function propPlacements(): Record<PropName, THREE.Matrix4[]> {
  const curbSide = (side: number) => side * (MH + 0.55); // just inside the curb on Main St
  const out: Record<PropName, THREE.Matrix4[]> = {
    hydrant: [],
    trashCan: [],
    bench: [],
    utilityBox: [],
    manhole: [],
    coveredCar: [],
    tree: [],
  };

  for (const s of [-1, 1]) {
    // Trees in tree pits along Main Street, between the street lights.
    for (let x = 24; x <= 74; x += 15) {
      for (const side of [-1, 1]) {
        out.tree.push(placement(s * x, Y, side * (MH + 1.3), x * 1.7, 1.35 + ((x * 7) % 3) * 0.08));
      }
    }
    // Trees along 1st Avenue.
    for (let z = 28; z <= 70; z += 16) {
      for (const side of [-1, 1]) {
        out.tree.push(placement(side * (CH + 1.3), Y, s * z, z * 2.3, 1.3));
      }
    }
    // Hydrants near the corners, at the curb.
    out.hydrant.push(placement(s * (CH + 7), Y, curbSide(s), s > 0 ? 0 : Math.PI));
    // Trash cans by the crosswalks.
    out.trashCan.push(placement(s * (CH + 5), Y, curbSide(-s) - s * 0.2, s * 0.7));
    out.trashCan.push(placement(-s * (CH + 0.8), Y, s * (MH + 7.5), 1.2));
    // Benches facing the street.
    out.bench.push(placement(s * 44, Y, s * (MH + 1.1), s > 0 ? Math.PI : 0));
    // Manhole covers in the travel lanes.
    out.manhole.push(placement(s * 33, 0.005, s * 1.6, 0));
  }
  out.utilityBox.push(placement(CH + 3.2, Y, -(MH + 3.6), Math.PI / 2));
  out.manhole.push(placement(-1.8, 0.005, 26, 0));
  // Parked in the eastbound parking lane.
  out.coveredCar.push(placement(-24, 0, MH - LAYOUT.mainLanes.parking / 2, Math.PI / 2));
  return out;
}

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
