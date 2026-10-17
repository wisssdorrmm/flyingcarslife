/**
 * Procedural cargo plane for the Sky Heist missions: a high-wing twin turboprop with fixed gear
 * (about 16 m long, 20 m span) in a fictional "BAYLINE CARGO" livery.
 * Local frame: +z forward, +y up, origin on the ground under the wing.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Fuselage axis height and the cargo door (on the −x side, behind the wing) in local space. */
export const FUSELAGE_Y = 1.75;
export const DOOR_LOCAL = new THREE.Vector3(-1.25, 0, -2.4);
/** Engine hubs (for the spinning propellers). */
export const PROP_HUBS = [new THREE.Vector3(3.1, 2.55, 3.36), new THREE.Vector3(-3.1, 2.55, 3.36)];
/** Collision box (half extents, center) around the fuselage and gear. */
export const PLANE_COLLIDER = { half: [1.15, 1.35, 7.6] as const, center: [0, 1.5, -0.6] as const };

/** Livery painted along the fuselage: u runs around it, v from tail (0) to nose (1). */
function liveryTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#f3f4f2';
  ctx.fillRect(0, 0, W, H);
  // u: 0 = bottom, 0.25 = right side, 0.5 = top, 0.75 = left side (lathe winding).
  const band = (u0: number, u1: number, color: string, v0 = 0, v1 = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(u0 * W, (1 - v1) * H, (u1 - u0) * W, (v1 - v0) * H);
  };
  // Grey belly, teal cheat lines on both sides.
  band(0.92, 1, '#b9bec3');
  band(0, 0.08, '#b9bec3');
  for (const side of [0.25, 0.75]) {
    band(side - 0.075, side - 0.04, '#1aa596', 0.08, 0.93);
    band(side - 0.035, side - 0.02, '#0d4f63', 0.08, 0.93);
  }
  // Cabin windows on both sides.
  ctx.fillStyle = '#1a2229';
  for (const side of [0.25, 0.75]) {
    for (let v = 0.36; v < 0.74; v += 0.055) {
      const x = (side + 0.012) * W;
      const y = (1 - v) * H;
      ctx.beginPath();
      ctx.roundRect(x - 9, y - 14, 18, 28, 7);
      ctx.fill();
    }
  }
  // Wrap-around cockpit windshield near the nose.
  ctx.fillStyle = '#141b21';
  ctx.beginPath();
  ctx.moveTo(0.22 * W, (1 - 0.865) * H);
  ctx.lineTo(0.78 * W, (1 - 0.865) * H);
  ctx.lineTo(0.7 * W, (1 - 0.915) * H);
  ctx.lineTo(0.3 * W, (1 - 0.915) * H);
  ctx.closePath();
  ctx.fill();
  // Cargo door outline on the left side.
  ctx.strokeStyle = '#5d6469';
  ctx.lineWidth = 3;
  ctx.strokeRect(0.705 * W, (1 - 0.43) * H, 0.075 * W, 0.11 * H);
  // Titles (fictional airline), one per side, reading nose-ward.
  ctx.fillStyle = '#0d4f63';
  ctx.font = '800 34px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  for (const [side, rot] of [
    [0.23, -Math.PI / 2],
    [0.77, Math.PI / 2],
  ] as const) {
    ctx.save();
    ctx.translate(side * W, (1 - 0.55) * H);
    ctx.rotate(rot);
    ctx.fillText('BAYLINE CARGO', 0, 12);
    ctx.restore();
  }
  // Light grime so it isn't showroom clean.
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(80,80,76,${0.03 + Math.random() * 0.05})`;
    ctx.fillRect(
      Math.random() * W,
      Math.random() * H,
      2 + Math.random() * 10,
      2 + Math.random() * 6,
    );
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Fuselage: a lathe along z, squared off a little, tail swept up. */
function fuselage(): THREE.BufferGeometry {
  const L = 15.6;
  const pts: THREE.Vector2[] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 = tail, 1 = nose
    let r: number;
    if (t < 0.32) r = 0.28 + 0.72 * Math.sin((t / 0.32) * Math.PI * 0.5);
    else if (t < 0.86) r = 1;
    else r = Math.sqrt(Math.max(0, 1 - ((t - 0.86) / 0.14) ** 2)) * 0.96 + 0.04;
    pts.push(new THREE.Vector2(Math.max(r, 0.001), t * L));
  }
  // Close the nose.
  pts[pts.length - 1] = new THREE.Vector2(0.001, L);
  const g = new THREE.LatheGeometry(pts, 24);
  // Lathe runs along +y; lay it along +z and center it.
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -L * 0.56);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    const z = pos.getZ(i);
    // Boxier cross-section, taller than wide.
    const a = Math.atan2(y, x);
    const sq = 1 + 0.08 * Math.cos(4 * a);
    x *= 1.05 * sq;
    y *= 1.2 * sq;
    // Upswept tail.
    const tail = THREE.MathUtils.clamp((-z - 3) / 5.5, 0, 1);
    y += tail * tail * 0.9;
    pos.setXYZ(i, x, y + FUSELAGE_Y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Thin airfoil slab: chord along z, thickness y, extruded along x over `span`. */
function airfoil(chord: number, thick: number, span: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -chord / 2);
  s.quadraticCurveTo(thick * 0.9, -chord * 0.1, thick * 0.35, chord / 2);
  s.lineTo(-thick * 0.1, chord / 2);
  s.quadraticCurveTo(-thick * 0.3, -chord * 0.1, 0, -chord / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: span, bevelEnabled: false, curveSegments: 6 });
  // Shape is in (x=thickness, y=chord); map to (y=thickness, z=chord), extrude along x.
  g.rotateY(Math.PI / 2);
  g.rotateX(Math.PI / 2);
  g.rotateY(Math.PI);
  g.translate(span / 2, 0, 0);
  return g;
}

export interface PlaneParts {
  body: THREE.BufferGeometry;
  white: THREE.BufferGeometry;
  metal: THREE.BufferGeometry;
  rubber: THREE.BufferGeometry;
  prop: THREE.BufferGeometry;
  disc: THREE.BufferGeometry;
}

export function planeGeometries(): PlaneParts {
  const white: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];
  const rubber: THREE.BufferGeometry[] = [];

  // Wing on top of the fuselage, slight dihedral.
  for (const side of [-1, 1]) {
    const w = airfoil(2.05, 0.32, 9.9);
    w.rotateZ(side * 0.03);
    w.translate(side * 4.95, 3.02, 0.6);
    white.push(w);
    // Struts from the lower fuselage to mid-wing.
    const strut = new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6);
    strut.rotateZ(side * -1.0);
    strut.translate(side * 2.0, 1.95, 0.4);
    metal.push(strut);
    // Engine nacelle under the wing, ahead of it.
    const nac = new THREE.CapsuleGeometry(0.38, 2.2, 4, 12);
    nac.rotateX(Math.PI / 2);
    nac.translate(side * 3.1, 2.55, 1.8);
    white.push(nac);
    // Main gear: strut and wheel.
    const leg = new THREE.CylinderGeometry(0.06, 0.06, 1.3, 6);
    leg.rotateZ(side * 0.7);
    leg.translate(side * 1.55, 0.75, -0.6);
    metal.push(leg);
    const wheel = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 16);
    wheel.rotateZ(Math.PI / 2);
    wheel.translate(side * 2.0, 0.42, -0.6);
    rubber.push(wheel);
  }
  // Nose gear.
  const nleg = new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6);
  nleg.translate(0, 0.75, 5.2);
  metal.push(nleg);
  const nwheel = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14);
  nwheel.rotateZ(Math.PI / 2);
  nwheel.translate(0, 0.32, 5.2);
  rubber.push(nwheel);
  // Tail: fin and stabilizer.
  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.lineTo(2.3, 0);
  fin.lineTo(1.0, 3.0);
  fin.lineTo(-0.1, 3.0);
  fin.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.16, bevelEnabled: false });
  finGeo.rotateY(-Math.PI / 2);
  finGeo.translate(0.08, FUSELAGE_Y + 1.35, -8.6);
  white.push(finGeo);
  const stab = airfoil(1.5, 0.16, 6.4);
  stab.translate(0, FUSELAGE_Y + 1.5, -7.9);
  white.push(stab);

  const prop = mergeGeometries(
    [0, 1, 2].map((k) => {
      const b = new THREE.BoxGeometry(0.16, 1.25, 0.04);
      b.translate(0, 0.62, 0);
      b.rotateZ((k / 3) * Math.PI * 2);
      return b;
    }),
  )!;
  const spinner = new THREE.ConeGeometry(0.16, 0.4, 10);
  spinner.rotateX(Math.PI / 2);
  spinner.translate(0, 0, 0.18);
  const disc = new THREE.CircleGeometry(1.3, 32);

  const flat = (list: THREE.BufferGeometry[]) =>
    mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  return {
    body: fuselage(),
    white: flat(white),
    metal: flat(metal),
    rubber: flat(rubber),
    prop: mergeGeometries([prop.toNonIndexed(), spinner.toNonIndexed()])!,
    disc,
  };
}

export interface PlaneMaterials {
  body: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  prop: THREE.MeshStandardMaterial;
  disc: THREE.MeshBasicMaterial;
}

export function planeMaterials(): PlaneMaterials {
  return {
    body: new THREE.MeshStandardMaterial({
      map: liveryTexture(),
      roughness: 0.32,
      metalness: 0.08,
    }),
    white: new THREE.MeshStandardMaterial({ color: '#eef0ee', roughness: 0.36, metalness: 0.08 }),
    metal: new THREE.MeshStandardMaterial({ color: '#8c9196', roughness: 0.45, metalness: 0.6 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#17181a', roughness: 0.9 }),
    prop: new THREE.MeshStandardMaterial({ color: '#2a2c2f', roughness: 0.5, metalness: 0.3 }),
    disc: new THREE.MeshBasicMaterial({
      color: '#c9ced3',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };
}
