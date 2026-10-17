/**
 * City generator: OSM + terrain (from fetch.ts) → streamed tiles in public/assets/city/.
 *   index.json        roads graph, streets, spawn, height grid, tile list
 *   map.json          2D footprints for the minimap / map screen
 *   tiles/<ix>_<iz>.bin  gzipped tile meshes + props (src/game/city/format.ts)
 * Run: npm run city:build   (optionally: npm run city:build -- --only=0,1 to write one tile)
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CITY_FORMAT_VERSION,
  emptyTileProps,
  TILE_SIZE,
  tileKey,
  type CityIndex,
  type AdBuilding,
  type CityMap,
  type HeightGrid,
  type RoadEdge,
  type TileEntry,
  type TileMeshName,
} from '../../src/game/city/format';
import { BBOX, ORIGIN, OUT_DIR, project } from './area';
import { buildBuildings, collectBuildings, type Building } from './buildings';
import {
  along,
  bufferLines,
  offset,
  rightOf,
  SegmentIndex,
  signedArea as signedAreaOf,
  union,
  type Poly,
  type Pt,
  type Ring,
} from './geom';
import { buildGround } from './ground';
import { buildMarkings } from './markings';
import { encodeTile, MeshBuilder } from './mesh';
import { areas, isClosed, loadOsm, parseMeters } from './parse';
import { buildProps, bucketProps, FootprintIndex } from './props';
import { buildRoads, type Road } from './roads';
import { loadHeightField } from './terrain';

const DECK = 3.0;
/** Curb-return radius at block corners. */
const CORNER_RADIUS = 4;

/** Even-odd scanline rasterization of polygons (all rings) into a 1 m mask. */
class Mask {
  data: Uint8Array;
  constructor(
    readonly x0: number,
    readonly z0: number,
    readonly nx: number,
    readonly nz: number,
  ) {
    this.data = new Uint8Array(nx * nz);
  }
  fill(polys: Poly[]): this {
    const rings: Ring[] = polys.flatMap((p) => [p.outer, ...p.holes]);
    const rows = new Map<number, number[]>();
    for (const r of rings) {
      for (let i = 0; i < r.length; i++) {
        const [ax, az] = r[i]!;
        const [bx, bz] = r[(i + 1) % r.length]!;
        if (az === bz) continue;
        const k0 = Math.ceil(Math.min(az, bz) - this.z0 - 0.5);
        const k1 = Math.floor(Math.max(az, bz) - this.z0 - 0.5);
        for (let k = Math.max(k0, 0); k <= Math.min(k1, this.nz - 1); k++) {
          const z = this.z0 + k + 0.5;
          if (z < az === z < bz) continue;
          const x = ax + ((z - az) / (bz - az)) * (bx - ax);
          let list = rows.get(k);
          if (!list) rows.set(k, (list = []));
          list.push(x);
        }
      }
    }
    for (const [k, xs] of rows) {
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const i0 = Math.max(0, Math.ceil(xs[i]! - this.x0 - 0.5));
        const i1 = Math.min(this.nx - 1, Math.floor(xs[i + 1]! - this.x0 - 0.5));
        for (let ii = i0; ii <= i1; ii++) this.data[k * this.nx + ii] = 1;
      }
    }
    return this;
  }
  dilate(r: number): this {
    const { nx, nz } = this;
    const src = this.data;
    const tmp = new Uint8Array(src.length);
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        let v = 0;
        for (let d = -r; d <= r && !v; d++) v = src[k * nx + Math.min(nx - 1, Math.max(0, i + d))]!;
        tmp[k * nx + i] = v;
      }
    }
    const out = new Uint8Array(src.length);
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        let v = 0;
        for (let d = -r; d <= r && !v; d++) v = tmp[Math.min(nz - 1, Math.max(0, k + d)) * nx + i]!;
        out[k * nx + i] = v;
      }
    }
    this.data = out;
    return this;
  }
  at(x: number, z: number): boolean {
    const i = Math.floor(x - this.x0);
    const k = Math.floor(z - this.z0);
    if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) return false;
    return this.data[k * this.nx + i] === 1;
  }
}

