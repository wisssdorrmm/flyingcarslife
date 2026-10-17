/**
 * Turns raw assets in assets-src/ into web-ready files in public/assets/ (git-ignored; upload to R2).
 * Run: npm run assets:compress
 *
 * - Textures → WebP at 512 / 1024 / 2048 (one set per quality tier): textures/<id>/<map>_<size>.webp
 * - HDRIs    → copied as-is:                                          hdri/<id>_<res>.hdr
 * - Models   → GLB with meshopt geometry + WebP textures:              models/<id>.glb
 *
 * TODO(Phase 12): switch textures to KTX2/Basis (needs the `toktx` binary) for lower GPU memory.
 */
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  meshopt,
  prune,
  resample,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions';

const SRC = 'assets-src/polyhaven';
/** Extra model sources laid out as <dir>/<id>/<id>.gltf. */
const MODEL_SOURCES = [join(SRC, 'models'), 'assets-src/khronos', 'assets-src/threejs'];
const OUT = 'public/assets';
const TEXTURE_SIZES = [512, 1024, 2048] as const;

interface SimplifyOptions {
  /** Target triangle ratio (0 = as few as the error allows). */
  ratio: number;
  /** Max deviation, relative to mesh size. */
  error: number;
  /** Keep open edges fixed so modular pieces still line up. */
  lockBorder?: boolean;
}

/** Per-model overrides. */
const MODEL_OPTIONS: Record<
  string,
  {
    maxTexture?: number;
    simplify?: SimplifyOptions;
    /** Modular kits: drop the showcase layout so every piece sits at its own origin. */
    zeroNodeTranslations?: boolean;
    /** Swap images whose URI contains the key (e.g. third-party logos) for generated ones. */
    replaceImages?: Record<string, () => Promise<Buffer>>;
    /** Keep only skeleton + animation clips (to share clips across characters). */
    animationsOnly?: boolean;
    /**
     * Skip meshopt. Its quantization folds a dequantize scale into skinned meshes' inverse bind
     * matrices, which breaks skeleton.pose() (and therefore animation retargeting).
     */
    skipMeshopt?: boolean;
  }
> = {
  // Player stand-in (Mixamo character from the three.js examples).
  michelle: { maxTexture: 1024, skipMeshopt: true },
  // Only Soldier's Idle/Walk/Run clips are used; they retarget onto any Mixamo rig.
  soldier: { animationsOnly: true, skipMeshopt: true },
  // Khronos CarConcept → our fictional "Flying Car" brand (the source logo isn't licensed for reuse).
  car_concept: {
    maxTexture: 1024,
    replaceImages: { Khronos_C: flyingCarBadge },
  },
  // Same car at ~20% of the triangles, for parked cars (written as car_concept_lod.glb).
  'car_concept@lod': {
    maxTexture: 512,
    replaceImages: { Khronos_C: flyingCarBadge },
    simplify: { ratio: 0.2, error: 0.004 },
  },
  // Flat wall panels are heavily over-tessellated (4.6k tris → ~200 at <1 mm error).
  modular_urban_apartments_facade: {
    maxTexture: 1024,
    zeroNodeTranslations: true,
    simplify: { ratio: 0, error: 0.002, lockBorder: true },
  },
  tree_small_02: { maxTexture: 1024, simplify: { ratio: 0.008, error: 0.05 } },
  water_manhole_cover: { maxTexture: 512, simplify: { ratio: 0.15, error: 0.003 } },
  fire_hydrant: { maxTexture: 512, simplify: { ratio: 0.08, error: 0.003 } },
  metal_trash_can: { simplify: { ratio: 0.3, error: 0.002 } },
  utility_box_01: { maxTexture: 512 },
  exterior_aircon_unit: { maxTexture: 512 },
};
const DEFAULT_MAX_TEXTURE = 1024;

