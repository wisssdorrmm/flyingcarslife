import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import type { Collider, RigidBody } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CITY_STREAMING } from '../config';
import { useSettings } from '../store/settings';
import { trafficRef } from '../traffic/trafficSim';
import { vehicleState } from '../vehicles/vehicleState';
import { useCityMaterials } from './cityMaterials';
import {
  loadTile,
  preloadedTiles,
  registerTileHeights,
  tileDistance,
  type City,
  type DecodedTile,
} from './cityData';
import { tileKey, type TileEntry, type TileMeshName } from './format';
import {
  coneGeometry,
  lampGeometry,
  parkedCarGeometries,
  PARKED_PAINTS,
  signalGeometries,
  treeGeometries,
} from './propModels';

interface Tile {
  entry: TileEntry;
  key: string;
  data: DecodedTile | null;
  abort: AbortController | null;
  group: THREE.Group | null;
  colliders: Collider[] | null;
  /** Knockable cones (dynamic bodies) while the tile has physics. */
  cones: RigidBody[] | null;
}

/** Signal head centers in the pole's frame (see propModels.signalGeometries). */
const SIGNAL_HEADS: [number, number, number][] = [
  [-4.6, 5.3, 0.05 + 0.14],
  [0, 3.2, 0.2 + 0.14],
];
const LAMP_COLOR = new THREE.Color();
const LAMP_BASE = new THREE.Vector3();

const SHADOW_CASTERS: TileMeshName[] = ['buildings', 'pier'];

/**
 * Streams city tiles around the player's car (or the camera): meshes within the quality tier's
 * view radius, trimesh colliders within a short physics radius, and every tile's props in shared
 * instanced meshes (a fixed handful of draw calls however many tiles are loaded).
 */
