/**
 * The mapped area and its local coordinate frame, shared by the OSM scripts.
 * Local meters: +x east, +z south (so north is −z, matching three.js "forward"), origin at ORIGIN.
 */

/** North Beach + Fisherman's Wharf (CLAUDE.md §5). */
export const BBOX = { south: 37.795, west: -122.425, north: 37.812, east: -122.4 } as const;

/** Local origin, near Washington Square. */
export const ORIGIN = { lat: 37.8035, lon: -122.4125 } as const;

const M_PER_DEG_LAT = 110_950;
const M_PER_DEG_LON = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

export function project(lat: number, lon: number): [x: number, z: number] {
  return [(lon - ORIGIN.lon) * M_PER_DEG_LON, -(lat - ORIGIN.lat) * M_PER_DEG_LAT];
}

export function unproject(x: number, z: number): [lat: number, lon: number] {
  return [ORIGIN.lat - z / M_PER_DEG_LAT, ORIGIN.lon + x / M_PER_DEG_LON];
}

/** Raw downloads (git-ignored) and generated tiles (git-ignored, uploaded with the other assets). */
export const RAW_DIR = 'assets-src/osm';
export const OUT_DIR = 'public/assets/city';
