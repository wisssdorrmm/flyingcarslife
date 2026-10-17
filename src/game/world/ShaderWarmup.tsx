import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Compiles every shader in the scene before the loading screen hides (it's registered with
 * three's loading manager), so the first seconds of driving don't stutter.
 */
export function ShaderWarmup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const m = THREE.DefaultLoadingManager;
    const id = 'shader-warmup';
    m.itemStart(id);
    // Next frame, once the city's meshes are in the scene.
    const raf = requestAnimationFrame(() => {
      gl.compileAsync(scene, camera)
        .catch(() => undefined)
        .finally(() => m.itemEnd(id));
    });
    return () => cancelAnimationFrame(raf);
  }, [gl, scene, camera]);
  return null;
}
