/**
 * City data format, shared by the offline generator (scripts/osm/) and the runtime loader.
 * Coordinates are local meters: +x east, +z south, +y up (meters above sea level).
 * Map data © OpenStreetMap contributors (ODbL).
 */

export const CITY_FORMAT_VERSION = 2;
export const TILE_SIZE = 250;
/** Sidewalks, lots and parks sit this far above the asphalt (curb height). */
export const CURB = 0.15;

/** Tile binary: "FCT1" | u32 JSON length | JSON (TileHeader) | pad to 4 | attribute buffers. */
export const TILE_MAGIC = 0x31544346; // "FCT1" little-endian

export type AttrType = 'f32' | 'i16' | 'u16' | 'u8' | 'u32';

export interface AttrInfo {
  type: AttrType;
  itemSize: number;
  /** Byte offset into the buffer section. */
  offset: number;
  /** Decoded value = stored * scale + bias (per component; bias length = itemSize). */
  scale?: number;
  bias?: number[];
  /** Integer data read as 0..1 (colors). */
  normalized?: boolean;
}

export interface MeshInfo {
  vertexCount: number;
  indexCount: number;
  index: { type: 'u16' | 'u32'; offset: number };
  /** position (always), plus mesh-specific: uv, color, style. */
  attributes: Record<string, AttrInfo>;
}

/** Ground and building meshes in a tile. Each becomes one draw call. */
export type TileMeshName =
  'asphalt' | 'pavement' | 'grass' | 'sand' | 'curb' | 'pier' | 'markings' | 'buildings';

/** Building facade styles (the `style` vertex attribute; see city/facadeMaterial.ts). */
export const FACADE = {
  victorian: 0,
  shop: 1,
  tower: 2,
  apartment: 3,
  warehouse: 4,
  /** Solid trim color (cornices, bay window frames). */
  trim: 5,
  /** One tall window per face (bay windows). */
  bay: 6,
  /** Fabric (awnings): vertex color, no windows. */
  awning: 7,
  /** Small rooftop structures (vents, stair housings). */
  plain: 8,
} as const;

export interface TileProps {
  /** [x, y, z, scale, rotY] */
  trees: number[][];
  /** [x, y, z, rotY] street lamps; the arm points along rotY (toward the road). */
  lamps: number[][];
  /** [x, y, z, rotY, node, edge] traffic signal poles; heads face rotY (approach `edge` of `node`). */
  signals: number[][];
  /** [x, y, z, rotY, paint] parked cars. */
  parked: number[][];
  /** Overhead trolley wires: polylines of [x, y, z] flattened. */
  wires: number[][];
  /** [x, y, z] wire support poles. */
  wirePoles: number[][];
  /** [x, y, z] traffic cones (knockable). */
  cones: number[][];
}

export function emptyTileProps(): TileProps {
  return { trees: [], lamps: [], signals: [], parked: [], wires: [], wirePoles: [], cones: [] };
}

export interface TileHeader {
  version: number;
  ix: number;
  iz: number;
  meshes: Partial<Record<TileMeshName, MeshInfo>>;
  props: TileProps;
  /** Drivable-surface height on a fine grid over the tile (for placing traffic on the hills). */
  height: HeightGrid;
  /** Collision: indices into `meshes` that go into the tile's trimesh collider. */
  colliders: TileMeshName[];
}

/** Row-major height samples; `data` is base64 of little-endian Int16 centimeters. */
export interface HeightGrid {
  x0: number;
  z0: number;
  step: number;
  nx: number;
  nz: number;
  data: string;
}

export interface TileEntry {
  ix: number;
  iz: number;
  file: string;
  bytes: number;
}

/** A drivable road between two junctions (or dead ends). */
export interface RoadEdge {
  a: number;
  b: number;
  /** Index into CityIndex.streets, or −1 for unnamed. */
  name: number;
  cls: RoadClass;
  oneway: boolean;
  lanes: number;
  /** Lanes heading a → b (two-way roads; one-way roads use all lanes). */
  lanesFwd: number;
  /** Lateral offset of the travel lanes' center (+ = right of a → b), from one-sided parking. */
  laneOffset: number;
  width: number;
  /** On a bus or trolleybus route. */
  bus: boolean;
  /** Polyline [x0, z0, x1, z1, …] from node a to node b. */
  pts: number[];
  length: number;
}

export type RoadClass = 'major' | 'minor' | 'residential' | 'service';

export interface CityIndex {
  version: number;
  tileSize: number;
  origin: { lat: number; lon: number };
  /** World bounds of the mapped area. */
  bounds: { x0: number; z0: number; x1: number; z1: number };
  tiles: TileEntry[];
  spawn: { x: number; y: number; z: number; heading: number };
  streets: string[];
  /** Road graph: node i is [x, y, z] at nodes[3i..3i+2]. */
  nodes: number[];
  edges: RoadEdge[];
  /** Nodes with traffic signals. */
  signals: number[];
  /**
   * Coarse drivable-surface height grid for the whole area (GPS ribbons, map, far traffic).
   * `data` is base64 of little-endian Int16 decimeters.
   */
  height: { x0: number; z0: number; step: number; nx: number; nz: number; data: string };
}

/** Lightweight 2D map layer (minimap + map screen). */
export interface CityMap {
  /** Building footprints, each [x0, z0, x1, z1, …] (decimeters, rounded). */
  buildings: number[][];
  /** Parks/grass polygons, same encoding. */
  parks: number[][];
  /** Piers and decks, same encoding. */
  piers: number[][];
  /** Land outline below sea level is water; the map draws water as the background. */
}

export function tileKey(ix: number, iz: number): string {
  return `${ix}_${iz}`;
}
