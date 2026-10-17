import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { CURB_HEIGHT } from '../world/cityPlan';
import { cityPlaces, type Place } from './placement';

/** Fascia sign over the entrance, projecting blade sign beside it, and an awning. */
const FASCIA = { w: 4.2, h: 0.75, d: 0.18, y: 3.28, out: 0.3 };
const BLADE = { w: 0.7, h: 1.8, d: 0.08, y: 5.2, out: 0.75 };
const AWNING = { w: 3.0, depth: 1.25, y: 2.95, drop: 0.45 };

function signTexture(
  p: Place,
  width: number,
  height: number,
  vertical: boolean,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = p.sign.background;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = p.sign.accent;
  if (vertical) ctx.fillRect(0, 0, width, 10);
  else ctx.fillRect(0, height - 10, width, 10);
  ctx.fillStyle = p.sign.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = (px: number) => `700 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  if (vertical) {
    // Stack the name's words vertically on the blade.
    const words = p.name.replace(/—.*$/, '').trim().split(/\s+/).slice(0, 4);
    const size = Math.min(64, (height - 40) / words.length / 1.15);
    ctx.font = font(size);
    words.forEach((w, i) => {
      ctx.fillText(w, width / 2, 30 + (i + 0.5) * ((height - 40) / words.length), width - 16);
    });
  } else {
    const name = p.name.replace(/—.*$/, '').trim();
    ctx.font = font(Math.round(height * 0.5));
    ctx.fillText(name, width / 2, height * 0.42, width - 40);
    ctx.font = `500 ${Math.round(height * 0.16)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(p.tagline, width / 2, height * 0.78, width - 40);
    ctx.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function buildSigns(p: Place): THREE.Group {
  const group = new THREE.Group();
  const out = new THREE.Vector3(Math.sin(p.rotY), 0, Math.cos(p.rotY));
  const run = new THREE.Vector3(Math.cos(p.rotY), 0, -Math.sin(p.rotY));
  const edge = new THREE.MeshStandardMaterial({ color: p.sign.background, roughness: 0.5 });

  // Fascia: text on the outward face only; slightly emissive so it reads in shade (and at night).
  const fasciaTex = signTexture(p, 1024, 184, false);
  const fasciaFace = new THREE.MeshStandardMaterial({
    map: fasciaTex,
    emissiveMap: fasciaTex,
    emissive: '#ffffff',
    emissiveIntensity: 0.18,
    roughness: 0.4,
  });
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(FASCIA.w, FASCIA.h, FASCIA.d), [
    edge,
    edge,
    edge,
    edge,
    fasciaFace,
    edge,
  ]);
  fascia.position.copy(p.entrance).addScaledVector(out, FASCIA.out);
  fascia.position.y = CURB_HEIGHT + FASCIA.y;
  fascia.rotation.y = p.rotY;
  fascia.castShadow = true;
  group.add(fascia);

  // Projecting blade, perpendicular to the facade, readable from both directions along the street.
  const bladeTex = signTexture(p, 200, 512, true);
  const bladeFace = new THREE.MeshStandardMaterial({
    map: bladeTex,
    emissiveMap: bladeTex,
    emissive: '#ffffff',
    emissiveIntensity: 0.22,
    roughness: 0.4,
  });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(BLADE.w, BLADE.h, BLADE.d), [
    edge,
    edge,
    edge,
    edge,
    bladeFace,
    bladeFace,
  ]);
  blade.position
    .copy(p.entrance)
    .addScaledVector(run, -FASCIA.w / 2 - 0.2)
    .addScaledVector(out, BLADE.out);
  blade.position.y = CURB_HEIGHT + BLADE.y;
  blade.rotation.y = p.rotY + Math.PI / 2;
  blade.castShadow = true;
  group.add(blade);

  // Awning: a sloped panel over the door in the brand's accent color.
  const awningMat = new THREE.MeshStandardMaterial({
    color: p.sign.accent,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const slope = Math.atan2(AWNING.drop, AWNING.depth);
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(AWNING.w, 0.04, Math.hypot(AWNING.depth, AWNING.drop)),
    awningMat,
  );
  awning.position.copy(p.entrance).addScaledVector(out, AWNING.depth / 2 + 0.1);
  awning.position.y = CURB_HEIGHT + AWNING.y - AWNING.drop / 2;
  awning.rotation.set(0, p.rotY, 0);
  awning.rotateX(slope);
  awning.castShadow = true;
  group.add(awning);
  return group;
}

/** Storefront signage for every place in the city. */
export function PlaceSigns() {
  const groups = useMemo(() => cityPlaces().map(buildSigns), []);
  useEffect(
    () => () => {
      for (const g of groups) {
        g.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.geometry.dispose();
          for (const mat of [m.material].flat() as THREE.MeshStandardMaterial[]) {
            mat.map?.dispose();
            mat.dispose();
          }
        });
      }
    },
    [groups],
  );
  return (
    <>
      {groups.map((g, i) => (
        <primitive key={i} object={g} />
      ))}
    </>
  );
}
