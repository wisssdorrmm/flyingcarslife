import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { ROADS, type Road } from './cityPlan';
import { signBlades } from './furnitureLayout';

const BLADE = { w: 1.5, h: 0.3, d: 0.03 };

/** US-style green street-name blade texture. */
function bladeTexture(name: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 102;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#0b6b3a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#f4f6f2';
  ctx.lineWidth = 5;
  ctx.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
  ctx.fillStyle = '#f4f6f2';
  ctx.font = '600 60px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, canvas.width / 2, canvas.height / 2 + 3, canvas.width - 40);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Street-name blades on the signal poles: one instanced mesh per street. */
export function StreetSigns() {
  const meshes = useMemo(() => {
    const blades = signBlades();
    const geo = new THREE.BoxGeometry(BLADE.w, BLADE.h, BLADE.d);
    const edge = new THREE.MeshStandardMaterial({ color: '#0b6b3a', roughness: 0.5 });
    return ROADS.map((road: Road) => {
      const mine = blades.filter((b) => b.road === road);
      const face = new THREE.MeshStandardMaterial({
        map: bladeTexture(road.name),
        roughness: 0.45,
      });
      // BoxGeometry faces: +x, −x, +y, −y, +z, −z — the name is on both broad faces.
      const inst = new THREE.InstancedMesh(geo, [edge, edge, edge, edge, face, face], mine.length);
      mine.forEach((b, i) => {
        const m = new THREE.Matrix4().makeRotationY(b.rotY);
        m.setPosition(...b.position);
        inst.setMatrixAt(i, m);
      });
      inst.computeBoundingSphere();
      return inst;
    });
  }, []);

  useEffect(
    () => () => {
      meshes[0]?.geometry.dispose();
      for (const m of meshes) {
        for (const mat of m.material as THREE.MeshStandardMaterial[]) {
          mat.map?.dispose();
          mat.dispose();
        }
      }
    },
    [meshes],
  );

  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}
