import * as THREE from 'three';
import { BAY, FLOOR_HEIGHT } from './buildingLayout';

/**
 * Wall material with windows painted on procedurally, for building shells seen from a distance
 * (and behind the full facade up close, where the facade covers them).
 *
 * Expects meter UVs (u along the facade, v up from the base) and a `facadeInfo` attribute:
 *   x = building height (m), y = 1 if the ground floor is a shopfront.
 */
export function makeFacadeShellMaterial(
  base: THREE.MeshStandardMaterial,
): THREE.MeshStandardMaterial {
  const mat = base.clone();
  mat.name = `${base.name}-shell`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBay = { value: BAY };
    shader.uniforms.uFloor = { value: FLOOR_HEIGHT };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 facadeInfo;
        varying vec2 vFacadeUv;
        varying vec2 vFacadeInfo;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        vFacadeUv = uv;
        vFacadeInfo = facadeInfo;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uBay;
        uniform float uFloor;
        varying vec2 vFacadeUv;
        varying vec2 vFacadeInfo;
        float facadeWindow(out float frame) {
          vec2 cell = vec2(fract(vFacadeUv.x / uBay), fract(vFacadeUv.y / uFloor));
          float floorIndex = floor(vFacadeUv.y / uFloor);
          // No windows in the parapet above the last floor.
          if (vFacadeUv.y > vFacadeInfo.x - 1.1) { frame = 0.0; return 0.0; }
          vec2 lo = floorIndex < 0.5 && vFacadeInfo.y > 0.5 ? vec2(0.07, 0.04) : vec2(0.24, 0.2);
          vec2 hi = floorIndex < 0.5 && vFacadeInfo.y > 0.5 ? vec2(0.93, 0.82) : vec2(0.76, 0.8);
          vec2 inside = step(lo, cell) * step(cell, hi);
          vec2 inFrame = step(lo - 0.03, cell) * step(cell, hi + 0.03);
          frame = inFrame.x * inFrame.y * (1.0 - inside.x * inside.y);
          return inside.x * inside.y;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float facadeFrame;
        float facadeGlass = facadeWindow(facadeFrame);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.13, 0.14), facadeFrame);
        // Slight per-window variation so the grid doesn't look printed.
        float facadeTint = fract(sin(dot(floor(vFacadeUv / vec2(uBay, uFloor)), vec2(12.9898, 78.233))) * 43758.5453);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.075, 0.09) + facadeTint * 0.03, facadeGlass);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.08, facadeGlass);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.7, facadeGlass);`,
      );
  };
  mat.customProgramCacheKey = () => `facade-shell-${base.uuid}`;
  return mat;
}
