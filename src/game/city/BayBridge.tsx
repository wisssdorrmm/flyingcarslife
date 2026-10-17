import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { project } from './geo';

/** West span of the Bay Bridge: San Francisco anchorage → Yerba Buena Island (lat, lon). */
const SF_END = project(37.7885, -122.3878);
const YBI_END = project(37.8087, -122.3667);
/** Main towers along the span (fractions) and their height (m above water). */
const TOWERS = [0.16, 0.36, 0.64, 0.84];
const TOWER_H = 160;
const DECK_LOW = 22;
const DECK_HIGH = 58;
const DECK_W = 22;

/**
 * The Bay Bridge's western suspension span as a backdrop landmark (not drivable): a deck rising
 * from the city, four silver towers, main cables in catenaries between them and vertical hangers.
 */
export function BayBridge() {
  const { mesh, cables } = useMemo(() => {
    const [ax, az] = SF_END;
    const [bx, bz] = YBI_END;
    const len = Math.hypot(bx - ax, bz - az);
    const dirX = (bx - ax) / len;
    const dirZ = (bz - az) / len;
    const yaw = Math.atan2(dirX, dirZ);
    const at = (t: number) => new THREE.Vector3(ax + dirX * len * t, 0, az + dirZ * len * t);
    const deckY = (t: number) => DECK_LOW + (DECK_HIGH - DECK_LOW) * Math.min(1, t / 0.12);

    const parts: THREE.BufferGeometry[] = [];
    const box = (w: number, h: number, d: number, p: THREE.Vector3, y: number) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.rotateY(yaw);
      g.translate(p.x, y, p.z);
      parts.push(g);
    };
    // Deck in segments so it can rise from the anchorage.
    const segs = 40;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const p = at((t0 + t1) / 2);
      const y0 = deckY(t0);
      const y1 = deckY(t1);
      const g = new THREE.BoxGeometry(DECK_W, 4, (len / segs) * 1.02);
      g.rotateX(-Math.atan2(y1 - y0, len / segs));
      g.rotateY(yaw);
      g.translate(p.x, (y0 + y1) / 2, p.z);
      parts.push(g);
    }
    // Towers: two legs and cross beams each.
    for (const t of TOWERS) {
      const p = at(t);
      const side = new THREE.Vector3(dirZ, 0, -dirX).multiplyScalar(DECK_W / 2 - 1);
      for (const s of [-1, 1]) box(4, TOWER_H, 5, p.clone().addScaledVector(side, s), TOWER_H / 2);
      for (const y of [DECK_HIGH + 30, DECK_HIGH + 70, TOWER_H - 6]) box(DECK_W, 3.5, 3, p, y);
    }
    // Concrete anchorage on the SF side.
    box(DECK_W + 10, DECK_LOW + 10, 30, at(0), (DECK_LOW + 10) / 2);

    // Main cables (catenaries between tower tops, dipping to the deck between) and hangers.
    const cable: number[] = [];
    const side = new THREE.Vector3(dirZ, 0, -dirX).multiplyScalar(DECK_W / 2 - 1);
    const stops = [0.02, ...TOWERS, 0.98];
    for (const s of [-1, 1]) {
      for (let k = 0; k + 1 < stops.length; k++) {
        const t0 = stops[k]!;
        const t1 = stops[k + 1]!;
        const y0 = k === 0 ? deckY(t0) + 2 : TOWER_H - 2;
        const y1 = k + 1 === stops.length - 1 ? deckY(t1) + 2 : TOWER_H - 2;
        let prev: THREE.Vector3 | null = null;
        for (let i = 0; i <= 24; i++) {
          const u = i / 24;
          const t = t0 + (t1 - t0) * u;
          const sag = 4 * u * (1 - u) * (TOWER_H - DECK_HIGH - 10);
          const y = y0 + (y1 - y0) * u - sag;
          const p = at(t)
            .addScaledVector(side, s)
            .setY(Math.max(y, deckY(t) + 2));
          if (prev) cable.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
          // Hanger down to the deck.
          if (i % 2 === 0 && i > 0 && i < 24) cable.push(p.x, p.y, p.z, p.x, deckY(t), p.z);
          prev = p;
        }
      }
    }
    const geo = mergeGeometries(parts.map((g) => g.toNonIndexed()))!;
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: '#b7bec6', roughness: 0.45, metalness: 0.55 }),
    );
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    const cg = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(cable, 3),
    );
    const cables = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: '#8f979f' }));
    return { mesh, cables };
  }, []);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      cables.geometry.dispose();
      (cables.material as THREE.Material).dispose();
    },
    [mesh, cables],
  );
  return (
    <>
      <primitive object={mesh} />
      <primitive object={cables} />
    </>
  );
}