/** 512×128 wordmark used for the car's badge, steering emblem and license plate. */
async function flyingCarBadge(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="128" viewBox="0 0 512 128">
    <rect width="512" height="128" fill="#0b0c0e"/>
    <path d="M150 74 C 200 36, 312 36, 362 74" fill="none" stroke="#e8edf2" stroke-width="3" stroke-linecap="round" opacity="0.55"/>
    <text x="256" y="78" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="46" font-weight="700" letter-spacing="12" fill="#f4f6f8">FLYING CAR</text>
    <text x="256" y="106" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="13" letter-spacing="7" fill="#9aa3ad">HARBOR CITY · ELECTRIC</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function dirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

function mb(bytes: number): string {
  return `${(bytes / 1e6).toFixed(2)} MB`;
}

async function compressTextures(): Promise<void> {
  for (const id of await dirs(join(SRC, 'textures'))) {
    const srcDir = join(SRC, 'textures', id);
    const outDir = join(OUT, 'textures', id);
    await mkdir(outDir, { recursive: true });
    for (const file of await readdir(srcDir)) {
      const map = file.replace(/\.(jpg|png)$/, '');
      // Normals need more precision than color/ARM to avoid banding.
      const quality = map === 'nor' ? 90 : 80;
      for (const size of TEXTURE_SIZES) {
        const dest = join(outDir, `${map}_${size}.webp`);
        await sharp(join(srcDir, file)).resize(size, size).webp({ quality }).toFile(dest);
      }
    }
    console.log('  texture', id);
  }
}

async function copyHdris(): Promise<void> {
  const outDir = join(OUT, 'hdri');
  await mkdir(outDir, { recursive: true });
  for (const file of await readdir(join(SRC, 'hdri'))) {
    await copyFile(join(SRC, 'hdri', file), join(outDir, file));
    console.log('  hdri', file);
  }
}

async function compressModels(onlyModel?: string): Promise<void> {
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const outDir = join(OUT, 'models');
  await mkdir(outDir, { recursive: true });

  const models = (
    await Promise.all(
      MODEL_SOURCES.map(async (dir) => (await dirs(dir)).map((id) => ({ dir, id }))),
    )
  ).flat();
  // Models with an `<id>@lod` entry are exported a second time with those options.
  const variants = models.flatMap((m) =>
    MODEL_OPTIONS[`${m.id}@lod`] ? [m, { ...m, lod: true }] : [m],
  ) as { dir: string; id: string; lod?: boolean }[];
  for (const { dir, id, lod } of variants) {
    if (onlyModel && id !== onlyModel) continue;
    const opts = MODEL_OPTIONS[lod ? `${id}@lod` : id] ?? {};
    const maxTex = opts.maxTexture ?? DEFAULT_MAX_TEXTURE;
    const base = join(dir, id, id);
    const doc = await io.read((await exists(`${base}.gltf`)) ? `${base}.gltf` : `${base}.glb`);
    if (opts.animationsOnly) {
      for (const mesh of doc.getRoot().listMeshes()) mesh.dispose();
    }
    for (const [match, make] of Object.entries(opts.replaceImages ?? {})) {
      for (const tex of doc.getRoot().listTextures()) {
        if (tex.getURI().includes(match) || tex.getName().includes(match)) {
          tex
            .setImage(new Uint8Array(await make()))
            .setMimeType('image/png')
            .setURI(`${match}.png`);
          console.log(`  replaced image ${match} in ${id}`);
        }
      }
    }
    if (opts.zeroNodeTranslations) {
      for (const node of doc.getRoot().listNodes()) node.setTranslation([0, 0, 0]);
    }
    const transforms = [dedup(), prune(), resample(), weld()];
    if (opts.simplify) {
      transforms.push(simplify({ simplifier: MeshoptSimplifier, ...opts.simplify }));
    }
    transforms.push(
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxTex, maxTex] }),
    );
    if (!opts.skipMeshopt) transforms.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    await doc.transform(...transforms);
    const dest = join(outDir, `${id}${lod ? '_lod' : ''}.glb`);
    await io.write(dest, doc);
    console.log('  model', id, mb((await stat(dest)).size));
  }
}

async function main(): Promise<void> {
  const only = process.argv[2]; // optional: textures | hdri | models
  const onlyModel = process.argv[3]; // optional: a single model id
  if (!only || only === 'hdri') await copyHdris();
  if (!only || only === 'textures') await compressTextures();
  if (!only || only === 'models') await compressModels(onlyModel);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
