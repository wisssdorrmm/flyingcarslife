/**
 * The real city drawn once into an offscreen canvas: bay and coastline (from the height grid),
 * parks, piers, building footprints and every street. The full map and the minimap draw this image
 * with their own pan/zoom/rotation on top.
 */
import { loadCity, loadCityMap, type City } from '../../game/city/cityData';

/** Pixels per meter in the cached layer. */
export const MAP_SCALE = 1;

export const MAP_COLORS = {
  water: '#0e2733',
  land: '#1a2129',
  park: '#1f3a2c',
  pier: '#29313a',
  building: '#2e3843',
  buildingEdge: '#394552',
  road: '#56616d',
  roadMajor: '#7a8693',
  route: '#2fd5c0',
  player: '#ffffff',
  waypoint: '#ffcc33',
};

export interface MapLayer {
  canvas: HTMLCanvasElement;
  /** World coordinates of the layer's top-left pixel. */
  x0: number;
  z0: number;
}

let cached: MapLayer | null = null;
let pending: Promise<MapLayer> | null = null;

/** The layer if it's ready (starts building it otherwise). */
export function cityMapLayer(): MapLayer | null {
  if (!cached && !pending) {
    pending = Promise.all([loadCity(), loadCityMap()]).then(([city, map]) => {
      cached = draw(city, map);
      return cached;
    });
  }
  return cached;
}

function draw(city: City, map: Awaited<ReturnType<typeof loadCityMap>>): MapLayer {
  const { x0, z0, step, nx, nz } = city.index.height;
  const w = Math.ceil((nx - 1) * step * MAP_SCALE);
  const h = Math.ceil((nz - 1) * step * MAP_SCALE);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const X = (x: number) => (x - x0) * MAP_SCALE;
  const Z = (z: number) => (z - z0) * MAP_SCALE;

  // Land vs bay from the height grid, scaled up smoothly for a soft coastline.
  const mask = document.createElement('canvas');
  mask.width = nx;
  mask.height = nz;
  const mctx = mask.getContext('2d')!;
  const img = mctx.createImageData(nx, nz);
  const water = [0x0e, 0x27, 0x33];
  const land = [0x1a, 0x21, 0x29];
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const y = city.heightAt(x0 + i * step, z0 + k * step);
      const c = y > 0.3 ? land : water;
      const o = (k * nx + i) * 4;
      img.data[o] = c[0]!;
      img.data[o + 1] = c[1]!;
      img.data[o + 2] = c[2]!;
      img.data[o + 3] = 255;
    }
  }
  mctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mask, 0, 0, w, h);

  const poly = (flat: number[]) => {
    ctx.beginPath();
    for (let i = 0; i < flat.length; i += 2) {
      const x = X(flat[i]! / 10);
      const y = Z(flat[i + 1]! / 10);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
  };
  ctx.fillStyle = MAP_COLORS.park;
  for (const p of map.parks) {
    poly(p);
    ctx.fill();
  }
  ctx.fillStyle = MAP_COLORS.pier;
  for (const p of map.piers) {
    poly(p);
    ctx.fill();
  }

  // Streets: minor first, major on top.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const edges = [...city.index.edges].sort(
    (a, b) => Number(a.cls === 'major') - Number(b.cls === 'major'),
  );
  for (const e of edges) {
    ctx.strokeStyle =
      e.cls === 'major' || e.cls === 'minor' ? MAP_COLORS.roadMajor : MAP_COLORS.road;
    ctx.lineWidth = Math.max(2, e.width * MAP_SCALE * 0.9);
    ctx.beginPath();
    for (let i = 0; i < e.pts.length; i += 2) {
      const x = X(e.pts[i]!);
      const y = Z(e.pts[i + 1]!);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  ctx.fillStyle = MAP_COLORS.building;
  ctx.strokeStyle = MAP_COLORS.buildingEdge;
  ctx.lineWidth = 1;
  for (const b of map.buildings) {
    poly(b);
    ctx.fill();
    ctx.stroke();
  }
  return { canvas, x0, z0 };
}
