/** Loads assets-src/osm/osm.json into projected nodes, ways and relations. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { project, RAW_DIR } from './area';
import type { Poly, Pt, Ring } from './geom';

export type Tags = Record<string, string>;

export interface OsmNode {
  id: number;
  p: Pt;
  tags?: Tags;
}
export interface OsmWay {
  id: number;
  nodes: number[];
  tags: Tags;
}
export interface OsmRelation {
  id: number;
  members: { type: 'node' | 'way' | 'relation'; ref: number; role: string }[];
  tags: Tags;
}

export interface Osm {
  nodes: Map<number, OsmNode>;
  ways: Map<number, OsmWay>;
  relations: OsmRelation[];
  /** Way → node positions (missing nodes dropped). */
  pts(way: OsmWay): Ring;
}

interface RawElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  members?: OsmRelation['members'];
  tags?: Tags;
}

export async function loadOsm(): Promise<Osm> {
  const raw = JSON.parse(await readFile(join(RAW_DIR, 'osm.json'), 'utf8')) as {
    elements: RawElement[];
  };
  const nodes = new Map<number, OsmNode>();
  const ways = new Map<number, OsmWay>();
  const relations: OsmRelation[] = [];
  for (const e of raw.elements) {
    if (e.type === 'node' && e.lat !== undefined && e.lon !== undefined) {
      const prev = nodes.get(e.id);
      nodes.set(e.id, { id: e.id, p: project(e.lat, e.lon), tags: e.tags ?? prev?.tags });
    } else if (e.type === 'way' && e.nodes) {
      ways.set(e.id, { id: e.id, nodes: e.nodes, tags: e.tags ?? {} });
    } else if (e.type === 'relation' && e.members) {
      relations.push({ id: e.id, members: e.members, tags: e.tags ?? {} });
    }
  }
  const pts = (w: OsmWay): Ring => {
    const out: Ring = [];
    for (const id of w.nodes) {
      const n = nodes.get(id);
      if (n) out.push(n.p);
    }
    return out;
  };
  return { nodes, ways, relations, pts };
}

export const isClosed = (w: OsmWay) => w.nodes.length >= 4 && w.nodes[0] === w.nodes.at(-1);

/** Drops the duplicated closing point of a closed way. */
export function openRing(r: Ring): Ring {
  const a = r[0];
  const b = r.at(-1);
  return a && b && a[0] === b[0] && a[1] === b[1] ? r.slice(0, -1) : r;
}

/** Joins way node lists end-to-end into closed rings (multipolygon members). */
function assembleRings(osm: Osm, wayIds: number[]): Ring[] {
  const pending = wayIds
    .map((id) => osm.ways.get(id)?.nodes.slice())
    .filter((n): n is number[] => !!n && n.length >= 2);
  const rings: Ring[] = [];
  while (pending.length) {
    let cur = pending.shift()!;
    let grew = true;
    while (cur[0] !== cur.at(-1) && grew) {
      grew = false;
      for (let i = 0; i < pending.length; i++) {
        const w = pending[i]!;
        const end = cur.at(-1)!;
        if (w[0] === end) cur = cur.concat(w.slice(1));
        else if (w.at(-1) === end) cur = cur.concat(w.slice(0, -1).reverse());
        else continue;
        pending.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (cur[0] !== cur.at(-1) || cur.length < 4) continue; // unclosed (clipped by the download box)
    const ring = openRing(osm.pts({ id: 0, nodes: cur, tags: {} }));
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

/**
 * Area features matching `match`: closed ways plus multipolygon relations (outer rings with
 * their inner rings as holes). Returns polygons with the feature's tags.
 */
export function areas(
  osm: Osm,
  match: (t: Tags) => boolean,
): { poly: Poly; tags: Tags; id: number }[] {
  const out: { poly: Poly; tags: Tags; id: number }[] = [];
  const inRelation = new Set<number>();
  for (const r of osm.relations) {
    if (r.tags.type !== 'multipolygon' || !match(r.tags)) continue;
    const outerIds = r.members
      .filter((m) => m.type === 'way' && m.role !== 'inner')
      .map((m) => m.ref);
    const innerIds = r.members
      .filter((m) => m.type === 'way' && m.role === 'inner')
      .map((m) => m.ref);
    for (const id of outerIds) inRelation.add(id);
    const inners = assembleRings(osm, innerIds);
    for (const outer of assembleRings(osm, outerIds)) {
      out.push({ poly: { outer, holes: inners }, tags: r.tags, id: r.id });
    }
  }
  for (const w of osm.ways.values()) {
    if (!isClosed(w) || inRelation.has(w.id) || !match(w.tags)) continue;
    const outer = openRing(osm.pts(w));
    if (outer.length >= 3) out.push({ poly: { outer, holes: [] }, tags: w.tags, id: w.id });
  }
  return out;
}

/** Parses "12", "12 m", "12.5m", "40'" / "40 ft" into meters. */
export function parseMeters(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const m = /^\s*([\d.]+)\s*(m|ft|')?\s*$/.exec(v);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  return m[2] === 'ft' || m[2] === "'" ? n * 0.3048 : n;
}
