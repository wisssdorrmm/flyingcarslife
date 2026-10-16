import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { pbrTextureUrls } from '../../lib/assets';
import { useSettings } from '../store/settings';

export type PbrId =
  | 'asphalt_02'
  | 'concrete_pavement'
  | 'concrete'
  | 'brick_wall_02'
  | 'dark_brick_wall'
  | 'white_stucco'
  | 'granite_tile'
  | 'metal_plate';

export interface PbrOptions {
  /** Real-world size one texture tile covers (geometry UVs must be in meters). */
  tileMeters?: number;
  /** Explicit UV repeat, for geometry with 0–1 UVs. Overrides tileMeters. */
  repeat?: [number, number];
  color?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  normalScale?: number;
  envMapIntensity?: number;
}

const ANISOTROPY = { low: 2, medium: 4, high: 8, ultra: 16 } as const;

/** Loads a Poly Haven PBR set (diffuse / normal / ARM) sized for the current quality tier. */
export function usePbrMaterial(id: PbrId, opts: PbrOptions = {}): THREE.MeshStandardMaterial {
  const quality = useSettings((s) => s.quality);
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const urls = pbrTextureUrls(id, quality);
  const maps = useTexture(urls);
  const {
    tileMeters = 2,
    repeat,
    color,
    roughness = 1,
    metalness,
    normalScale = 1,
    envMapIntensity = 1,
  } = opts;

  return useMemo(() => {
    const rx = repeat ? repeat[0] : 1 / tileMeters;
    const ry = repeat ? repeat[1] : 1 / tileMeters;
    const aniso = Math.min(maxAniso, ANISOTROPY[quality.tier]);
    // Clones share the GPU upload (same Source) but can carry their own repeat.
    const prep = (t: THREE.Texture, srgb: boolean) => {
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(rx, ry);
      c.anisotropy = aniso;
      c.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      c.needsUpdate = true;
      return c;
    };
    const arm = prep(maps.arm, false);
    const mat = new THREE.MeshStandardMaterial({
      map: prep(maps.diff, true),
      normalMap: prep(maps.nor, false),
      normalScale: new THREE.Vector2(normalScale, normalScale),
      aoMap: arm,
      roughnessMap: arm,
      metalnessMap: metalness === undefined ? arm : null,
      roughness,
      metalness: metalness ?? 1,
      envMapIntensity,
    });
    if (color !== undefined) mat.color.set(color);
    mat.name = id;
    return mat;
  }, [
    maps,
    id,
    tileMeters,
    repeat,
    color,
    roughness,
    metalness,
    normalScale,
    envMapIntensity,
    maxAniso,
    quality.tier,
  ]);
}
