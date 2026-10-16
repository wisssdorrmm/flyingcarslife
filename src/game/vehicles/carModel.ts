import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { extractParts } from '../world/instancing';

/** The "Flying Car" brand EV (Khronos CarConcept, rebadged in the asset pipeline). Front faces +z. */
export const CAR_MODEL = 'car_concept';

/** Paint materials in the source model that take the body color. */
const BODY_PAINT = /^Paint 1/;
/** The source glass uses transmission (an extra full-scene render pass); swap it for tinted glass. */
const GLASS = /^Glass$/;

/** Source node names for the moving parts. Wheels are ordered FL, FR, RL, RR. */
const WHEEL_NODES = ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR'] as const;
const DRIVER_DOOR_NODE = 'BodyDoorLColor1';

export interface CarLook {
  paint: THREE.ColorRepresentation;
}

const sharedGlass = new THREE.MeshPhysicalMaterial({
  color: '#0c0f12',
  roughness: 0.04,
  metalness: 0,
  transparent: true,
  opacity: 0.6,
  envMapIntensity: 1.6,
  depthWrite: false,
});

/** Swaps source materials for this car's look (paint color, cheap glass). Cached per car. */
function materialRemapper(look: CarLook): (m: THREE.Material) => THREE.Material {
  const cache = new Map<THREE.Material, THREE.Material>();
  return (material) => {
    const hit = cache.get(material);
    if (hit) return hit;
    let out = material;
    if (GLASS.test(material.name)) {
      out = sharedGlass;
    } else if (BODY_PAINT.test(material.name)) {
      const paint = (material as THREE.MeshPhysicalMaterial).clone();
      paint.color.set(look.paint);
      out = paint;
    }
    cache.set(material, out);
    return out;
  };
}

/** Keep only the attributes every part has so geometries can be merged. */
function normalizeAttributes(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(n.attributes)) {
    if (!['position', 'normal', 'uv'].includes(name)) n.deleteAttribute(name);
  }
  if (!n.getAttribute('uv')) {
    n.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array(n.getAttribute('position').count * 2), 2),
    );
  }
  if (!n.getAttribute('normal')) n.computeVertexNormals();
  return n;
}

/** Merges every mesh under `source` into one mesh per material. */
function mergeByMaterial(
  source: THREE.Object3D,
  remap: (m: THREE.Material) => THREE.Material,
): THREE.Group {
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const part of extractParts(source)) {
    const mat = remap(part.material);
    const list = byMaterial.get(mat) ?? [];
    list.push(normalizeAttributes(part.geometry));
    byMaterial.set(mat, list);
  }
  const group = new THREE.Group();
  for (const [material, geos] of byMaterial) {
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = material !== sharedGlass;
    mesh.receiveShadow = true;
    // Transparent glass draws after the opaque body.
    if (material === sharedGlass) mesh.renderOrder = 1;
    group.add(mesh);
  }
  return group;
}

/**
 * Builds a static car: all parts with the same material merged into one mesh,
 * so a parked car costs ~25 draw calls instead of ~100.
 */
export function buildStaticCar(source: THREE.Object3D, look: CarLook): THREE.Group {
  const group = mergeByMaterial(source, materialRemapper(look));
  group.name = 'car';
  return group;
}

export interface CarWheel {
  /** Moves with suspension and turns with steering (axis-aligned with the car). */
  pivot: THREE.Group;
  /** Spins around the axle (car x axis); brake calipers stay outside it. */
  spin: THREE.Group;
  /** Wheel center at rest, in the car's frame. */
  center: THREE.Vector3;
  front: boolean;
}

export interface CarRig {
  root: THREE.Group;
  wheels: CarWheel[];
  /** Driver door, pivoting about its hinge (rotate around y to open). */
  driverDoor: THREE.Group | null;
}

/** Re-parents `node` under a new axis-aligned pivot at the node's world position. */
function detachToPivot(node: THREE.Object3D): THREE.Group {
  const pivot = new THREE.Group();
  node.getWorldPosition(pivot.position);
  pivot.updateMatrixWorld(true);
  pivot.attach(node);
  return pivot;
}

/**
 * Builds a drivable car: wheels and the driver door stay separate so they can move;
 * everything else is merged by material.
 */
export function buildDrivableCar(source: THREE.Object3D, look: CarLook): CarRig {
  const remap = materialRemapper(look);
  const scene = source.clone(true);
  scene.updateMatrixWorld(true);

  const root = new THREE.Group();
  root.name = 'drivable-car';

  const wheels: CarWheel[] = [];
  for (const [i, name] of WHEEL_NODES.entries()) {
    const node = scene.getObjectByName(name);
    if (!node) continue;
    const pivot = detachToPivot(node);
    const spin = new THREE.Group();
    pivot.add(spin);
    // Calipers don't rotate with the wheel.
    for (const child of [...node.children]) {
      if (!child.name.includes('BrakePad')) spin.attach(child);
    }
    wheels.push({ pivot, spin, center: pivot.position.clone(), front: i < 2 });
  }

  const doorNode = scene.getObjectByName(DRIVER_DOOR_NODE);
  const driverDoor = doorNode ? detachToPivot(doorNode) : null;

  const movers = [...wheels.map((w) => w.pivot), ...(driverDoor ? [driverDoor] : [])];
  for (const m of movers) {
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = remap(mesh.material as THREE.Material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
  }

  root.add(mergeByMaterial(scene, remap), ...movers);
  return { root, wheels, driverDoor };
}
