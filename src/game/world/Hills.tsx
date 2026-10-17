/**
 * Dry brown hills ringing Harbor City, scattered with dark green trees, and the original
 * "HARBOR HILLS" hillside sign (CLAUDE.md §10). A low-poly far-distance backdrop: a few
 * thousand triangles and three draw calls. It hazes itself (scene fog would erase it), so far
 * ridges read soft and blue-grey without ever disappearing.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { STYLE, WORLD_LIGHTING } from '../config';
import { EXTENT } from './cityPlan';
import { seeded } from './rand';

const H = STYLE.hills;
/** Terrain starts just past the buildings that close off each road end. */
const FOOT = EXTENT + 70;

/**
 * Irregular ridge line around the ring: integer frequencies keep it seamless at 360°, uneven
 * spacing and phases keep it from looking like a regular saw.
 */
const RIDGE_OCTAVES: [freq: number, amp: number, phase: number][] = [
  [2, 0.3, 0.7],
  [3, 0.28, 2.1],
  [5, 0.2, 4.4],
  [8, 0.14, 1.3],
  [13, 0.09, 5.2],
  [21, 0.06, 3.3],
  [34, 0.035, 0.4],
];
function ringNoise(theta: number): number {
  let v = 0;
  for (const [f, amp, phase] of RIDGE_OCTAVES) v += amp * Math.sin(theta * f + phase);
  return v;
}

/** Ridge height around the ring: tallest behind the sign, low in the north across the harbor. */
function ridgeHeight(theta: number): number {
  const d = Math.atan2(Math.sin(theta - H.sign.angle), Math.cos(theta - H.sign.angle));
  const bump = Math.exp(-(d * d) / 0.5);
  const north = 0.45 + 0.55 * THREE.MathUtils.smoothstep(Math.sin(theta), -0.9, -0.2);
  const base = H.baseHeight + (H.peakHeight - H.baseHeight) * bump;
  return base * north * Math.max(0.35, 1 + 0.55 * ringNoise(theta));
}

/** Raw terrain height at angle θ and radius r (before the sign shelf is graded in). */
function rawHeight(theta: number, r: number): number {
  const s = THREE.MathUtils.clamp((r - FOOT) / (H.outerRadius - FOOT), 0, 1);
  const rise = THREE.MathUtils.smoothstep(s, 0.18, 0.72);
  const behind = 1 - 0.3 * THREE.MathUtils.smoothstep(s, 0.78, 1);
  // Gullies and spurs running down the slopes.
  const gully = 1 + 0.12 * Math.sin(theta * 61 + r * 0.01) * rise;
  return 0.05 + ridgeHeight(theta) * rise * behind * gully;
}

/** Height of the graded shelf the sign letters stand on. */
const SHELF = rawHeight(H.sign.angle, H.sign.radius);
/** Angular half-span of the sign plus a margin. */
const SIGN_SPAN = (H.sign.text.length * H.sign.letterHeight * 0.86) / 2 / H.sign.radius + 0.02;

/** Terrain height at angle θ and radius r, with a level shelf graded in under the sign. */
function hillHeight(theta: number, r: number): number {
  const raw = rawHeight(theta, r);
  const d = Math.abs(Math.atan2(Math.sin(theta - H.sign.angle), Math.cos(theta - H.sign.angle)));
  const across = 1 - THREE.MathUtils.smoothstep(d, SIGN_SPAN, SIGN_SPAN + 0.06);
  // Nothing in front of or under the letters may rise above the shelf, so the sign is never
  // hidden; behind them the slope climbs back gradually (past the next ring of vertices, or
  // the interpolated triangles would cut through the letters).
  const climb = THREE.MathUtils.smoothstep(r, H.sign.radius + 20, H.sign.radius + 140);
  const capped = Math.min(raw, THREE.MathUtils.lerp(SHELF, raw, climb));
  return THREE.MathUtils.lerp(raw, capped, across);
}

const ANGLE_SEGMENTS = 220;
const RINGS = 16;

function hillGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const dry = new THREE.Color('#8a7350');
  const straw = new THREE.Color('#a08a5e');
  const brush = new THREE.Color('#465029');
  const dirt = new THREE.Color('#7a6249');
  const c = new THREE.Color();
  const rand = seeded(99);
  for (let i = 0; i <= RINGS; i++) {
    const s = i / RINGS;
    // More rings near the foot, where the eye is closest.
    const r = FOOT + (H.outerRadius - FOOT) * s ** 1.3;
    for (let j = 0; j <= ANGLE_SEGMENTS; j++) {
      const theta = (j / ANGLE_SEGMENTS) * Math.PI * 2;
      const y = hillHeight(theta, r);
      pos.push(Math.cos(theta) * r, y, Math.sin(theta) * r);
      uv.push((Math.cos(theta) * r) / 40, (Math.sin(theta) * r) / 40);
      // Golden dry grass, darker chaparral in patches and gullies, bare dirt low down.
      const patch = 0.5 + 0.5 * Math.sin(theta * 37 + s * 9) * Math.cos(theta * 23 - s * 13);
      c.copy(dry).lerp(straw, rand() * 0.5);
      c.lerp(brush, THREE.MathUtils.smoothstep(patch, 0.55, 0.9) * 0.75);
      if (s < 0.2) c.lerp(dirt, 0.5 * (1 - s / 0.2));
      col.push(c.r, c.g, c.b);
    }
  }
  const row = ANGLE_SEGMENTS + 1;
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < ANGLE_SEGMENTS; j++) {
      const a = i * row + j;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Grass/scrub speckle so the slopes aren't flat colour when you fly close. */
function makeGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#c4baa6';
  ctx.fillRect(0, 0, 256, 256);
  const rand = seeded(5);
  for (let i = 0; i < 4000; i++) {
    const v = 150 + Math.floor(rand() * 105);
    ctx.fillStyle = `rgba(${v},${v - 10},${v - 30},0.5)`;
    ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 3, 1 + rand() * 3);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Blends the backdrop toward the sky haze by distance, in place of scene fog. */
function addHaze(mat: THREE.MeshStandardMaterial): void {
  const haze = new THREE.Color(WORLD_LIGHTING.fogColor);
  mat.fog = false;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.hazeColor = { value: haze };
    shader.uniforms.hazeDensity = { value: H.hazeDensity };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 hazeColor;\nuniform float hazeDensity;',
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `#include <opaque_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, 1.0 - exp(-hazeDensity * length(vViewPosition)));`,
      );
  };
  mat.customProgramCacheKey = () => 'hill-haze';
}

