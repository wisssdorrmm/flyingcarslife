import * as THREE from 'three';

/**
 * One material for every building in a tile. The generator gives each vertex a paint color, a
 * facade style (city/format.ts FACADE) and meter UVs (u along the wall, v above the building's
 * lowest ground point); this shader paints windows, trim, shopfronts and curtain walls from them.
 * Windows become glossy glass (low roughness) so they reflect the sky. Detail fades out with
 * distance (screen-space derivatives) so the window grids never shimmer.
 */
export function makeFacadeMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
    envMapIntensity: 0.9,
  });
  mat.name = 'city-facade';
  // No texture maps, so ask three to pass the uv attribute through anyway.
  mat.defines = { USE_UV: '' };
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        attribute float style;
        varying float vStyle;
        varying vec2 vFUv;
        varying vec3 vObjN;`,
      )
      .replace(
        '#include <uv_vertex>',
        /* glsl */ `#include <uv_vertex>
        vStyle = style;
        vFUv = uv;
        vObjN = normal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying float vStyle;
        varying vec2 vFUv;
        varying vec3 vObjN;
        float fcHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float fcBox(vec2 c, vec2 lo, vec2 hi) {
          vec2 s = step(lo, c) * step(c, hi);
          return s.x * s.y;
        }
        bool fcIs(float s, float k) { return abs(s - k) < 0.5; }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float fcGlass = 0.0;
        {
          vec2 uv = vFUv;
          float st = vStyle;
          float fw = max(length(fwidth(uv)), 1e-4);
          // 1 = full detail; 0 when a meter covers less than a few pixels.
          float aa = 1.0 - smoothstep(0.12, 0.45, fw);
          vec3 col = diffuseColor.rgb;
          vec3 trim = vec3(0.95, 0.94, 0.9);
          vec3 glassCol = vec3(0.09, 0.12, 0.16);
          vec2 cellId = vec2(0.0);
          bool horizontal = abs(vObjN.y) > 0.6;
          if (!horizontal && st < 6.5 && !fcIs(st, 5.0)) {
            if (uv.y < 0.0 && !fcIs(st, 6.0)) {
              col = mix(col, vec3(0.56, 0.55, 0.53), 0.85); // foundation below street level
            } else if (fcIs(st, 0.0)) {
              // Victorian: garage/entry level, tall windows with white trim, floor bands.
              float fl = 3.3;
              float f = floor(uv.y / fl);
              if (f < 0.5) {
                vec2 c = vec2(fract(uv.x / 3.2), uv.y / fl);
                float door = fcBox(c, vec2(0.14, 0.0), vec2(0.86, 0.8));
                float panel = step(0.5, fract(c.y * 6.0)) * 0.06;
                col = mix(col, trim * (0.8 - panel), door * aa);
              } else {
                vec2 c = vec2(fract(uv.x / 1.9), fract(uv.y / fl));
                cellId = vec2(floor(uv.x / 1.9), f);
                float win = fcBox(c, vec2(0.28, 0.2), vec2(0.72, 0.84));
                float frame = fcBox(c, vec2(0.21, 0.13), vec2(0.79, 0.91)) - win;
                col = mix(col, trim, frame * aa);
                fcGlass = win;
                col = mix(col, trim, step(c.y, 0.04) * aa);
              }
            } else if (fcIs(st, 1.0)) {
              // Shop: glass shopfront and sign band, windows above.
              if (uv.y < 3.7) {
                float m = step(0.06, fract(uv.x / 2.6)) * step(fract(uv.x / 2.6), 0.94);
                float front = fcBox(vec2(m, uv.y), vec2(0.5, 0.35), vec2(1.5, 2.95));
                cellId = vec2(floor(uv.x / 2.6), -1.0);
                fcGlass = front;
                col = mix(col, col * 0.45, step(2.95, uv.y) * step(uv.y, 3.6) * aa);
                col = mix(col, vec3(0.2), (1.0 - m) * step(uv.y, 2.95) * aa);
              } else {
                vec2 c = vec2(fract(uv.x / 2.4), fract((uv.y - 3.7) / 3.2));
                cellId = vec2(floor(uv.x / 2.4), floor((uv.y - 3.7) / 3.2));
                float win = fcBox(c, vec2(0.24, 0.22), vec2(0.76, 0.82));
                float frame = fcBox(c, vec2(0.2, 0.18), vec2(0.8, 0.86)) - win;
                col = mix(col, trim, frame * aa);
                fcGlass = win;
              }
            } else if (fcIs(st, 2.0)) {
              // Tower: curtain wall, mullions and spandrels.
              vec2 c = vec2(fract(uv.x / 1.6), fract(uv.y / 3.8));
              cellId = vec2(floor(uv.x / 1.6), floor(uv.y / 3.8));
              float spandrel = step(c.y, 0.2);
              float mull = 1.0 - step(0.04, c.x) * step(c.x, 0.96);
              glassCol = col * 0.42 + 0.03;
              col = mix(col * 0.9, vec3(0.75), mull * aa);
              fcGlass = (1.0 - spandrel) * (1.0 - mull * aa);
            } else if (fcIs(st, 3.0)) {
              // Apartment / stucco: regular windows with dark frames.
              vec2 c = vec2(fract(uv.x / 2.5), fract(uv.y / 3.1));
              cellId = vec2(floor(uv.x / 2.5), floor(uv.y / 3.1));
              float win = fcBox(c, vec2(0.23, 0.26), vec2(0.77, 0.8));
              float frame = fcBox(c, vec2(0.2, 0.22), vec2(0.8, 0.84)) - win;
              col = mix(col, col * 0.55, frame * aa);
              fcGlass = win;
            } else if (fcIs(st, 4.0)) {
              // Warehouse: corrugated siding, roll-up doors, a clerestory band.
              col *= 1.0 - 0.06 * aa * step(0.5, fract(uv.x / 0.3));
              vec2 d = vec2(fract(uv.x / 14.0), uv.y);
              col = mix(col, vec3(0.42, 0.44, 0.45), fcBox(d, vec2(0.12, 0.0), vec2(0.42, 4.6)) * aa);
              vec2 c = vec2(fract(uv.x / 3.0), uv.y);
              cellId = vec2(floor(uv.x / 3.0), 9.0);
              fcGlass = fcBox(c, vec2(0.08, 5.6), vec2(0.92, 6.6));
            } else if (fcIs(st, 6.0)) {
              // Bay window face: one tall window per floor (u is 0..1 across the face).
              vec2 c = vec2(uv.x, fract(uv.y / 3.3));
              cellId = vec2(floor(uv.y / 3.3), 7.0);
              float win = fcBox(c, vec2(0.15, 0.18), vec2(0.85, 0.84));
              float frame = fcBox(c, vec2(0.08, 0.1), vec2(0.92, 0.92)) - win;
              col = mix(col, trim, frame * aa);
              fcGlass = win;
            }
          }
          fcGlass *= aa;
          // A few windows show curtains or warm interiors.
          float h = fcHash(cellId + floor(vFUv.x * 0.013) * 17.0);
          vec3 tint = mix(glassCol, vec3(0.78, 0.72, 0.6), step(0.86, h) * 0.55);
          // Far away, blend toward the average facade tone instead of aliasing.
          col = mix(col, tint, fcGlass);
          diffuseColor.rgb = col;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.06, fcGlass);`,
      );
  };
  mat.customProgramCacheKey = () => 'city-facade-v1';
  return mat;
}