export function CityTiles({ city, onReady }: { city: City; onReady?: () => void }) {
  const mats = useCityMaterials();
  const quality = useSettings((s) => s.quality);
  const { world, rapier } = useRapier();
  const root = useRef<THREE.Group>(null);
  const tiles = useRef(new Map<string, Tile>());
  const loading = useRef(0);
  const propsDirty = useRef(true);
  const focus = useMemo(() => new THREE.Vector3(), []);
  const last = useRef(-1);
  const size = city.index.tileSize;
  const baseRadius = CITY_STREAMING.viewRadius[quality.tier];

  /** Fixed body holding every tile collider (created in the mount effect below). */
  const bodyRef = useRef<RigidBody | null>(null);

  const props = useMemo(() => {
    const tree = treeGeometries();
    const signal = signalGeometries();
    const car = parkedCarGeometries();
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, shadow: boolean) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = shadow;
      m.receiveShadow = true;
      return m;
    };
    const metal = new THREE.MeshStandardMaterial({
      color: '#5d6266',
      roughness: 0.5,
      metalness: 0.6,
    });
    const shadows = quality.tier !== 'low';
    const p = {
      trunk: mk(
        tree.trunk,
        new THREE.MeshStandardMaterial({ color: '#6b5440', roughness: 1 }),
        6000,
        shadows,
      ),
      canopy: mk(
        tree.canopy,
        new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
        6000,
        shadows,
      ),
      lamp: mk(lampGeometry(), metal, 3000, false),
      signalPole: mk(signal.pole, metal, 1500, false),
      signalHead: mk(
        signal.heads,
        new THREE.MeshStandardMaterial({ color: '#2b2d2a', roughness: 0.6 }),
        1500,
        false,
      ),
      // One lit lamp per signal head (two heads per pole); color and slot set from the phase.
      signalLamp: mk(
        new THREE.CircleGeometry(0.12, 12),
        new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
        3000,
        false,
      ),
      carBody: mk(
        car.body,
        new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.3 }),
        4000,
        shadows,
      ),
      carGlass: mk(
        car.glass,
        new THREE.MeshStandardMaterial({ color: '#101418', roughness: 0.08, metalness: 0.2 }),
        4000,
        false,
      ),
      carWheels: mk(
        car.wheels,
        new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.8 }),
        4000,
        false,
      ),
      cone: mk(
        coneGeometry(),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
        800,
        false,
      ),
      wirePole: mk(
        new THREE.CylinderGeometry(0.1, 0.13, 6.6, 6).translate(0, 3.3, 0),
        metal,
        3000,
        false,
      ),
      wires: new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: '#25272a', transparent: true, opacity: 0.85 }),
      ),
    };
    p.wires.frustumCulled = false;
    return p;
  }, [quality.tier]);
  useEffect(
    () => () => {
      for (const v of Object.values(props)) {
        v.geometry.dispose();
        (v.material as THREE.Material).dispose();
      }
    },
    [props],
  );

  const addColliders = (t: Tile) => {
    const body = bodyRef.current;
    if (t.colliders || !t.data || !body) return;
    const { header, geometries } = t.data;
    const verts: number[] = [];
    const idx: number[] = [];
    for (const name of header.colliders) {
      const g = geometries[name];
      if (!g) continue;
      const base = verts.length / 3;
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) verts.push(p.getX(i), p.getY(i), p.getZ(i));
      const index = g.getIndex()!;
      for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
    }
    const list: Collider[] = [];
    if (idx.length) {
      list.push(
        world.createCollider(
          rapier.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(idx)),
          body,
        ),
      );
    }
    const q = new THREE.Quaternion();
    for (const [x, y, z, rot] of header.props.parked) {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rot!);
      list.push(
        world.createCollider(
          rapier.ColliderDesc.cuboid(0.88, 0.6, 2.2)
            .setTranslation(x!, y! + 0.62, z!)
            .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
          body,
        ),
      );
    }
    t.colliders = list;
    // Cones: light dynamic bodies, with CCD so a fast car can't skip through them.
    t.cones = (header.props.cones ?? []).map(([x, y, z]) => {
      const cone = world.createRigidBody(
        rapier.RigidBodyDesc.dynamic()
          .setTranslation(x!, y! + 0.02, z!)
          .setLinearDamping(0.4)
          .setAngularDamping(0.6)
          .setCcdEnabled(true),
      );
      world.createCollider(
        rapier.ColliderDesc.cone(0.34, 0.17).setTranslation(0, 0.38, 0).setMass(2.5),
        cone,
      );
      world.createCollider(
        rapier.ColliderDesc.cuboid(0.19, 0.02, 0.19).setTranslation(0, 0.02, 0).setMass(1),
        cone,
      );
      cone.sleep();
      return cone;
    });
  };
  const removeColliders = (t: Tile) => {
    if (bodyRef.current) for (const c of t.colliders ?? []) world.removeCollider(c, false);
    t.colliders = null;
    for (const c of t.cones ?? []) world.removeRigidBody(c);
    t.cones = null;
  };

  const show = (t: Tile, data: DecodedTile) => {
    t.data = data;
    const g = new THREE.Group();
    g.name = `tile ${t.key}`;
    for (const [name, geo] of Object.entries(data.geometries) as [
      TileMeshName,
      THREE.BufferGeometry,
    ][]) {
      const mesh = new THREE.Mesh(geo, mats[name]);
      mesh.name = name;
      mesh.receiveShadow = true;
      mesh.castShadow = quality.shadows && SHADOW_CASTERS.includes(name);
      mesh.matrixAutoUpdate = false;
      g.add(mesh);
    }
    t.group = g;
    root.current?.add(g);
    registerTileHeights(t.key, data.header);
    propsDirty.current = true;
  };

  const unload = (t: Tile) => {
    t.abort?.abort();
    removeColliders(t);
    if (t.group) {
      root.current?.remove(t.group);
      for (const m of t.group.children) (m as THREE.Mesh).geometry.dispose();
    }
    tiles.current.delete(t.key);
    registerTileHeights(t.key, null);
    propsDirty.current = true;
  };

  // New materials (quality change): swap them in place, keeping meshes and colliders.
  useEffect(() => {
    for (const t of tiles.current.values()) {
      for (const child of t.group?.children ?? []) {
        const mesh = child as THREE.Mesh;
        mesh.material = mats[mesh.name as TileMeshName];
      }
    }
  }, [mats]);

  const rebuildProps = () => {
    signalList.current = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = THREE.Object3D.DEFAULT_UP;
    const col = new THREE.Color();
    const counts: Record<string, number> = {};
    const put = (
      key: keyof typeof props,
      x: number,
      y: number,
      z: number,
      rot: number,
      scale = 1,
      color?: THREE.Color,
    ) => {
      const mesh = props[key];
      if (!(mesh instanceof THREE.InstancedMesh)) return;
      const i = counts[key] ?? 0;
      if (i >= mesh.instanceMatrix.count) return;
      q.setFromAxisAngle(up, rot);
      mesh.setMatrixAt(i, m4.compose(p.set(x, y, z), q, s.setScalar(scale)));
      if (color) mesh.setColorAt(i, color);
      counts[key] = i + 1;
    };
    const wire: number[] = [];
    for (const t of tiles.current.values()) {
      if (!t.data) continue;
      const pr = t.data.header.props;
      for (const [x, y, z, sc, rot] of pr.trees) {
        put('trunk', x!, y!, z!, rot!, sc);
        // Slight per-tree green variation.
        const h = Math.sin(x! * 12.9898 + z! * 78.233) * 43758.5453;
        col.setHSL(0.24 + (h - Math.floor(h)) * 0.06, 0.42, 0.33 + (h - Math.floor(h)) * 0.08);
        put('canopy', x!, y!, z!, rot!, sc, col);
      }
      for (const [x, y, z, rot] of pr.lamps) put('lamp', x!, y!, z!, rot!);
      for (const sig of pr.signals) {
        const [x, y, z, rot] = sig;
        put('signalPole', x!, y!, z!, rot!);
        put('signalHead', x!, y!, z!, rot!);
        signalList.current.push(sig);
      }
      for (const [x, y, z, rot, paint] of pr.parked) {
        put('carBody', x!, y!, z!, rot!, 1, PARKED_PAINTS[paint! % PARKED_PAINTS.length]);
        put('carGlass', x!, y!, z!, rot!);
        put('carWheels', x!, y!, z!, rot!);
      }
      for (const [x, y, z] of pr.wirePoles) put('wirePole', x!, y!, z!, 0);
      for (const line of pr.wires) {
        for (let i = 3; i < line.length; i += 3) {
          wire.push(line[i - 3]!, line[i - 2]!, line[i - 1]!, line[i]!, line[i + 1]!, line[i + 2]!);
        }
      }
    }
    for (const [key, mesh] of Object.entries(props)) {
      if (!(mesh instanceof THREE.InstancedMesh)) continue;
      mesh.count = counts[key] ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    props.wires.geometry.dispose();
    props.wires.geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(wire, 3),
    );
  };

  /** Loads what's in range of (x, z), nearest first; drops what's well out of range. */
  const stream = (x: number, z: number) => {
    const viewRadius = baseRadius + (vehicleState.active?.flying ? CITY_STREAMING.flyingBonus : 0);
    const wanted = city.index.tiles
      .map((e) => ({ e, d: tileDistance(e, size, x, z) }))
      .filter((w) => w.d < viewRadius)
      .sort((a, b) => a.d - b.d);
    for (const { e } of wanted) {
      const key = tileKey(e.ix, e.iz);
      if (tiles.current.has(key)) continue;
      const t: Tile = {
        entry: e,
        key,
        data: null,
        abort: null,
        group: null,
        colliders: null,
        cones: null,
      };
      tiles.current.set(key, t);
      const pre = preloadedTiles.get(key);
      if (pre) {
        preloadedTiles.delete(key);
        show(t, pre);
        continue;
      }
      if (loading.current >= CITY_STREAMING.maxConcurrentLoads) {
        tiles.current.delete(key);
        continue;
      }
      loading.current++;
      t.abort = new AbortController();
      loadTile(e.file, t.abort.signal)
        .then((data) => {
          if (tiles.current.get(key) === t) show(t, data);
          else for (const g of Object.values(data.geometries)) g.dispose();
        })
        .catch((err: unknown) => {
          if ((err as Error).name !== 'AbortError') console.warn('city tile', key, err);
          if (tiles.current.get(key) === t) tiles.current.delete(key);
        })
        .finally(() => {
          loading.current--;
          t.abort = null;
        });
    }
    for (const t of [...tiles.current.values()]) {
      const d = tileDistance(t.entry, size, x, z);
      if (d > viewRadius + CITY_STREAMING.unloadMargin) unload(t);
      else if (t.data && d < CITY_STREAMING.physicsRadius) addColliders(t);
      else if (d > CITY_STREAMING.physicsRadius + 60) removeColliders(t);
    }
  };

  // Mount: the tiles around the spawn (already decoded) and their colliders must exist before the
  // first physics step, since the first frame after loading can run many catch-up steps. Creation
  // and teardown live in one effect so React StrictMode's mount → unmount → mount stays consistent.
  useLayoutEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    bodyRef.current = body;
    // Invisible walls around the mapped area (tall enough for flying cars later).
    const b = city.index.bounds;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const hx = (b.x1 - b.x0) / 2;
    const hz = (b.z1 - b.z0) / 2;
    for (const [x, z, sx, sz] of [
      [cx, b.z0 - 1, hx + 2, 1],
      [cx, b.z1 + 1, hx + 2, 1],
      [b.x0 - 1, cz, 1, hz + 2],
      [b.x1 + 1, cz, 1, hz + 2],
    ] as const) {
      world.createCollider(rapier.ColliderDesc.cuboid(sx, 300, sz).setTranslation(x, 150, z), body);
    }
    const { x, z } = city.index.spawn;
    stream(x, z);
    rebuildProps();
    propsDirty.current = false;
    onReady?.();
    const map = tiles.current;
    return () => {
      for (const t of [...map.values()]) unload(t);
      if (bodyRef.current) world.removeRigidBody(bodyRef.current);
      bodyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per city / physics world
  }, [city, world, rapier]);

  // Signal lamps: refreshed a few times a second from the traffic sim's phases.
  const signalList = useRef<number[][]>([]);
  const lampTimer = useRef(0);
  const updateLamps = (dt: number) => {
    lampTimer.current -= dt;
    if (lampTimer.current > 0) return;
    lampTimer.current = 0.25;
    const mesh = props.signalLamp;
    const sim = trafficRef.sim;
    let n = 0;
    for (const [x, y, z, rot, node, edge] of signalList.current) {
      const light =
        sim && node !== undefined && node >= 0 ? sim.signals.light(node, edge!, sim.time) : 'green';
      const slot = light === 'red' ? 0.33 : light === 'yellow' ? 0 : -0.33;
      LAMP_COLOR.set(light === 'red' ? '#ff2a1f' : light === 'yellow' ? '#ffb31a' : '#2bff7a');
      coneQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rot!);
      // The two heads: on the mast arm over the road, and low on the pole.
      for (const [hx, hy, hz] of SIGNAL_HEADS) {
        coneP
          .set(hx, hy + slot, hz + 0.15)
          .applyQuaternion(coneQ)
          .add(LAMP_BASE.set(x!, y!, z!));
        if (n >= mesh.instanceMatrix.count) break;
        mesh.setMatrixAt(n, coneMatrix.compose(coneP, coneQ, one));
        mesh.setColorAt(n, LAMP_COLOR);
        n++;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  // Cones follow their bodies where tiles have physics, and stand at their spots elsewhere.
  const coneMatrix = useMemo(() => new THREE.Matrix4(), []);
  const coneQ = useMemo(() => new THREE.Quaternion(), []);
  const coneP = useMemo(() => new THREE.Vector3(), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const updateCones = () => {
    const mesh = props.cone;
    let n = 0;
    for (const t of tiles.current.values()) {
      if (!t.data) continue;
      const spots = t.data.header.props.cones ?? [];
      for (let i = 0; i < spots.length && n < mesh.instanceMatrix.count; i++) {
        const body = t.cones?.[i];
        if (body) {
          const p = body.translation();
          const r = body.rotation();
          coneP.set(p.x, p.y, p.z);
          coneQ.set(r.x, r.y, r.z, r.w);
        } else {
          const [x, y, z] = spots[i]!;
          coneP.set(x!, y!, z!);
          coneQ.identity();
        }
        mesh.setMatrixAt(n++, coneMatrix.compose(coneP, coneQ, one));
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  };

  useFrame(({ camera, clock }, dt) => {
    updateCones();
    updateLamps(dt);
    if (clock.elapsedTime - last.current < CITY_STREAMING.checkInterval && !propsDirty.current)
      return;
    if (clock.elapsedTime - last.current >= CITY_STREAMING.checkInterval) {
      last.current = clock.elapsedTime;
      const obj = vehicleState.active?.object;
      if (obj) obj.getWorldPosition(focus);
      else focus.copy(camera.position);

      stream(focus.x, focus.z);
    }
    if (propsDirty.current) {
      propsDirty.current = false;
      rebuildProps();
    }
  });

  return (
    <group ref={root}>
      {Object.entries(props).map(([k, obj]) => (
        <primitive key={k} object={obj} />
      ))}
    </group>
  );
}
