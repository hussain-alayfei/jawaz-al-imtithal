import type { GeometryChunk } from "../../ifc/standard/model";

/** expressId of the element that owns triangle `face` (ranges are sorted by start). */
export function elementAtFace(ranges: GeometryChunk["ranges"], face: number): number | undefined {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid];
    if (face < r.start) hi = mid - 1;
    else if (face >= r.start + r.count) lo = mid + 1;
    else return r.expressId;
  }
  return undefined;
}
