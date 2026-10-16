import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { extractParts } from '../world/instancing';

/** The "Flying Car" brand EV (Khronos CarConcept, rebadged in the asset pipeline). Front faces +z. */
export const CAR_MODEL = 'car_concept';

/** Paint materials in the source model that take the body color. */
const BODY_PAINT = /^Paint 1/;
/** The source glass uses transmission (an extra full-scene render pass); swap it for tinted glass. */
const GLASS = /^Glass$/;

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

/**
 * Builds a static car: all parts with the same material merged into one mesh,
 * so a parked car costs ~25 draw calls instead of ~100.
 */
export function buildStaticCar(source: THREE.Object3D, look: CarLook): THREE.Group {
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const part of extractParts(source)) {
    const list = byMaterial.get(part.material) ?? [];
    list.push(normalizeAttributes(part.geometry));
    byMaterial.set(part.material, list);
  }

  const group = new THREE.Group();
  group.name = 'car';
  for (const [material, geos] of byMaterial) {
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    let mat = material;
    if (GLASS.test(material.name)) {
      mat = sharedGlass;
    } else if (BODY_PAINT.test(material.name)) {
      const paint = (material as THREE.MeshPhysicalMaterial).clone();
      paint.color.set(look.paint);
      mat = paint;
    }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = mat !== sharedGlass;
    mesh.receiveShadow = true;
    // Transparent glass draws after the opaque body.
    if (mat === sharedGlass) mesh.renderOrder = 1;
    group.add(mesh);
  }
  return group;
}
