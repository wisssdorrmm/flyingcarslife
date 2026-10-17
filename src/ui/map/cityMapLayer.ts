/**
 * The city drawn once into an offscreen canvas (roads, sidewalks, building footprints, places).
 * The full map and the minimap draw this image with their own pan/zoom/rotation on top.
 */
import { cityPlaces } from '../../game/places/placement';
import { cityBuildings } from '../../game/world/buildingLayout';
import { BLOCKS, END_BUILDING_DEPTH, EXTENT, halfWidth, ROADS } from '../../game/world/cityPlan';

/** Half-size of the mapped area in meters (city plus the buildings closing each road). */
export const MAP_HALF = EXTENT + END_BUILDING_DEPTH + 10;
/** Pixels per meter in the cached layer. */
export const MAP_SCALE = 2;

export const MAP_COLORS = {
  background: '#141920',
  sidewalk: '#2a313b',
  building: '#3b4552',
  buildingEdge: '#4a5563',
  road: '#5c6673',
  roadEdge: '#6d7785',
  route: '#b46bff',
  player: '#ffffff',
  waypoint: '#ffcc33',
};

/** World meters → layer pixels. */
export const toLayer = (v: number) => (v + MAP_HALF) * MAP_SCALE;

let cached: HTMLCanvasElement | null = null;

export function cityMapLayer(): HTMLCanvasElement {
  if (cached) return cached;
  const size = Math.ceil(MAP_HALF * 2 * MAP_SCALE);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const rect = (x0: number, z0: number, x1: number, z1: number) =>
    ctx.fillRect(toLayer(x0), toLayer(z0), (x1 - x0) * MAP_SCALE, (z1 - z0) * MAP_SCALE);

  ctx.fillStyle = MAP_COLORS.background;
  ctx.fillRect(0, 0, size, size);

  // Roads first (full width), then sidewalks and buildings on top of the blocks.
  ctx.fillStyle = MAP_COLORS.road;
  for (const r of ROADS) {
    const hw = halfWidth(r);
    if (r.axis === 'x') rect(-EXTENT, r.coord - hw, EXTENT, r.coord + hw);
    else rect(r.coord - hw, -EXTENT, r.coord + hw, EXTENT);
  }
  ctx.fillStyle = MAP_COLORS.sidewalk;
  for (const b of BLOCKS) {
    rect(
      Math.max(b.sx0, -MAP_HALF),
      Math.max(b.sz0, -MAP_HALF),
      Math.min(b.sx1, MAP_HALF),
      Math.min(b.sz1, MAP_HALF),
    );
  }

  const placeColor = new Map(cityPlaces().map((p) => [p.building.id, p.sign.accent]));
  ctx.lineWidth = 1;
  for (const b of cityBuildings()) {
    ctx.fillStyle = placeColor.get(b.id) ?? MAP_COLORS.building;
    rect(b.x0 + 0.4, b.z0 + 0.4, b.x1 - 0.4, b.z1 - 0.4);
    ctx.strokeStyle = MAP_COLORS.buildingEdge;
    ctx.strokeRect(
      toLayer(b.x0 + 0.4),
      toLayer(b.z0 + 0.4),
      (b.x1 - b.x0 - 0.8) * MAP_SCALE,
      (b.z1 - b.z0 - 0.8) * MAP_SCALE,
    );
  }

  // Center lines, subtle.
  ctx.strokeStyle = 'rgba(242, 194, 48, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const r of ROADS) {
    if (r.axis === 'x') {
      ctx.moveTo(toLayer(-EXTENT), toLayer(r.coord));
      ctx.lineTo(toLayer(EXTENT), toLayer(r.coord));
    } else {
      ctx.moveTo(toLayer(r.coord), toLayer(-EXTENT));
      ctx.lineTo(toLayer(r.coord), toLayer(EXTENT));
    }
  }
  ctx.stroke();

  cached = canvas;
  return canvas;
}

/** Short glyph per place type for map icons. */
export const PLACE_ICON: Record<string, string> = {
  coffee: '☕',
  diner: '🍔',
  market: '🛒',
  gym: '🏋',
  police: '🚓',
  school: '🎓',
  hospital: '🏥',
  bank: '🏦',
  arcade: '🎮',
  home: '🏠',
  skyport: '✈',
  dealer: '🚗',
  clothing: '👕',
  pharmacy: '💊',
};
