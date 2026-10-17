/**
 * Downloads the raw data for the city generator into assets-src/osm/ (git-ignored):
 *   osm.json      — OpenStreetMap features in BBOX (Overpass API, or the main OSM API as a fallback),
 *                   © OpenStreetMap contributors (ODbL)
 *   terrain/*.png — Terrarium elevation tiles (AWS Open Data, Mapzen), zoom 15 (~3.8 m/px)
 * Run: npm run city:fetch   (then npm run city:build)
 */
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BBOX, RAW_DIR } from './area';

const OVERPASS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
const USER_AGENT = 'flyingcarslife-city-generator/0.1';
export const TERRAIN_ZOOM = 15;

function overpassQuery(): string {
  const b = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
  return `[out:json][timeout:180][bbox:${b}];
(
  way["highway"];
  way["building"];
  relation["building"];
  way["building:part"];
  way["leisure"];
  way["landuse"];
  way["natural"];
  relation["natural"];
  relation["leisure"];
  way["man_made"];
  way["railway"];
  way["amenity"];
  way["tourism"];
  node["highway"~"traffic_signals|crossing|street_lamp|stop|bus_stop"];
  node["natural"="tree"];
  node["amenity"];
  node["tourism"];
)->.a;
.a out body;
.a >;
out skel qt;
rel["route"~"^(bus|trolleybus|tram)$"];
out body;`;
}

async function fetchOsm(): Promise<void> {
  const dest = join(RAW_DIR, 'osm.json');
  const body = new URLSearchParams({ data: overpassQuery() });
  for (const url of OVERPASS) {
    try {
      console.log('overpass:', url);
      const res = await fetch(url, {
        method: 'POST',
        body,
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(240_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const n = (JSON.parse(text) as { elements: unknown[] }).elements.length;
      await writeFile(dest, text);
      console.log(`  ${n} elements, ${(text.length / 1e6).toFixed(1)} MB → ${dest}`);
      return;
    } catch (err) {
      console.warn('  failed:', (err as Error).message);
    }
  }
  console.warn('all Overpass servers failed; falling back to the OSM API');
  await fetchOsmApi(dest);
}

/**
 * Main OSM API /map calls (max 50k nodes each) over a grid of sub-boxes, merged by id. It returns
 * every element in the box plus the relations that reference them (incl. bus/tram routes).
 */
async function fetchOsmApi(dest: string): Promise<void> {
  const N = 4;
  const byKey = new Map<string, { type: string; id: number }>();
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const w = BBOX.west + ((BBOX.east - BBOX.west) * i) / N;
      const e = BBOX.west + ((BBOX.east - BBOX.west) * (i + 1)) / N;
      const s = BBOX.south + ((BBOX.north - BBOX.south) * j) / N;
      const n = BBOX.south + ((BBOX.north - BBOX.south) * (j + 1)) / N;
      const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${w},${s},${e},${n}`;
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      const { elements } = (await res.json()) as { elements: { type: string; id: number }[] };
      for (const el of elements) byKey.set(`${el.type}/${el.id}`, el);
      console.log(`  osm api ${i * N + j + 1}/${N * N}: ${elements.length} elements`);
    }
  }
  const text = JSON.stringify({ elements: [...byKey.values()] });
  await writeFile(dest, text);
  console.log(`  ${byKey.size} elements, ${(text.length / 1e6).toFixed(1)} MB → ${dest}`);
}

/** Slippy-map tile containing a coordinate. */
export function tileOf(lat: number, lon: number, z: number): [x: number, y: number] {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [
    Math.floor(((lon + 180) / 360) * n),
    Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n),
  ];
}

async function fetchTerrain(): Promise<void> {
  const dir = join(RAW_DIR, 'terrain');
  await mkdir(dir, { recursive: true });
  const [x0, y0] = tileOf(BBOX.north, BBOX.west, TERRAIN_ZOOM);
  const [x1, y1] = tileOf(BBOX.south, BBOX.east, TERRAIN_ZOOM);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const dest = join(dir, `${TERRAIN_ZOOM}_${x}_${y}.png`);
      if (await stat(dest).catch(() => null)) continue;
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${TERRAIN_ZOOM}/${x}/${y}.png`;
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      await writeFile(dest, Buffer.from(await res.arrayBuffer()));
      console.log('  terrain', dest);
    }
  }
}

async function main(): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true });
  const only = process.argv[2]; // optional: osm | osm-api | terrain
  if (!only || only === 'terrain') await fetchTerrain();
  if (!only || only === 'osm') await fetchOsm();
  if (only === 'osm-api') await fetchOsmApi(join(RAW_DIR, 'osm.json'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
