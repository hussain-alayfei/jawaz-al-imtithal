import type { Box3, StandardDoor, StandardSpace } from "./model";

/*
 * Plan geometry on space footprints (the floor triangles of each IfcSpace), so rooms of any
 * shape and on any storey are related correctly. Coordinates: x = east, z = -north, y = up.
 */

function inTriangle(px: number, pz: number, t: number[], i: number): boolean {
  const [ax, az, bx, bz, cx, cz] = [t[i], t[i + 1], t[i + 2], t[i + 3], t[i + 4], t[i + 5]];
  const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz);
  const d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz);
  const d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function segmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az;
  const len2 = vx * vx + vz * vz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / len2)) : 0;
  return Math.hypot(px - (ax + t * vx), pz - (az + t * vz));
}

/** True when height y falls within the space's vertical extent (same storey). */
export function atLevel(space: StandardSpace, y: number, tolerance = 0.05): boolean {
  return Boolean(space.bbox && y >= space.bbox.min[1] - tolerance && y <= space.bbox.max[1] + tolerance);
}

/** Plan distance from a point to the space's floor (0 inside). Falls back to the bounding box. */
export function distanceToSpace(space: StandardSpace, x: number, z: number): number {
  const fp = space.footprint;
  if (!fp?.length) {
    if (!space.bbox) return Infinity;
    const b = space.bbox;
    return Math.hypot(Math.max(b.min[0] - x, 0, x - b.max[0]), Math.max(b.min[2] - z, 0, z - b.max[2]));
  }
  let best = Infinity;
  for (let i = 0; i < fp.length; i += 6) {
    if (inTriangle(x, z, fp, i)) return 0;
    best = Math.min(
      best,
      segmentDistance(x, z, fp[i], fp[i + 1], fp[i + 2], fp[i + 3]),
      segmentDistance(x, z, fp[i + 2], fp[i + 3], fp[i + 4], fp[i + 5]),
      segmentDistance(x, z, fp[i + 4], fp[i + 5], fp[i], fp[i + 1]),
    );
  }
  return best;
}

/** The space whose floor contains the point at height y, if any. */
export function spaceAt(spaces: StandardSpace[], x: number, y: number, z: number): StandardSpace | undefined {
  return spaces.find((s) => atLevel(s, y) && distanceToSpace(s, x, z) === 0);
}

/** Smallest plan gap between two spaces on the same storey (Infinity on different storeys). */
export function spaceGap(a: StandardSpace, b: StandardSpace): number {
  if (!a.bbox || !b.bbox) return Infinity;
  const overlap = Math.min(a.bbox.max[1], b.bbox.max[1]) - Math.max(a.bbox.min[1], b.bbox.min[1]);
  if (overlap <= 0.1) return Infinity;
  const vertices = (s: StandardSpace) => {
    const fp = s.footprint;
    if (fp?.length) {
      const out: [number, number][] = [];
      for (let i = 0; i < fp.length; i += 2) out.push([fp[i], fp[i + 1]]);
      return out;
    }
    const bb = s.bbox!;
    return [[bb.min[0], bb.min[2]], [bb.max[0], bb.min[2]], [bb.max[0], bb.max[2]], [bb.min[0], bb.max[2]]] as [number, number][];
  };
  let best = Infinity;
  for (const [x, z] of vertices(a)) best = Math.min(best, distanceToSpace(b, x, z));
  for (const [x, z] of vertices(b)) best = Math.min(best, distanceToSpace(a, x, z));
  return best;
}

/** The spaces on either side of a door (undefined = outside), from its geometry. */
export function doorSides(
  door: StandardDoor,
  spaces: StandardSpace[],
): [StandardSpace | undefined, StandardSpace | undefined] | undefined {
  const b: Box3 | undefined = door.bbox;
  if (!b) return undefined;
  const dx = b.max[0] - b.min[0];
  const dz = b.max[2] - b.min[2];
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  const y = b.min[1] + 0.5;
  // The door's thin horizontal side is across the wall: step past it on both sides.
  const acrossX = dx < dz;
  const step = (acrossX ? dx : dz) / 2 + 0.25;
  const a = acrossX ? spaceAt(spaces, cx - step, y, cz) : spaceAt(spaces, cx, y, cz - step);
  const c = acrossX ? spaceAt(spaces, cx + step, y, cz) : spaceAt(spaces, cx, y, cz + step);
  return [a, c];
}
