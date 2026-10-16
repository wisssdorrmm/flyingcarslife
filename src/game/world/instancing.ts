import * as THREE from 'three';

/**
 * Meshopt-quantized attributes are normalized integers; transforming them in place would clamp
 * to [-1, 1]. Copy every attribute to Float32 first.
 */
export function toFloatGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) {
    const { count, itemSize } = attr;
    const arr = new Float32Array(count * itemSize);
    for (let i = 0; i < count; i++) {
      arr[i * itemSize] = attr.getX(i);
      if (itemSize > 1) arr[i * itemSize + 1] = attr.getY(i);
      if (itemSize > 2) arr[i * itemSize + 2] = attr.getZ(i);
      if (itemSize > 3) arr[i * itemSize + 3] = attr.getW(i);
    }
    g.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }
  if (src.index) g.setIndex(src.index.clone());
  return g;
}

export interface MeshPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/**
 * Flattens the meshes under `root` into parts with world transforms baked in.
 * `include` filters by node name (a mesh's own name or its parent group's name).
 * `offset` is applied afterwards, e.g. to undo a model's showcase layout.
 */
export function extractParts(
  root: THREE.Object3D,
  include?: (name: string) => boolean,
  offset?: THREE.Matrix4,
): MeshPart[] {
  root.updateMatrixWorld(true);
  const parts: MeshPart[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const names = [mesh.name, mesh.parent?.name ?? ''];
    if (include && !names.some((n) => n && include(n))) return;
    const geometry = toFloatGeometry(mesh.geometry).applyMatrix4(mesh.matrixWorld);
    if (offset) geometry.applyMatrix4(offset);
    parts.push({ geometry, material: mesh.material as THREE.Material });
  });
  return parts;
}

/** Builds one InstancedMesh per part, all sharing the same per-instance transforms. */
export function instanceParts(
  parts: MeshPart[],
  matrices: THREE.Matrix4[],
  opts: { castShadow?: boolean; receiveShadow?: boolean } = {},
): THREE.Group {
  const group = new THREE.Group();
  for (const { geometry, material } of parts) {
    const inst = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.castShadow = opts.castShadow ?? true;
    inst.receiveShadow = opts.receiveShadow ?? true;
    inst.computeBoundingSphere();
    group.add(inst);
  }
  return group;
}

/** Shorthand for a transform matrix from position, Y rotation and uniform scale. */
export function placement(x: number, y: number, z: number, rotY = 0, scale = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
    new THREE.Vector3(scale, scale, scale),
  );
}

export function disposeGroup(group: THREE.Object3D): void {
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
  });
}
