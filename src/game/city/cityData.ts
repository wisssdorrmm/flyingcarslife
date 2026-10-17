/**
 * Loads the generated city (scripts/osm/build.ts): the index (road graph, height grid, tile list)
 * and individual tiles, decoded into three.js geometry.
 */
import * as THREE from 'three';
import { create } from 'zustand';
import { assetUrl } from '../../lib/assets';
import { RoadGraph } from './roadGraph';
import {
  tileKey,
  CITY_FORMAT_VERSION,
  TILE_MAGIC,
  type AttrInfo,
  type CityIndex,
  type CityMap,
  type TileEntry,
  type TileHeader,
  type TileMeshName,
} from './format';

export interface City {
  index: CityIndex;
  graph: RoadGraph;
  /** Drivable-surface height (m) at world x/z, bilinear over the index's height grid. */
  heightAt(x: number, z: number): number;
}

interface CityState {
  city: City | null;
}

/** The loaded city, for UI (minimap, map) and systems that start before the scene. */
export const useCity = create<CityState>()(() => ({ city: null }));

/** Reports a fetch to three's loading manager so the loading screen waits for it. */
async function tracked<T>(url: string, run: () => Promise<T>): Promise<T> {
  const m = THREE.DefaultLoadingManager;
  m.itemStart(url);
  try {
    return await run();
  } catch (err) {
    m.itemError(url);
    throw err;
  } finally {
    m.itemEnd(url);
  }
}

interface FineGrid {
  x0: number;
  z0: number;
  step: number;
  nx: number;
  nz: number;
  data: Int16Array;
}

/** Fine height grids of the tiles currently loaded (registered by CityTiles). */
const tileHeights = new Map<string, FineGrid>();

function sampleGrid(g: FineGrid, x: number, z: number): number {
  const fx = Math.min(Math.max((x - g.x0) / g.step, 0), g.nx - 1.001);
  const fz = Math.min(Math.max((z - g.z0) / g.step, 0), g.nz - 1.001);
  const i = Math.floor(fx);
  const k = Math.floor(fz);
  const u = fx - i;
  const v = fz - k;
  const d = g.data;
  const n = g.nx;
  return (
    (d[k * n + i]! * (1 - u) * (1 - v) +
      d[k * n + i + 1]! * u * (1 - v) +
      d[(k + 1) * n + i]! * (1 - u) * v +
      d[(k + 1) * n + i + 1]! * u * v) /
    100
  );
}

export function registerTileHeights(key: string, header: TileHeader | null): void {
  if (!header?.height) {
    tileHeights.delete(key);
    return;
  }
  const h = header.height;
  const bin = Uint8Array.from(atob(h.data), (c) => c.charCodeAt(0));
  tileHeights.set(key, { ...h, data: new Int16Array(bin.buffer) });
}

let cityPromise: Promise<City> | null = null;

/** Fetches the city index once. */
export function loadCity(): Promise<City> {
  const url = assetUrl('city/index.json');
  cityPromise ??= tracked(url, async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`city index: HTTP ${res.status} (run npm run city:build)`);
    const index = (await res.json()) as CityIndex;
    if (index.version !== CITY_FORMAT_VERSION) {
      throw new Error(`city format ${index.version}, expected ${CITY_FORMAT_VERSION}`);
    }
    const { x0, z0, step, nx, nz } = index.height;
    const bin = Uint8Array.from(atob(index.height.data), (c) => c.charCodeAt(0));
    const grid = new Int16Array(bin.buffer);
    const heightAt = (x: number, z: number) => {
      const fx = Math.min(Math.max((x - x0) / step, 0), nx - 1.001);
      const fz = Math.min(Math.max((z - z0) / step, 0), nz - 1.001);
      const i = Math.floor(fx);
      const k = Math.floor(fz);
      const u = fx - i;
      const v = fz - k;
      const g = (ii: number, kk: number) => grid[kk * nx + ii]! / 10;
      return (
        g(i, k) * (1 - u) * (1 - v) +
        g(i + 1, k) * u * (1 - v) +
        g(i, k + 1) * (1 - u) * v +
        g(i + 1, k + 1) * u * v
      );
    };
    // Prefer the loaded tile's fine grid; fall back to the coarse index grid.
    const size = index.tileSize;
    const fineOrCoarse = (x: number, z: number) => {
      const fine = tileHeights.get(tileKey(Math.floor(x / size), Math.floor(z / size)));
      return fine ? sampleGrid(fine, x, z) : heightAt(x, z);
    };
    const city: City = { index, graph: new RoadGraph(index), heightAt: fineOrCoarse };
    useCity.setState({ city });
    return city;
  });
  return cityPromise;
}

