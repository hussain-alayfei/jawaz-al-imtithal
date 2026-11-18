import type { GeometryCategory, GeometryChunk, StandardProduct, SystemKind } from "../../ifc/standard/model";
import { finishFor, type Finish } from "./finishes";
import { layerOf, type LayerKind } from "./networks";

/*
 * A "part" is the set of triangles of one chunk drawn with one material: a category split by
 * finish (and, when the file has systems, by whether the element belongs to one), or the services
 * geometry split by system kind. Parts share the chunk's vertex buffers and only own an index
 * buffer plus a re-based face table, so picking still maps every triangle to its element.
 */

export type Range = GeometryChunk["ranges"][number];

export interface PartSpec {
  key: string;
  category: GeometryCategory;
  finish: Finish | "service";
  /** Services geometry: the system layer it is drawn on. */
  layer?: LayerKind;
  /** A building element (not services geometry) that the file assigns to a system. */
  member: boolean;
  /** Window panes split from their frames. */
  pane: "glass" | "frame" | undefined;
  index: Uint32Array;
  /** Sorted by start, in triangles of `index`. */
  ranges: Range[];
}

export interface PartInputs {
  products: ReadonlyMap<number, Pick<StandardProduct, "ifcType" | "name" | "predefinedType">>;
  kinds: ReadonlyMap<number, SystemKind>;
}

/** Mean display colour of the triangles in `range` (first vertex of each triangle). */
export function meanColor(chunk: GeometryChunk, range: Range): [number, number, number] {
  let r = 0, g = 0, b = 0, n = 0;
  const end = (range.start + range.count) * 3;
  const step = Math.max(3, Math.floor((range.count / 64)) * 3);
  for (let t = range.start * 3; t < end; t += step) {
    const v = chunk.indices[t] * 3;
    r += chunk.colors[v];
    g += chunk.colors[v + 1];
    b += chunk.colors[v + 2];
    n += 1;
  }
  return n ? [r / n, g / n, b / n] : [0.8, 0.8, 0.8];
}

/**
 * Splits a glazed element's triangles into the pane and its frame: pane triangles face along the
 * element's thinnest axis and are not slivers (frame members are a few centimetres wide).
 */
export function splitGlazing(chunk: GeometryChunk, range: Range): { glass: number[]; frame: number[] } {
  const p = chunk.positions;
  const ix = chunk.indices;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let t = range.start * 3; t < (range.start + range.count) * 3; t++) {
    const v = ix[t] * 3;
    for (let k = 0; k < 3; k++) {
      if (p[v + k] < min[k]) min[k] = p[v + k];
      if (p[v + k] > max[k]) max[k] = p[v + k];
    }
  }
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const thin = ext[0] <= ext[1] && ext[0] <= ext[2] ? 0 : ext[1] <= ext[2] ? 1 : 2;
  const others = ext.filter((_, k) => k !== thin);
  const minSpan = Math.min(...others);
  const sliver = Math.min(0.12, minSpan * 0.25);
  const glass: number[] = [];
  const frame: number[] = [];
  for (let f = range.start; f < range.start + range.count; f++) {
    const a = ix[f * 3] * 3, b = ix[f * 3 + 1] * 3, c = ix[f * 3 + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const area2 = Math.hypot(nx, ny, nz);
    if (area2 < 1e-9) {
      frame.push(f);
      continue;
    }
    const along = Math.abs([nx, ny, nz][thin]) / area2;
    const wx = p[c] - p[b], wy = p[c + 1] - p[b + 1], wz = p[c + 2] - p[b + 2];
    const longest = Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz), Math.hypot(wx, wy, wz));
    const altitude = area2 / longest;
    (along > 0.9 && altitude > sliver ? glass : frame).push(f);
  }
  return { glass, frame };
}

class PartBuilder {
  faces: number[] = [];
  ranges: Range[] = [];
  constructor(
    readonly key: string,
    readonly category: GeometryCategory,
    readonly finish: Finish | "service",
    readonly member: boolean,
    readonly pane: "glass" | "frame" | undefined,
    readonly layer?: LayerKind,
  ) {}

