/**
 * Downloads free CC0 assets from Poly Haven into assets-src/ (git-ignored).
 * Run: npm run assets:fetch   (then npm run assets:compress)
 *
 * Poly Haven API: https://api.polyhaven.com — all assets are CC0, no credit required
 * (we still list them in ASSET_CREDITS.md).
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const OUT = 'assets-src/polyhaven';
const API = 'https://api.polyhaven.com';

/** HDRIs: downloaded at each listed resolution. */
const HDRIS = [{ id: 'kloofendal_48d_partly_cloudy_puresky', res: ['1k', '2k'] }];

/** PBR textures: diffuse, OpenGL normal, ARM (AO/rough/metal) at the source resolution. */
const TEXTURES = [
  'asphalt_02', // road
  'concrete_pavement', // sidewalk slabs
  'concrete', // curbs
  'brick_wall_02', // red brick facade
  'dark_brick_wall', // dark brick facade
  'white_stucco', // plaster facade
  'granite_tile', // storefront base
  'metal_plate', // poles, traffic light housings
];
const TEXTURE_RES = '2k';

/** glTF models. */
const MODELS = [
  'modular_urban_apartments_facade',
  'modular_fire_escape',
  'fire_hydrant',
  'metal_trash_can',
  'modular_street_seating',
  'utility_box_01',
  'exterior_aircon_unit',
  'water_manhole_cover',
  'tree_small_02',
];
const MODEL_RES = '1k';

/**
 * Khronos glTF sample models (CC-BY 4.0 — credit in ASSET_CREDITS.md).
 * The WEBP variant is fetched by reading the .gltf and downloading every buffer and image it references.
 */
const KHRONOS_BASE =
  'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models';
const KHRONOS_MODELS = [{ id: 'CarConcept', variant: 'glTF-WEBP', out: 'car_concept' }];

interface FileRef {
  url: string;
  size: number;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': 'flyingcarslife-asset-fetch' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

async function download(url: string, dest: string): Promise<void> {
  if (await exists(dest)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  console.log('  ↓', dest);
}

async function fetchHdri(id: string, resolutions: string[]): Promise<void> {
  const files = await getJson<{ hdri: Record<string, { hdr: FileRef }> }>(`${API}/files/${id}`);
  for (const r of resolutions) {
    const ref = files.hdri[r]?.hdr;
    if (!ref) throw new Error(`HDRI ${id} has no ${r}`);
    await download(ref.url, join(OUT, 'hdri', `${id}_${r}.hdr`));
  }
}

async function fetchTexture(id: string): Promise<void> {
  const files = await getJson<Record<string, Record<string, Record<string, FileRef>>>>(
    `${API}/files/${id}`,
  );
  const maps: Record<string, string> = { Diffuse: 'diff', nor_gl: 'nor', arm: 'arm' };
  for (const [key, short] of Object.entries(maps)) {
    const ref = files[key]?.[TEXTURE_RES]?.jpg ?? files[key]?.[TEXTURE_RES]?.png;
    if (!ref) throw new Error(`Texture ${id} has no ${key} @ ${TEXTURE_RES}`);
    const ext = ref.url.endsWith('.png') ? 'png' : 'jpg';
    await download(ref.url, join(OUT, 'textures', id, `${short}.${ext}`));
  }
}

async function fetchModel(id: string): Promise<void> {
  const files = await getJson<{
    gltf: Record<string, { gltf: FileRef & { include: Record<string, FileRef> } }>;
  }>(`${API}/files/${id}`);
  const entry = files.gltf[MODEL_RES]?.gltf;
  if (!entry) throw new Error(`Model ${id} has no glTF @ ${MODEL_RES}`);
  const dir = join(OUT, 'models', id);
  await download(entry.url, join(dir, `${id}.gltf`));
  for (const [rel, ref] of Object.entries(entry.include)) await download(ref.url, join(dir, rel));
}

async function fetchKhronosModel(m: { id: string; variant: string; out: string }): Promise<void> {
  const base = `${KHRONOS_BASE}/${m.id}/${m.variant}`;
  const dir = join('assets-src/khronos', m.out);
  const gltfPath = join(dir, `${m.out}.gltf`);
  await download(`${base}/${m.id}.gltf`, gltfPath);
  const gltf = JSON.parse(await readFile(gltfPath, 'utf8')) as {
    buffers?: { uri?: string }[];
    images?: { uri?: string }[];
  };
  const uris = [...(gltf.buffers ?? []), ...(gltf.images ?? [])]
    .map((x) => x.uri)
    .filter((u): u is string => !!u && !u.startsWith('data:'));
  for (const uri of uris) await download(`${base}/${uri}`, join(dir, decodeURIComponent(uri)));
}

async function main(): Promise<void> {
  console.log('HDRIs');
  for (const h of HDRIS) await fetchHdri(h.id, h.res);
  console.log('Textures');
  for (const t of TEXTURES) await fetchTexture(t);
  console.log('Models');
  for (const m of MODELS) await fetchModel(m);
  console.log('Khronos models');
  for (const m of KHRONOS_MODELS) await fetchKhronosModel(m);
  console.log('Done →', OUT);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