/** 4 m drivable-surface grid over a tile (one sample past each edge), Int16 centimeters. */
function tileHeightGrid(
  ix: number,
  iz: number,
  height: (x: number, z: number) => number,
): HeightGrid {
  const step = 4;
  const n = Math.round(TILE_SIZE / step) + 2;
  const x0 = ix * TILE_SIZE - step;
  const z0 = iz * TILE_SIZE - step;
  const data = new Int16Array(n * n);
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++)
      data[k * n + i] = Math.round(height(x0 + i * step, z0 + k * step) * 100);
  }
  return { x0, z0, step, nx: n, nz: n, data: Buffer.from(data.buffer).toString('base64') };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const dm = (r: Ring) => r.flatMap(([x, z]) => [Math.round(x * 10), Math.round(z * 10)]);

async function main(): Promise<void> {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  const t0 = performance.now();
  const lap = (msg: string) =>
    console.log(`${((performance.now() - t0) / 1000).toFixed(1)}s  ${msg}`);

  const hf = await loadHeightField(4);
  const osm = await loadOsm();
  lap(`loaded OSM (${osm.ways.size} ways) and terrain`);

  const net = buildRoads(osm);
  lap(
    `roads: ${net.edges.length} edges, ${net.junctions.size} nodes, ${net.trams.length} tram ways`,
  );

  // Layers.
  let asphalt = bufferLines(net.edges.map((e) => ({ pts: e.pts, half: e.road.width / 2 })));
  asphalt = offset(offset(asphalt, CORNER_RADIUS), -CORNER_RADIUS);
  const grass = union(
    areas(
      osm,
      (t) =>
        /^(park|garden|pitch|playground|dog_park|golf_course|common)$/.test(t.leisure ?? '') ||
        /^(grass|meadow|flowerbed|recreation_ground|village_green)$/.test(t.landuse ?? '') ||
        /^(wood|scrub|grassland)$/.test(t.natural ?? ''),
    ).map((a) => a.poly),
  );
  const sand = union(areas(osm, (t) => t.natural === 'beach').map((a) => a.poly));
  const pierLines: { pts: Ring; half: number }[] = [];
  for (const w of osm.ways.values()) {
    if (w.tags.man_made === 'pier' && !isClosed(w)) {
      pierLines.push({ pts: osm.pts(w), half: (parseMeters(w.tags.width) ?? 4) / 2 });
    }
  }
  const piers = union([
    ...areas(osm, (t) => t.man_made === 'pier').map((a) => a.poly),
    ...bufferLines(pierLines),
  ]);
  lap(`layers: asphalt ${asphalt.length} polys, grass ${grass.length}, piers ${piers.length}`);

  const mx0 = hf.x0;
  const mz0 = hf.z0;
  const mnx = (hf.nx - 1) * hf.step;
  const mnz = (hf.nz - 1) * hf.step;
  const pierMask = new Mask(mx0, mz0, mnx, mnz).fill(piers).dilate(2);
  const roadMask = new Mask(mx0, mz0, mnx, mnz).fill(asphalt);
  const nearRoad = new Mask(mx0, mz0, mnx, mnz).fill(asphalt).dilate(4);
  const terrain = hf.at;
  const height = (x: number, z: number) => {
    const h = hf.at(x, z);
    if (pierMask.at(x, z)) return Math.max(h, DECK);
    if (nearRoad.at(x, z)) return Math.max(h, 1.6);
    return h;
  };
  lap('masks');

  const roadIndex = new SegmentIndex<Road>();
  for (const e of net.edges) {
    for (let i = 1; i < e.pts.length; i++) roadIndex.add(e.pts[i - 1]!, e.pts[i]!, e.road);
  }
  const buildings = collectBuildings({ osm, height, terrain, roads: roadIndex });
  const footprints = union(buildings.map((b) => b.poly));
  lap(`buildings: ${buildings.length}`);

  const props = buildProps({
    osm,
    net,
    height,
    footprints: new FootprintIndex(buildings.map((b) => b.poly)),
    onRoad: (p) => roadMask.at(p[0], p[1]),
  });
  const tileOf = (x: number, z: number) =>
    tileKey(Math.floor(x / TILE_SIZE), Math.floor(z / TILE_SIZE));
  const propTiles = bucketProps(props, tileOf);
  lap(
    `props: ${props.trees.length} trees, ${props.lamps.length} lamps, ${props.signals.length} signals, ${props.parked.length} parked cars`,
  );

  // Graph nodes (needed by tiles: signal poles reference them).
  const nodeIndex = new Map<number, number>();
  const nodes: number[] = [];
  for (const j of net.junctions.values()) {
    nodeIndex.set(j.id, nodes.length / 3);
    nodes.push(
      Math.round(j.p[0] * 10) / 10,
      Math.round(height(...j.p) * 10) / 10,
      Math.round(j.p[1] * 10) / 10,
    );
  }
  for (const sig of props.signals) sig[4] = nodeIndex.get(sig[4]!) ?? -1;

  // Tiles.
  const [ax, az] = project(BBOX.north, BBOX.west);
  const [bx, bz] = project(BBOX.south, BBOX.east);
  const ix0 = Math.floor(ax / TILE_SIZE);
  const ix1 = Math.floor(bx / TILE_SIZE);
  const iz0 = Math.floor(az / TILE_SIZE);
  const iz1 = Math.floor(bz / TILE_SIZE);
  const byTile = new Map<string, Building[]>();
  for (const b of buildings) {
    const k = tileOf(b.c[0], b.c[1]);
    let list = byTile.get(k);
    if (!list) byTile.set(k, (list = []));
    list.push(b);
  }
  const tilesDir = join(OUT_DIR, 'tiles');
  if (!only) await rm(tilesDir, { recursive: true, force: true });
  await mkdir(tilesDir, { recursive: true });
  const entries: TileEntry[] = [];
  let total = 0;
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const key = tileKey(ix, iz);
      if (only && only !== `${ix},${iz}`) continue;
      const g = buildGround(
        ix,
        iz,
        { asphalt, grass, sand, piers, buildings: footprints },
        height,
        terrain,
      );
      const inTile = (p: Pt) => tileOf(p[0], p[1]) === key;
      const meshes: Partial<Record<TileMeshName, MeshBuilder>> = {
        ...g,
        markings: buildMarkings(net.edges, net.trams, height, inTile),
        buildings: buildBuildings(byTile.get(key) ?? [], { height, terrain, roads: roadIndex }),
      };
      const tp = propTiles.get(key) ?? emptyTileProps();
      const tris = Object.values(meshes).reduce((s, m) => s + m.idx.length / 3, 0);
      if (!tris) continue;
      const bin = encodeTile(
        ix,
        iz,
        meshes,
        tp,
        ['asphalt', 'pavement', 'grass', 'sand', 'curb', 'pier', 'buildings'],
        tileHeightGrid(ix, iz, height),
      );
      const file = `tiles/${key}.bin`;
      await writeFile(join(OUT_DIR, file), bin);
      entries.push({ ix, iz, file, bytes: bin.length });
      total += bin.length;
      lap(`tile ${key}: ${Math.round(tris / 1000)}k tris, ${(bin.length / 1e6).toFixed(2)} MB`);
    }
  }
  if (only) return;

  // Index: streets, edges, spawn, height grid.
  const streets = [...new Set(net.edges.map((e) => e.road.name).filter(Boolean))].sort();
  const streetId = new Map(streets.map((s, i) => [s, i]));
  const edges: RoadEdge[] = net.edges.map((e) => ({
    a: nodeIndex.get(e.a)!,
    b: nodeIndex.get(e.b)!,
    name: streetId.get(e.road.name) ?? -1,
    cls: e.road.cls,
    oneway: e.road.oneway,
    lanes: e.road.lanes,
    lanesFwd: e.road.lanesFwd,
    laneOffset: Math.round(e.road.laneOffset * 100) / 100,
    width: Math.round(e.road.width * 10) / 10,
    bus: net.busWays.has(e.road.wayId),
    pts: e.pts.flatMap(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]),
    length: Math.round(e.length * 10) / 10,
  }));

  // Spawn: on Columbus Avenue by Washington Square, in the right-hand travel lane.
  const target: Pt = [150, 300];
  let best = net.edges[0]!;
  let bestD = Infinity;
  for (const e of net.edges) {
    if (e.road.name !== 'Columbus Avenue' || e.length < 40) continue;
    const { p } = along(e.pts, e.length / 2);
    const d = Math.hypot(p[0] - target[0], p[1] - target[1]);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  const { p: sp, dir: sd } = along(best.pts, best.length / 2);
  // Rightmost travel lane.
  const r = best.road;
  const lane = r.laneOffset + (r.oneway ? r.lanes / 2 - 0.5 : r.lanesFwd - 0.5) * 3.2;
  const rt = rightOf(sd);
  const spawnX = sp[0] + rt[0] * lane;
  const spawnZ = sp[1] + rt[1] * lane;

  const step = 8;
  const hx0 = hf.x0;
  const hz0 = hf.z0;
  const hnx = Math.floor(((hf.nx - 1) * hf.step) / step) + 1;
  const hnz = Math.floor(((hf.nz - 1) * hf.step) / step) + 1;
  const hdata = new Int16Array(hnx * hnz);
  for (let k = 0; k < hnz; k++) {
    for (let i = 0; i < hnx; i++)
      hdata[k * hnx + i] = Math.round(height(hx0 + i * step, hz0 + k * step) * 10);
  }

  // Ad buildings: tall, large buildings with a long wall facing a road, spread across the map.
  const candidates: AdBuilding[] = [];
  const scores = new Map<string, number>();
  for (const b of buildings) {
    if (b.height < 14) continue;
    const ring = b.poly.outer;
    const side = signedAreaOf(ring) > 0 ? 1 : -1;
    let best: { a: Pt; c: Pt; n: Pt; len: number; road: Road } | null = null;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const c = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 11) continue;
      const dx = (c[0] - a[0]) / len;
      const dz = (c[1] - a[1]) / len;
      const n: Pt = side > 0 ? [dz, -dx] : [-dz, dx];
      const mid: Pt = [(a[0] + c[0]) / 2 + n[0] * 1.5, (a[1] + c[1]) / 2 + n[1] * 1.5];
      const hit = roadIndex.nearest(mid, 26);
      if (!hit || hit.d - hit.data.width / 2 > 9) continue;
      if (!best || len > best.len) best = { a, c, n, len, road: hit.data };
    }
    if (!best) continue;
    const gMin = Math.min(...ring.map(([x, z]) => height(x, z)));
    const id = String(b.id);
    candidates.push({
      id,
      name: b.name,
      ax: r1(best.a[0]),
      az: r1(best.a[1]),
      bx: r1(best.c[0]),
      bz: r1(best.c[1]),
      nx: r3(best.n[0]),
      nz: r3(best.n[1]),
      base: r1(gMin),
      top: r1(height(b.c[0], b.c[1]) + b.height),
      street: best.road.name,
    });
    scores.set(id, b.height * best.len * (best.road.cls === 'major' ? 1.6 : best.road.cls === 'minor' ? 1.3 : 1));
  }
  candidates.sort((p, q) => scores.get(q.id)! - scores.get(p.id)!);
  const adBuildings: AdBuilding[] = [];
  for (const c of candidates) {
    const cx = (c.ax + c.bx) / 2;
    const cz = (c.az + c.bz) / 2;
    if (adBuildings.some((o) => Math.hypot((o.ax + o.bx) / 2 - cx, (o.az + o.bz) / 2 - cz) < 110)) continue;
    adBuildings.push(c);
    if (adBuildings.length >= 80) break;
  }
  lap(`ad buildings: ${adBuildings.length}`);

  const index: CityIndex = {
    version: CITY_FORMAT_VERSION,
    tileSize: TILE_SIZE,
    origin: { ...ORIGIN },
    bounds: { x0: ax, z0: az, x1: bx, z1: bz },
    tiles: entries,
    spawn: {
      x: Math.round(spawnX * 100) / 100,
      y: Math.round(height(spawnX, spawnZ) * 100) / 100,
      z: Math.round(spawnZ * 100) / 100,
      heading: Math.atan2(sd[0], sd[1]),
    },
    streets,
    nodes,
    edges,
    adBuildings,
    signals: [...net.junctions.values()].filter((j) => j.signal).map((j) => nodeIndex.get(j.id)!),
    height: {
      x0: hx0,
      z0: hz0,
      step,
      nx: hnx,
      nz: hnz,
      data: Buffer.from(hdata.buffer).toString('base64'),
    },
  };
  await writeFile(join(OUT_DIR, 'index.json'), JSON.stringify(index));

  const map: CityMap = {
    buildings: buildings.map((b) => dm(b.poly.outer)),
    parks: grass.map((p) => dm(p.outer)),
    piers: piers.map((p) => dm(p.outer)),
  };
  await writeFile(join(OUT_DIR, 'map.json'), JSON.stringify(map));
  lap(`done: ${entries.length} tiles, ${(total / 1e6).toFixed(1)} MB; ${streets.length} streets`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