  add(expressId: number, faces: Iterable<number>) {
    for (const f of faces) {
      const last = this.ranges[this.ranges.length - 1];
      const at = this.faces.length;
      if (last && last.expressId === expressId && last.start + last.count === at) last.count += 1;
      else this.ranges.push({ expressId, start: at, count: 1 });
      this.faces.push(f);
    }
  }

  build(chunk: GeometryChunk): PartSpec {
    const index = new Uint32Array(this.faces.length * 3);
    for (let i = 0; i < this.faces.length; i++) {
      const f = this.faces[i] * 3;
      index[i * 3] = chunk.indices[f];
      index[i * 3 + 1] = chunk.indices[f + 1];
      index[i * 3 + 2] = chunk.indices[f + 2];
    }
    return {
      key: this.key,
      category: this.category,
      finish: this.finish,
      layer: this.layer,
      member: this.member,
      pane: this.pane,
      index,
      ranges: this.ranges,
    };
  }
}

function* span(start: number, count: number) {
  for (let f = start; f < start + count; f++) yield f;
}

/** Parts of one chunk, in a stable order (first appearance). */
export function partsOfChunk(chunk: GeometryChunk, inputs: PartInputs): PartSpec[] {
  const builders = new Map<string, PartBuilder>();
  const builder = (key: string, make: () => PartBuilder) => {
    let b = builders.get(key);
    if (!b) builders.set(key, (b = make()));
    return b;
  };
  const finishOf = new Map<number, Finish>();
  for (const range of chunk.ranges) {
    const id = range.expressId;
    if (chunk.category === "mep") {
      const layer = layerOf(inputs.kinds, id);
      builder(`mep:${layer}`, () => new PartBuilder(`mep:${layer}`, "mep", "service", false, undefined, layer)).add(
        id,
        span(range.start, range.count),
      );
      continue;
    }
    if (chunk.category === "space") {
      builder("space", () => new PartBuilder("space", "space", "generic", false, undefined)).add(id, span(range.start, range.count));
      continue;
    }
    let finish = finishOf.get(id);
    if (!finish) {
      const product = inputs.products.get(id);
      finish = finishFor({
        category: chunk.category,
        ifcType: product?.ifcType ?? "",
        name: product?.name,
        predefinedType: product?.predefinedType,
        color: meanColor(chunk, range),
      });
      finishOf.set(id, finish);
    }
    const member = inputs.kinds.has(id);
    const tag = member ? ":sys" : "";
    if (finish === "glass") {
      const { glass, frame } = splitGlazing(chunk, range);
      const gk = `${chunk.category}:glass${tag}`;
      const fk = `${chunk.category}:frame${tag}`;
      if (glass.length) builder(gk, () => new PartBuilder(gk, chunk.category, "glass", member, "glass")).add(id, glass);
      if (frame.length) builder(fk, () => new PartBuilder(fk, chunk.category, "aluminium", member, "frame")).add(id, frame);
      continue;
    }
    const key = `${chunk.category}:${finish}${tag}`;
    builder(key, () => new PartBuilder(key, chunk.category, finish!, member, undefined)).add(id, span(range.start, range.count));
  }
  return [...builders.values()].map((b) => b.build(chunk));
}

/** Indices (into the chunk's vertices) of every triangle of one element across the given parts. */
export function elementIndex(parts: readonly Pick<PartSpec, "index" | "ranges">[], expressId: number): Uint32Array | undefined {
  const pieces: Uint32Array[] = [];
  let total = 0;
  for (const part of parts) {
    for (const r of part.ranges) {
      if (r.expressId !== expressId) continue;
      const slice = part.index.subarray(r.start * 3, (r.start + r.count) * 3);
      pieces.push(slice);
      total += slice.length;
    }
  }
  if (!total) return undefined;
  const out = new Uint32Array(total);
  let offset = 0;
  for (const piece of pieces) {
    out.set(piece, offset);
    offset += piece.length;
  }
  return out;
}
