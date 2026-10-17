/**
 * The mapped area and its local coordinate frame, shared by the OSM scripts.
 * Local meters: +x east, +z south (so north is −z, matching three.js "forward"), origin at ORIGIN.
 */

/** North Beach + Fisherman's Wharf (CLAUDE.md §5). */
export const BBOX = { south: 37.795, west: -122.425, north: 37.812, east: -122.4 } as const;

// The local frame is shared with the game (src/game/city/geo.ts).
export { ORIGIN, project, unproject } from '../../src/game/city/geo';

/** Raw downloads (git-ignored) and generated tiles (git-ignored, uploaded with the other assets). */
export const RAW_DIR = 'assets-src/osm';
export const OUT_DIR = 'public/assets/city';
