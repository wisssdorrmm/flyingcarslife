/**
 * Low-poly procedural props for instancing across the city (thousands of copies): a stylized
 * street tree, cobra-head lamp, signal pole with mast arm, and a generic parked car.
 * Each part is a separate geometry so it can be its own InstancedMesh with one material.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function place(
  g: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.BufferGeometry {
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

/** Merges parts after dropping attributes they don't all share (keeps position/normal). */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const name of Object.keys(g.attributes))
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    return g;
  });
  return mergeGeometries(clean)!;
}

/** Lumpy canopy: a few displaced icosahedron blobs. Trunk is separate. */
export function treeGeometries(): { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry } {
  const trunk = place(new THREE.CylinderGeometry(0.12, 0.18, 3.2, 6, 1, true), 0, 1.6, 0);
  const blobs: THREE.BufferGeometry[] = [];
  const spec: [number, number, number, number][] = [
    [0, 4.3, 0, 1.9],
    [0.9, 3.8, 0.4, 1.3],
    [-0.8, 3.9, -0.5, 1.35],
    [0.2, 5.1, -0.2, 1.2],
  ];
  for (const [x, y, z, r] of spec) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const n = 1 + 0.12 * Math.sin(v.x * 3.1 + v.y * 2.3) * Math.cos(v.z * 2.7);
      v.multiplyScalar(n);
      v.y *= 0.85;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    blobs.push(place(g, x, y, z));
  }
  return { trunk, canopy: merge(blobs) };
}

/** SF cobra-head street light: pole, curved arm (pointing +z), luminaire. */
export function lampGeometry(): THREE.BufferGeometry {
  const pole = place(new THREE.CylinderGeometry(0.08, 0.12, 8, 8), 0, 4, 0);
  const arm = place(
    new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6),
    0,
    7.95,
    1.0,
    Math.PI / 2 - 0.12,
  );
  const head = place(new THREE.BoxGeometry(0.4, 0.16, 0.8), 0, 8.05, 2.15);
  return merge([pole, arm, head]);
}

/** Signal pole on the corner with a mast arm over the road (+x toward the road), heads face +z. */
export function signalGeometries(): { pole: THREE.BufferGeometry; heads: THREE.BufferGeometry } {
  const pole = place(new THREE.CylinderGeometry(0.11, 0.14, 6.2, 8), 0, 3.1, 0);
  const arm = place(
    new THREE.CylinderGeometry(0.07, 0.09, 5.5, 6),
    -2.75,
    5.9,
    0,
    0,
    0,
    Math.PI / 2,
  );
  const heads = merge([
    place(new THREE.BoxGeometry(0.36, 1.05, 0.28), -4.6, 5.3, 0.05),
    place(new THREE.BoxGeometry(0.36, 1.05, 0.28), 0, 3.2, 0.2),
  ]);
  return { pole: merge([pole, arm]), heads };
}

/** Generic hatchback/sedan, front at +z, 4.4 m long. Body takes the paint color. */
export function parkedCarGeometries(): {
  body: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  wheels: THREE.BufferGeometry;
} {
  const W = 1.78;
  // Side profile below the beltline (z forward, y up).
  const lower = new THREE.Shape();
  const lowerPts: [number, number][] = [
    [-2.12, 0.3],
    [2.08, 0.3],
    [2.22, 0.42],
    [2.2, 0.66],
    [1.7, 0.8],
    [0.95, 0.9],
    [-1.7, 0.93],
    [-2.15, 0.84],
    [-2.24, 0.56],
  ];
  lower.moveTo(...lowerPts[0]!);
  for (const p of lowerPts.slice(1)) lower.lineTo(...p);
  const body = new THREE.ExtrudeGeometry(lower, {
    depth: W - 0.3,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.1,
    bevelSegments: 3,
  });
  // Shape x is the car's forward axis: rotateY(−90°) maps it to +z and the extrude axis to −x.
  body.rotateY(-Math.PI / 2);
  body.translate((W - 0.3) / 2, 0, 0);

  const upper = new THREE.Shape();
  const upperPts: [number, number][] = [
    [0.95, 0.9],
    [0.2, 1.33],
    [-0.95, 1.36],
    [-1.72, 0.93],
  ];
  upper.moveTo(...upperPts[0]!);
  for (const p of upperPts.slice(1)) upper.lineTo(...p);
  const glass = new THREE.ExtrudeGeometry(upper, {
    depth: W - 0.62,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  glass.rotateY(-Math.PI / 2);
  glass.translate((W - 0.62) / 2, 0, 0);

  const wheel = (x: number, z: number) =>
    place(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12), x, 0.33, z, 0, 0, Math.PI / 2);
  const wheels = merge([
    wheel(0.78, 1.35),
    wheel(-0.78, 1.35),
    wheel(0.78, -1.32),
    wheel(-0.78, -1.32),
  ]);
  return { body: merge([body]), glass: merge([glass]), wheels };
}

/** Paints for parked cars (index from the generator). */
export const PARKED_PAINTS = [
  '#e9ecef',
  '#1c1f24',
  '#8b9097',
  '#a11d22',
  '#24467a',
  '#c9c3b5',
  '#3c5e4a',
  '#d7a82e',
].map((c) => new THREE.Color(c));
