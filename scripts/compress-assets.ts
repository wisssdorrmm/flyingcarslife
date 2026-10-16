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
  }
> = {
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

  for (const id of await dirs(join(SRC, 'models'))) {
    if (onlyModel && id !== onlyModel) continue;
    const opts = MODEL_OPTIONS[id] ?? {};
    const maxTex = opts.maxTexture ?? DEFAULT_MAX_TEXTURE;
    const doc = await io.read(join(SRC, 'models', id, `${id}.gltf`));
    if (opts.zeroNodeTranslations) {
      for (const node of doc.getRoot().listNodes()) node.setTranslation([0, 0, 0]);
    }
    const transforms = [dedup(), prune(), resample(), weld()];
    if (opts.simplify) {
      transforms.push(simplify({ simplifier: MeshoptSimplifier, ...opts.simplify }));
    }
    transforms.push(
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxTex, maxTex] }),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    await doc.transform(...transforms);
    const dest = join(outDir, `${id}.glb`);
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
