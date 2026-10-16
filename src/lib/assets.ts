/**
 * Single entry point for every asset URL (CLAUDE.md §4).
 * In production assets come from the Cloudflare R2 bucket (VITE_ASSET_URL);
 * locally they fall back to /public/assets.
 */
import type { QualitySettings } from '../game/quality';

const BASE = (import.meta.env.VITE_ASSET_URL || '/assets').replace(/\/+$/, '');

/** Absolute URL for an asset path such as `hdri/harbor_dusk.hdr` or `models/car_sedan.glb`. */
export function assetUrl(path: string): string {
  return `${BASE}/${path.replace(/^\/+/, '')}`;
}

/** Largest texture size the asset pipeline exports (scripts/compress-assets.ts). */
const MAX_EXPORTED_TEXTURE = 2048;

/**
 * URLs for a PBR texture set sized to the current quality tier.
 * Convention (scripts/compress-assets.ts): `textures/<id>/<map>_<size>.webp`.
 */
export function pbrTextureUrls(
  id: string,
  quality: Pick<QualitySettings, 'textureSize' | 'tier'>,
): { diff: string; nor: string; arm: string } {
  const size = Math.min(quality.textureSize, MAX_EXPORTED_TEXTURE);
  // Roughness/AO is low-frequency and normals barely read past arm's length, so they stay
  // at 1K below Ultra; this keeps High's first load under the 40 MB budget.
  const detail = quality.tier === 'ultra' ? size : Math.min(size, 1024);
  const url = (map: string, s: number) => assetUrl(`textures/${id}/${map}_${s}.webp`);
  return {
    diff: url('diff', size),
    nor: url('nor', detail),
    arm: url('arm', Math.min(size, 1024)),
  };
}

export function modelUrl(name: string): string {
  return assetUrl(`models/${name}.glb`);
}

/** HDRIs are exported at 1k and 2k; phones get 1k. */
export function hdriUrl(name: string, quality: Pick<QualitySettings, 'tier'>): string {
  const res = quality.tier === 'low' || quality.tier === 'medium' ? '1k' : '2k';
  return assetUrl(`hdri/${name}_${res}.hdr`);
}

export function audioUrl(name: string): string {
  return assetUrl(`audio/${name}`);
}