let mapPromise: Promise<CityMap> | null = null;
/** 2D footprints for the map layers (loaded on first use). */
export function loadCityMap(): Promise<CityMap> {
  mapPromise ??= fetch(assetUrl('city/map.json')).then((r) => r.json() as Promise<CityMap>);
  return mapPromise;
}

export interface DecodedTile {
  header: TileHeader;
  geometries: Partial<Record<TileMeshName, THREE.BufferGeometry>>;
}

async function gunzipIfNeeded(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const b = new Uint8Array(buf, 0, 2);
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf; // already decoded (server sent Content-Encoding)
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

function readAttr(
  buf: ArrayBuffer,
  base: number,
  a: AttrInfo,
  count: number,
): THREE.BufferAttribute {
  const n = count * a.itemSize;
  const off = base + a.offset;
  switch (a.type) {
    case 'u8': {
      const data = new Uint8Array(buf, off, n);
      return new THREE.BufferAttribute(data, a.itemSize, !!a.normalized);
    }
    case 'i16': {
      const src = new Int16Array(buf, off, n);
      const out = new Float32Array(n);
      const s = a.scale ?? 1;
      const bias = a.bias ?? [];
      for (let i = 0; i < n; i++) out[i] = src[i]! * s + (bias[i % a.itemSize] ?? 0);
      return new THREE.BufferAttribute(out, a.itemSize);
    }
    case 'f32':
      return new THREE.BufferAttribute(new Float32Array(buf, off, n), a.itemSize);
    case 'u16':
      return new THREE.BufferAttribute(new Uint16Array(buf, off, n), a.itemSize);
    case 'u32':
      return new THREE.BufferAttribute(new Uint32Array(buf, off, n), a.itemSize);
  }
}

/** Ground meshes get world-space UVs (meters) so textures line up across tiles. */
const GROUND: TileMeshName[] = ['asphalt', 'pavement', 'grass', 'sand', 'pier', 'curb'];

/** Fetches and decodes one tile; `track` makes the loading screen wait for it. */
export async function loadTile(
  file: string,
  signal?: AbortSignal,
  track = false,
): Promise<DecodedTile> {
  const url = assetUrl(`city/${file}`);
  return track ? tracked(url, () => decodeTile(url, file, signal)) : decodeTile(url, file, signal);
}

async function decodeTile(url: string, file: string, signal?: AbortSignal): Promise<DecodedTile> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const buf = await gunzipIfNeeded(await res.arrayBuffer());
  const view = new DataView(buf);
  if (view.getUint32(0, true) !== TILE_MAGIC) throw new Error(`${file}: not a city tile`);
  const jsonLen = view.getUint32(4, true);
  const header = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buf, 8, jsonLen)),
  ) as TileHeader;
  const base = 8 + jsonLen + ((4 - ((8 + jsonLen) % 4)) % 4);

  const geometries: DecodedTile['geometries'] = {};
  for (const [name, info] of Object.entries(header.meshes) as [
    TileMeshName,
    NonNullable<TileHeader['meshes'][TileMeshName]>,
  ][]) {
    const g = new THREE.BufferGeometry();
    for (const [attr, a] of Object.entries(info.attributes)) {
      g.setAttribute(attr, readAttr(buf, base, a, info.vertexCount));
    }
    const idx =
      info.index.type === 'u32'
        ? new Uint32Array(buf, base + info.index.offset, info.indexCount)
        : new Uint16Array(buf, base + info.index.offset, info.indexCount);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    if (GROUND.includes(name)) {
      const p = g.getAttribute('position');
      const uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        // Curbs are vertical strips: run the texture along them instead of stretching it.
        uv[i * 2] = name === 'curb' ? p.getX(i) + p.getZ(i) : p.getX(i);
        uv[i * 2 + 1] = name === 'curb' ? p.getY(i) : p.getZ(i);
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    geometries[name] = g;
  }
  return { header, geometries };
}

/** Distance from a point to a tile's square (0 inside). */
export function tileDistance(e: TileEntry, size: number, x: number, z: number): number {
  const dx = Math.max(e.ix * size - x, 0, x - (e.ix + 1) * size);
  const dz = Math.max(e.iz * size - z, 0, z - (e.iz + 1) * size);
  return Math.hypot(dx, dz);
}

/** Decoded tiles fetched before the scene mounts (around the spawn point). */
export const preloadedTiles = new Map<string, DecodedTile>();

/** Loads the tiles around a point before the scene mounts (so the car lands on real ground). */
export async function preloadAround(
  city: City,
  x: number,
  z: number,
  radius: number,
): Promise<void> {
  const size = city.index.tileSize;
  const near = city.index.tiles.filter((e) => tileDistance(e, size, x, z) < radius);
  const decoded = await Promise.all(near.map((e) => loadTile(e.file, undefined, true)));
  near.forEach((e, i) => preloadedTiles.set(tileKey(e.ix, e.iz), decoded[i]!));
}
