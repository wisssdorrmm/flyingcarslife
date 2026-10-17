import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, useEnvironment } from '@react-three/drei';
import * as THREE from 'three';
import { hdriUrl } from '../../lib/assets';
import { WORLD_LIGHTING } from '../config';
import { useSettings } from '../store/settings';
import { STARTUP_QUALITY } from './materials';

const HDRI = 'kloofendal_48d_partly_cloudy_puresky';

/**
 * Finds the sun in an equirectangular HDR by locating its brightest pixel,
 * so the shadow-casting light always matches the sky.
 */
function findSunDirection(texture: THREE.Texture): THREE.Vector3 {
  const image = texture.image as { data?: ArrayLike<number>; width: number; height: number };
  const data = image.data;
  if (!data) return new THREE.Vector3(0.5, 0.8, 0.3).normalize();
  const half = data instanceof Uint16Array;
  const read = (i: number) => (half ? THREE.DataUtils.fromHalfFloat(data[i] ?? 0) : (data[i] ?? 0));
  const { width, height } = image;
  const stride = data.length / (width * height);
  let best = -1;
  let bestIdx = 0;
  // Only the upper hemisphere can hold the sun.
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * stride;
      const lum = 0.2126 * read(i) + 0.7152 * read(i + 1) + 0.0722 * read(i + 2);
      if (lum > best) {
        best = lum;
        bestIdx = y * width + x;
      }
    }
  }
  const u = ((bestIdx % width) + 0.5) / width;
  const v = 1 - (Math.floor(bestIdx / width) + 0.5) / height;
  // Inverse of three's equirectUv(): u = atan(z, x) / 2π + 0.5, v = asin(y) / π + 0.5
  const lon = (u - 0.5) * Math.PI * 2;
  const lat = (v - 0.5) * Math.PI;
  return new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.sin(lon),
  ).normalize();
}

export function SkyAndSun() {
  // Startup tier: swapping the HDRI file on a graphics change would suspend the whole scene.
  const texture = useEnvironment({ files: hdriUrl(HDRI, STARTUP_QUALITY) });
  const rotation = useMemo(() => new THREE.Euler(0, WORLD_LIGHTING.skyRotation, 0), []);
  const sunDir = useMemo(
    () =>
      findSunDirection(texture).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        WORLD_LIGHTING.skyRotation,
      ),
    [texture],
  );

  return (
    <>
      <Environment
        map={texture}
        background
        environmentIntensity={WORLD_LIGHTING.environmentIntensity}
        backgroundIntensity={WORLD_LIGHTING.backgroundIntensity}
        backgroundRotation={rotation}
        environmentRotation={rotation}
      />
      <Sun direction={sunDir} />
    </>
  );
}

/** Directional sun whose shadow frustum follows the camera, snapped to texels to avoid shimmer. */
function Sun({ direction }: { direction: THREE.Vector3 }) {
  const quality = useSettings((s) => s.quality);
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const extent = quality.shadowExtent;

  useFrame(({ camera }) => {
    const l = light.current;
    if (!l) return;
    const texel = (extent * 2) / quality.shadowMapSize;
    // Center the shadow box a bit ahead of the camera, where detail matters most.
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize().multiplyScalar(extent * 0.4);
    const cx = Math.round((camera.position.x + forward.x) / texel) * texel;
    const cz = Math.round((camera.position.z + forward.z) / texel) * texel;
    // Follow the camera's height too: the city climbs from the bay to ~100 m hilltops.
    const cy = Math.round(camera.position.y / 4) * 4;
    target.position.set(cx, cy, cz);
    target.updateMatrixWorld();
    l.position.set(cx, cy, cz).addScaledVector(direction, 200);
  });

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        color={WORLD_LIGHTING.sunColor}
        intensity={WORLD_LIGHTING.sunIntensity}
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-camera-near={1}
        shadow-camera-far={450}
      />
    </>
  );
}