/** Low-poly oaks and scrub in groves over the slopes, read as dark specks from the city. */
function hillTrees(material: THREE.Material): THREE.InstancedMesh {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  geo.translate(0, 0.6, 0);
  const mesh = new THREE.InstancedMesh(geo, material, H.treeCount);
  const rand = seeded(314);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  const groves = Array.from({ length: Math.ceil(H.treeCount / 12) }, () => ({
    theta: rand() * Math.PI * 2,
    r: FOOT + 80 + rand() * (H.outerRadius - FOOT - 160),
  }));
  for (let i = 0; i < H.treeCount; i++) {
    const g = groves[Math.floor(rand() * groves.length)]!;
    const r = g.r + (rand() - 0.5) * 60;
    const theta = g.theta + ((rand() - 0.5) * 60) / r;
    const size = 2.5 + rand() * 3;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
    m.compose(
      new THREE.Vector3(Math.cos(theta) * r, hillHeight(theta, r) - 0.8, Math.sin(theta) * r),
      q,
      new THREE.Vector3(size, size * (0.7 + rand() * 0.4), size),
    );
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setHSL(0.22 + rand() * 0.06, 0.5, 0.012 + rand() * 0.014));
  }
  mesh.computeBoundingSphere();
  return mesh;
}

/** The hillside sign: free-standing white letters on the slope, facing the city. */
function signLetters(material: THREE.Material): THREE.Mesh {
  const text = H.sign.text;
  const chars = [...text].filter((ch) => ch !== ' ');
  const cell = 128;
  const canvas = document.createElement('canvas');
  canvas.width = cell * chars.length;
  canvas.height = cell;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#f2efe8';
  ctx.font = `900 ${cell * 0.95}px "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  chars.forEach((ch, i) => ctx.fillText(ch, i * cell + cell / 2, cell * 0.93));
  // Weathering: dust streaks so the letters aren't pristine.
  const rand = seeded(8);
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(140,120,95,${0.1 + rand() * 0.2})`;
    ctx.fillRect(rand() * canvas.width, rand() * cell, 1 + rand() * 2, 4 + rand() * 20);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  (material as THREE.MeshStandardMaterial).map = tex;

  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const h = H.sign.letterHeight;
  const w = h * 0.78;
  const pitch = h * 0.86;
  const theta0 = H.sign.angle;
  const R = H.sign.radius;
  // Facing the city: the letter plane's normal points back toward the center.
  const centerDir = new THREE.Vector3(-Math.cos(theta0), 0, -Math.sin(theta0));
  // Reading direction for someone in the city looking out at the sign.
  const tangent = new THREE.Vector3(-Math.sin(theta0), 0, Math.cos(theta0));
  let k = 0;
  [...text].forEach((ch, slot) => {
    if (ch === ' ') return;
    const offset = (slot - (text.length - 1) / 2) * pitch;
    const base = new THREE.Vector3(Math.cos(theta0) * R, 0, Math.sin(theta0) * R).addScaledVector(
      tangent,
      offset,
    );
    // All letters share the graded shelf, sunk a little so no gap shows under any of them.
    base.y = SHELF - 2;
    const left = base.clone().addScaledVector(tangent, -w / 2);
    const right = base.clone().addScaledVector(tangent, w / 2);
    const o = pos.length / 3;
    for (const p of [
      left,
      right,
      right.clone().setY(right.y + h + 2),
      left.clone().setY(left.y + h + 2),
    ]) {
      pos.push(p.x, p.y, p.z);
      nor.push(centerDir.x, centerDir.y, centerDir.z);
    }
    const u0 = k / chars.length;
    const u1 = (k + 1) / chars.length;
    uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    k++;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return new THREE.Mesh(g, material);
}

export function Hills() {
  const objects = useMemo(() => {
    const ground = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: makeGroundTexture(),
      roughness: 1,
      metalness: 0,
    });
    addHaze(ground);
    const foliage = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    addHaze(foliage);
    const letters = new THREE.MeshStandardMaterial({
      roughness: 0.8,
      metalness: 0,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    addHaze(letters);
    const hills = new THREE.Mesh(hillGeometry(), ground);
    hills.receiveShadow = true;
    return [hills, hillTrees(foliage), signLetters(letters)];
  }, []);
  useEffect(
    () => () => {
      for (const o of objects) {
        o.geometry.dispose();
        const mat = o.material as THREE.MeshStandardMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    },
    [objects],
  );
  return (
    <group>
      {objects.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
    </group>
  );
}
