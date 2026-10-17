import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { STYLE } from '../config';
import { useSettings } from '../store/settings';
import { palmPlacements } from './furnitureLayout';
import {
  addPalmWind,
  makePalmAtlas,
  palmUniforms,
  shortPalmGeometry,
  tallPalmGeometry,
} from './palmModel';
import { TreePits } from './Props';

/** How often (s) the visible palm list is refreshed from the camera position. */
const CULL_INTERVAL = 0.4;

/**
 * Palm trees (CLAUDE.md §10). One InstancedMesh per species for the whole city; every few frames
 * only palms within range of the camera are packed into the instance buffer, so the city's
 * palms cost two draw calls (plus two in the shadow pass).
 */
export function Palms() {
  const tier = useSettings((s) => s.quality.tier);
  const placements = useMemo(palmPlacements, []);

  const { meshes, all } = useMemo(() => {
    const atlas = makePalmAtlas();
    const material = new THREE.MeshStandardMaterial({
      map: atlas,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0,
    });
    addPalmWind(material);
    // Shadows sway and cut out the frond gaps too.
    const depth = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: atlas,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
    });
    addPalmWind(depth);
    const make = (geo: THREE.BufferGeometry, count: number) => {
      const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, count));
      mesh.customDepthMaterial = depth;
      mesh.receiveShadow = true;
      // Culling is done per instance below.
      mesh.frustumCulled = false;
      mesh.count = 0;
      return mesh;
    };
    return {
      meshes: [
        make(tallPalmGeometry(), placements.tall.length),
        make(shortPalmGeometry(), placements.short.length),
      ],
      all: [placements.tall, placements.short],
      material,
      depth,
    };
  }, [placements]);
  useEffect(
    () => () => {
      for (const m of meshes) {
        m.geometry.dispose();
        m.dispose();
      }
      const mat = meshes[0]!.material as THREE.MeshStandardMaterial;
      mat.map?.dispose();
      mat.dispose();
      meshes[0]!.customDepthMaterial?.dispose();
    },
    [meshes],
  );

  // Low tier skips palm shadows (like leafy trees on Low/Medium).
  useEffect(() => {
    for (const m of meshes) m.castShadow = tier !== 'low';
  }, [meshes, tier]);

  const pits = useMemo(() => [...placements.tall, ...placements.short], [placements]);

  const last = useRef(-1);
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, clock }) => {
    palmUniforms.uTime.value = clock.elapsedTime;
    if (clock.elapsedTime - last.current < CULL_INTERVAL && last.current >= 0) return;
    last.current = clock.elapsedTime;
    const reach = STYLE.palms.visibleDistance[tier];
    const r2 = reach * reach;
    meshes.forEach((mesh, k) => {
      let count = 0;
      for (const m of all[k]!) {
        p.setFromMatrixPosition(m);
        const dx = p.x - camera.position.x;
        const dz = p.z - camera.position.z;
        if (dx * dx + dz * dz < r2) mesh.setMatrixAt(count++, m);
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    });
  });

  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      <TreePits trees={pits} />
    </group>
  );
}
