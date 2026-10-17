/**
 * Elevation in local meters, from the Terrarium tiles downloaded by fetch.ts.
 * Terrarium encodes meters as (R * 256 + G + B / 256) − 32768; it includes bay bathymetry (< 0).
 * The raw ~3.8 m/px grid is resampled to a smoothed local grid so roads don't pick up DEM noise.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { BBOX, project, RAW_DIR, unproject } from './area';

const TILE_PX = 256;

export interface HeightField {
  /** Bilinear height (m above sea level) at local x/z. */
  at(x: number, z: number): number;
  /** Grid bounds in local meters, and spacing. */
  x0: number;
  z0: number;
  step: number;
  nx: number;
  nz: number;
  data: Float32Array;
}

/** Raw DEM sampler over the downloaded tiles (Web Mercator pixel space). */
async function loadDem(): Promise<(lat: number, lon: number) => number> {
  const dir = join(RAW_DIR, 'terrain');
  const tiles = new Map<string, Float32Array>();
  let zoom = 0;
  for (const f of await readdir(dir)) {
    const m = /^(\d+)_(\d+)_(\d+)\.png$/.exec(f);
    if (!m) continue;
    zoom = Number(m[1]);
    const { data, info } = await sharp(join(dir, f)).raw().toBuffer({ resolveWithObject: true });
    const h = new Float32Array(TILE_PX * TILE_PX);
    for (let i = 0; i < h.length; i++) {
      const o = i * info.channels;
      h[i] = data[o]! * 256 + data[o + 1]! + data[o + 2]! / 256 - 32768;
    }
    tiles.set(`${m[2]}_${m[3]}`, h);
  }
  if (!tiles.size) throw new Error(`no terrain tiles in ${dir}; run npm run city:fetch`);
  const n = 2 ** zoom;
  const px = (tx: number, ty: number): number => {
    const x = Math.floor(tx / TILE_PX);
    const y = Math.floor(ty / TILE_PX);
    const t = tiles.get(`${x}_${y}`);
    if (!t) return 0;
    return t[(ty - y * TILE_PX) * TILE_PX + (tx - x * TILE_PX)]!;
  };
  return (lat, lon) => {
    const r = (lat * Math.PI) / 180;
    const fx = ((lon + 180) / 360) * n * TILE_PX - 0.5;
    const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n * TILE_PX - 0.5;
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    const u = fx - x;
    const v = fy - y;
    return (
      px(x, y) * (1 - u) * (1 - v) +
      px(x + 1, y) * u * (1 - v) +
      px(x, y + 1) * (1 - u) * v +
      px(x + 1, y + 1) * u * v
    );
  };
}

/** Separable box blur, applied `passes` times (≈ Gaussian). */
function blur(data: Float32Array, nx: number, nz: number, radius: number, passes: number): void {
  const tmp = new Float32Array(data.length);
  for (let p = 0; p < passes; p++) {
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        let s = 0;
        let c = 0;
        for (let d = -radius; d <= radius; d++) {
          const ii = i + d;
          if (ii < 0 || ii >= nx) continue;
          s += data[k * nx + ii]!;
          c++;
        }
        tmp[k * nx + i] = s / c;
      }
    }
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        let s = 0;
        let c = 0;
        for (let d = -radius; d <= radius; d++) {
          const kk = k + d;
          if (kk < 0 || kk >= nz) continue;
          s += tmp[kk * nx + i]!;
          c++;
        }
        data[k * nx + i] = s / c;
      }
    }
  }
}

/** Smoothed local height grid covering BBOX plus a margin. */
export async function loadHeightField(step = 4): Promise<HeightField> {
  const dem = await loadDem();
  const [ax, az] = project(BBOX.north, BBOX.west);
  const [bx, bz] = project(BBOX.south, BBOX.east);
  const margin = 60;
  const x0 = Math.floor((ax - margin) / step) * step;
  const z0 = Math.floor((az - margin) / step) * step;
  const nx = Math.ceil((bx + margin - x0) / step) + 1;
  const nz = Math.ceil((bz + margin - z0) / step) + 1;
  const data = new Float32Array(nx * nz);
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const [lat, lon] = unproject(x0 + i * step, z0 + k * step);
      data[k * nx + i] = dem(lat, lon);
    }
  }
  // ~8 m smoothing: removes DEM stair-steps without flattening real hills.
  blur(data, nx, nz, 1, 3);
  const at = (x: number, z: number): number => {
    const fx = Math.min(Math.max((x - x0) / step, 0), nx - 1.001);
    const fz = Math.min(Math.max((z - z0) / step, 0), nz - 1.001);
    const i = Math.floor(fx);
    const k = Math.floor(fz);
    const u = fx - i;
    const v = fz - k;
    const d = (ii: number, kk: number) => data[kk * nx + ii]!;
    return (
      d(i, k) * (1 - u) * (1 - v) +
      d(i + 1, k) * u * (1 - v) +
      d(i, k + 1) * (1 - u) * v +
      d(i + 1, k + 1) * u * v
    );
  };
  return { at, x0, z0, step, nx, nz, data };
}

// `tsx scripts/osm/terrain.ts` prints a quick summary.
if (import.meta.url === `file://${process.argv[1]}`) {
  const hf = await loadHeightField();
  let mn = Infinity;
  let mx = -Infinity;
  let below = 0;
  for (const h of hf.data) {
    mn = Math.min(mn, h);
    mx = Math.max(mx, h);
    if (h < 0.5) below++;
  }
  console.log(`grid ${hf.nx}×${hf.nz} @ ${hf.step} m, x0 ${hf.x0} z0 ${hf.z0}`);
  console.log(
    `height ${mn.toFixed(1)} … ${mx.toFixed(1)} m; ${((below / hf.data.length) * 100).toFixed(0)}% below 0.5 m`,
  );
  // A few landmarks: Coit Tower (Telegraph Hill top), Washington Square, Aquatic Park.
  for (const [name, lat, lon] of [
    ['Coit Tower', 37.80239, -122.40581],
    ['Washington Sq', 37.80081, -122.41018],
    ['Lombard crooked', 37.80214, -122.41874],
    ['Pier 39', 37.80866, -122.40981],
    ['Bay offshore', 37.811, -122.418],
  ] as const) {
    const [x, z] = project(lat, lon);
    console.log(
      `  ${name.padEnd(16)} x ${x.toFixed(0).padStart(6)} z ${z.toFixed(0).padStart(6)}  h ${hf.at(x, z).toFixed(1)}`,
    );
  }
}
