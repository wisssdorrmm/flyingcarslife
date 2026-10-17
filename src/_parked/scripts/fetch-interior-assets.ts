/**
 * Downloads the CC0 furniture models and interior textures (Poly Haven) used by homes and the club.
 * Same layout as fetch-assets.ts, so `npm run assets:compress` picks them up.
 * Run: npm run assets:fetch-interiors
 */
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const OUT = 'assets-src/polyhaven';
const API = 'https://api.polyhaven.com';

export const FURNITURE_MODELS = [
  'Sofa_01',
  'sofa_03',
  'ArmChair_01',
  'CoffeeTable_01',
  'modern_coffee_table_01',
  'dining_table',
  'dining_chair_02',
  'round_wooden_table_01',
  'old_bed_frame',
  'ClassicNightstand_01',
  'Television_01',
  'Shelf_01',
  'wooden_bookshelf_worn',
  'drawer_cabinet',
  'potted_plant_02',
  'desk_lamp_arm_01',
  'metal_office_desk',
  'side_table_01',
  'electric_stove',
  'bar_chair_round_01',
  'boombox',
  'fancy_picture_frame_01',
  'modern_ceiling_lamp_01',
];

const TEXTURES = [
  'herringbone_parquet', // home floors
  'laminate_floor_02', // apartment floors
  'white_plaster_02', // walls
  'painted_plaster_wall', // accent walls
  'floor_tiles_06', // kitchens, bathrooms
  'black_painted_planks', // club floor
];

interface FileRef {
  url: string;
  size: number;
}

const headers = { 'User-Agent': 'flyingcarslife-asset-fetch' };

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

async function download(url: string, dest: string): Promise<void> {
  if (await exists(dest)) return;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  console.log('  ↓', dest);
}

async function main(): Promise<void> {
  console.log('Furniture');
  for (const id of FURNITURE_MODELS) {
    const files = await getJson<{ gltf: Record<string, { gltf: FileRef & { include: Record<string, FileRef> } }> }>(
      `${API}/files/${id}`,
    );
    const entry = files.gltf['1k']?.gltf;
    if (!entry) throw new Error(`Model ${id} has no 1k glTF`);
    const dir = join(OUT, 'models', id);
    await download(entry.url, join(dir, `${id}.gltf`));
    for (const [rel, ref] of Object.entries(entry.include)) await download(ref.url, join(dir, rel));
  }
  console.log('Interior textures');
  for (const id of TEXTURES) {
    const files = await getJson<Record<string, Record<string, Record<string, FileRef>>>>(`${API}/files/${id}`);
    for (const [key, short] of Object.entries({ Diffuse: 'diff', nor_gl: 'nor', arm: 'arm' })) {
      const ref = files[key]?.['2k']?.jpg ?? files[key]?.['2k']?.png;
      if (!ref) throw new Error(`Texture ${id} has no ${key}`);
      await download(ref.url, join(OUT, 'textures', id, `${short}.${ref.url.endsWith('.png') ? 'png' : 'jpg'}`));
    }
  }
  console.log('Done');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
