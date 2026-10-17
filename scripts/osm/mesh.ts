/** Mesh accumulation and the tile binary writer (format in src/game/city/format.ts). */
import { gzipSync } from 'node:zlib';
import {
  CITY_FORMAT_VERSION,
  TILE_MAGIC,
  TILE_SIZE,
  type AttrInfo,
  type MeshInfo,
  type TileHeader,
  type TileMeshName,
  type TileProps,
} from '../../src/game/city/format';

/** Triangle mesh with optional per-vertex extras. Vertices dedupe when `weld` is on. */
export class MeshBuilder {
  pos: number[] = [];
  uv: number[] = [];
  color: number[] = [];
  style: number[] = [];
  idx: number[] = [];
  private weldMap: Map<string, number> | null;
  constructor(weld = false) {
    this.weldMap = weld ? new Map() : null;
  }
  get vertexCount(): number {
    return this.pos.length / 3;
  }
  /** Adds a vertex; extras are pushed only if given (keep them consistent within a mesh). */
  vert(
    x: number,
    y: number,
    z: number,
    uv?: [number, number],
    color?: number[],
    style?: number,
  ): number {
    if (this.weldMap) {
      const key = `${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(z * 100)}`;
      const hit = this.weldMap.get(key);
      if (hit !== undefined) return hit;
      this.weldMap.set(key, this.vertexCount);
    }
    this.pos.push(x, y, z);
    if (uv) this.uv.push(uv[0], uv[1]);
    if (color) this.color.push(color[0]!, color[1]!, color[2]!);
    if (style !== undefined) this.style.push(style);
    return this.vertexCount - 1;
  }
  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }
  /** Quad a-b-c-d (counter-clockwise seen from the front). */
  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }
}

class BufferWriter {
  chunks: Buffer[] = [];
  size = 0;
  push(buf: Buffer): number {
    const pad = (4 - (this.size % 4)) % 4;
    if (pad) {
      this.chunks.push(Buffer.alloc(pad));
      this.size += pad;
    }
    const offset = this.size;
    this.chunks.push(buf);
    this.size += buf.length;
    return offset;
  }
}

function typed(type: AttrInfo['type'], values: ArrayLike<number>): Buffer {
  const arr =
    type === 'f32'
      ? Float32Array.from(values)
      : type === 'i16'
        ? Int16Array.from(values)
        : type === 'u16'
          ? Uint16Array.from(values)
          : type === 'u32'
            ? Uint32Array.from(values)
            : Uint8Array.from(values);
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

/** Quantizes to int16 with the given step around `center`; throws if out of range. */
function quantize(values: number[], itemSize: number, step: number, center: number[]): number[] {
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    const q = Math.round((values[i]! - center[i % itemSize]!) / step);
    out[i] = Math.max(-32767, Math.min(32767, q));
  }
  return out;
}

export function encodeTile(
  ix: number,
  iz: number,
  meshes: Partial<Record<TileMeshName, MeshBuilder>>,
  props: TileProps,
  colliders: TileMeshName[],
): Buffer {
  const w = new BufferWriter();
  const infos: Partial<Record<TileMeshName, MeshInfo>> = {};
  // Positions: 1 cm steps around the tile center (x/z) and 150 m (y): ±327 m covers everything.
  const center = [(ix + 0.5) * TILE_SIZE, 150, (iz + 0.5) * TILE_SIZE];
  for (const [name, m] of Object.entries(meshes) as [TileMeshName, MeshBuilder][]) {
    if (!m.idx.length) continue;
    const attributes: Record<string, AttrInfo> = {};
    attributes.position = {
      type: 'i16',
      itemSize: 3,
      scale: 0.01,
      bias: center,
      offset: w.push(typed('i16', quantize(m.pos, 3, 0.01, center))),
    };
    if (m.uv.length) {
      // Facade UVs in meters (u up to ~650 m around big buildings): 2 cm steps.
      attributes.uv = {
        type: 'i16',
        itemSize: 2,
        scale: 0.02,
        bias: [0, 0],
        offset: w.push(typed('i16', quantize(m.uv, 2, 0.02, [0, 0]))),
      };
    }
    if (m.color.length) {
      attributes.color = {
        type: 'u8',
        itemSize: 3,
        normalized: true,
        offset: w.push(
          typed(
            'u8',
            m.color.map((c) => Math.round(c * 255)),
          ),
        ),
      };
    }
    if (m.style.length) {
      attributes.style = { type: 'u8', itemSize: 1, offset: w.push(typed('u8', m.style)) };
    }
    const big = m.vertexCount > 65535;
    infos[name] = {
      vertexCount: m.vertexCount,
      indexCount: m.idx.length,
      index: { type: big ? 'u32' : 'u16', offset: w.push(typed(big ? 'u32' : 'u16', m.idx)) },
      attributes,
    };
  }
  const header: TileHeader = {
    version: CITY_FORMAT_VERSION,
    ix,
    iz,
    meshes: infos,
    props,
    colliders,
  };
  const json = Buffer.from(JSON.stringify(header));
  const pre = Buffer.alloc(8);
  pre.writeUInt32LE(TILE_MAGIC, 0);
  pre.writeUInt32LE(json.length, 4);
  const jsonPad = Buffer.alloc((4 - ((8 + json.length) % 4)) % 4);
  return gzipSync(Buffer.concat([pre, json, jsonPad, ...w.chunks]), { level: 9 });
}
