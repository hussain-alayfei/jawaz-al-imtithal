import type { Box3 } from "../../ifc/standard/model";

/*
 * Camera views in the scene frame (x = east, y = up, z = -north, metres). Pure functions of the
 * model's boxes, so presets are the same on every load and can be tested.
 */

export type ViewId = "facade" | "section" | "plan" | "networks";
export type Vec3 = [number, number, number];
export interface Pose {
  position: Vec3;
  target: Vec3;
}
export type Side = "south" | "north" | "east" | "west";

/** Outward horizontal normal of each side. */
export const SIDE_NORMAL: Record<Side, [number, number]> = {
  south: [0, 1],
  north: [0, -1],
  east: [1, 0],
  west: [-1, 0],
};

export interface Lens {
  /** Vertical field of view, degrees. */
  fov: number;
  aspect: number;
}

/** Classes that make up the building itself (not its services, furniture or site). */
const BUILDING_CLASS =
  /^IFC(WALL|WALLSTANDARDCASE|WALLELEMENTEDCASE|SLAB|ROOF|CURTAINWALL|COLUMN|BEAM|DOOR|WINDOW|PLATE|MEMBER|RAILING|STAIR|STAIRFLIGHT|RAMP|RAMPFLIGHT|CHIMNEY)$/;
/** Openings and glazing that face the street: they decide which side is the front. */
const OPENING_CLASS = /^IFC(DOOR|WINDOW|PLATE|CURTAINWALL)$/;

/**
 * The box of the building's own elements, so services that run outside it (a grease interceptor
 * in the yard, a meter at the boundary) do not move the site or the framing. Falls back to `all`.
 */
export function buildingBoxOf(products: readonly { ifcType: string; bbox?: Box3 }[], all: Box3): Box3 {
  const box: Box3 = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let n = 0;
  for (const p of products) {
    if (!p.bbox || !BUILDING_CLASS.test(p.ifcType.toUpperCase())) continue;
    n += 1;
    for (let k = 0; k < 3; k++) {
      box.min[k] = Math.min(box.min[k], p.bbox.min[k]);
      box.max[k] = Math.max(box.max[k], p.bbox.max[k]);
    }
  }
  return n ? box : all;
}

/** Door, window and glazing boxes for `frontSide`. */
export function openingsOf(products: readonly { ifcType: string; bbox?: Box3 }[]): Box3[] {
  return products.filter((p) => p.bbox && OPENING_CLASS.test(p.ifcType.toUpperCase())).map((p) => p.bbox!);
}

export const centerOf = (b: Box3): Vec3 => [
  (b.min[0] + b.max[0]) / 2,
  (b.min[1] + b.max[1]) / 2,
  (b.min[2] + b.max[2]) / 2,
];
export const radiusOf = (b: Box3): number =>
  Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2;

const norm2 = (x: number, z: number): [number, number] => {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
};

/** Half-angles of the narrower and wider field (phones are portrait). */
function halfFields(lens: Lens) {
  const v = (lens.fov * Math.PI) / 360;
  const h = Math.atan(Math.tan(v) * lens.aspect);
  return { v, h };
}

/** Distance at which a sphere of `radius` fits the narrower field. */
export function fitDistance(radius: number, lens: Lens, margin = 1): number {
  const { v, h } = halfFields(lens);
  return (radius / Math.sin(Math.min(v, h))) * margin;
}

/**
 * The building's front: the side with the most door and window width, the main entrance side in
 * most plans. `openings` are the boxes of doors and windows; ties go to the south (the default
 * camera side).
 */
export function frontSide(building: Box3, openings: readonly Box3[]): Side {
  const score: Record<Side, number> = { south: 0, north: 0, east: 0, west: 0 };
  const dx = building.max[0] - building.min[0];
  const dz = building.max[2] - building.min[2];
  const near = (a: number, b: number, span: number) => Math.abs(a - b) <= Math.max(0.6, span * 0.06);
  for (const o of openings) {
    const cx = (o.min[0] + o.max[0]) / 2;
    const cz = (o.min[2] + o.max[2]) / 2;
    const wx = o.max[0] - o.min[0];
    const wz = o.max[2] - o.min[2];
    if (near(cz, building.max[2], dz)) score.south += wx;
    else if (near(cz, building.min[2], dz)) score.north += wx;
    else if (near(cx, building.max[0], dx)) score.east += wz;
    else if (near(cx, building.min[0], dx)) score.west += wz;
  }
  const order: Side[] = ["south", "east", "west", "north"];
  return order.reduce((best, side) => (score[side] > score[best] + 1e-6 ? side : best), "south" as Side);
}

export type FacadeLight = "contrast" | "lit" | "shade";

/**
 * Which side face joins the front in a three-quarter view. `contrast` (the default) shows one face
 * in sun and one in shade, the way architects photograph a building so its volume reads; `lit`
 * puts the sun over the camera's shoulder so both faces are lit; `shade` takes the side the sun
 * does not reach, so a low sun's long shadow runs across the ground beside it (golden-hour hero).
 */
export function facadeSide(front: Side, sun: [number, number], prefer: FacadeLight = "contrast"): [number, number] {
  const [fx, fz] = SIDE_NORMAL[front];
  const left: [number, number] = [-fz, fx];
  const right: [number, number] = [fz, -fx];
  const facing = (n: [number, number]) => n[0] * sun[0] + n[1] * sun[1];
  const lit = (n: [number, number]) => Math.max(0, facing(n));
  const frontLit = lit([fx, fz]);
  const score = (n: [number, number]) =>
    prefer === "lit" ? facing(n) : prefer === "shade" ? -facing(n) : Math.abs(lit(n) - frontLit);
  return score(left) >= score(right) ? left : right;
}

/**
 * Exterior three-quarter view near eye level: the camera stands in front of the facade, turned
 * towards one side face (`sun` is the sun's horizontal direction), and frames the whole
 * building with its plinth.
 */
export function facadePose(
  building: Box3,
  front: Side,
  sun: [number, number],
  groundY: number,
  lens: Lens,
  prefer: FacadeLight = "contrast",
  /** Below 1 moves the camera closer (the hero image frames the building tighter). */
  zoom = 1,
  /** How far the camera turns from the front towards the side face, degrees. */
  turnDeg = 34,
): Pose {
  const [fx, fz] = SIDE_NORMAL[front];
  const side = facadeSide(front, sun, prefer);
  const turn = (turnDeg * Math.PI) / 180;
  const [dx, dz] = norm2(fx * Math.cos(turn) + side[0] * Math.sin(turn), fz * Math.cos(turn) + side[1] * Math.sin(turn));
  const c = centerOf(building);
  const height = building.max[1] - groundY;
  // Width of the building seen from this direction (projected box corners on the camera's right axis).
  const rx = -dz, rz = dx;
  let wMin = Infinity, wMax = -Infinity, depth = 0;
  for (const x of [building.min[0], building.max[0]]) {
    for (const z of [building.min[2], building.max[2]]) {
      const w = (x - c[0]) * rx + (z - c[2]) * rz;
      wMin = Math.min(wMin, w);
      wMax = Math.max(wMax, w);
      depth = Math.max(depth, (x - c[0]) * dx + (z - c[2]) * dz);
    }
  }
  const { v, h } = halfFields(lens);
  const half = Math.max((wMax - wMin) / 2 / Math.tan(h), height / 0.62 / Math.tan(v));
  // Portrait screens (phones) crop the building's far ends rather than shrink it to a strip.
  const portrait = lens.aspect < 1 ? 0.8 : 1;
  const distance = (half * 1.1 + depth * 0.5) * zoom * portrait;
  const eye = groundY + Math.min(1.7 + distance * 0.045, 1.7 + height * 0.6);
  const target: Vec3 = [c[0], groundY + Math.min(height * 0.38, 4), c[2]];
  return { position: [c[0] + dx * distance, eye, c[2] + dz * distance], target };
}

/**
 * Street view from a little above eye level, as from a first-floor window on the far corner of the cross
 * street: the building in three-quarters on its corner plot, with its forecourt and the main street running
 * away beside it, so its setting reads. `side` is the side face that joins the front (`facadeSide`).
 */
export function streetPose(building: Box3, front: Side, side: [number, number], groundY: number, lens: Lens): Pose {
  const [fx, fz] = SIDE_NORMAL[front];
  const turn = (50 * Math.PI) / 180;
  const [dx, dz] = norm2(fx * Math.cos(turn) + side[0] * Math.sin(turn), fz * Math.cos(turn) + side[1] * Math.sin(turn));
  const c = centerOf(building);
  const height = building.max[1] - groundY;
  const { v, h } = halfFields(lens);
  const width = Math.max(building.max[0] - building.min[0], building.max[2] - building.min[2]);
  const fit = Math.max((width * 0.75) / Math.tan(h), (height * 2.3) / Math.tan(v));
  const distance = fit * (lens.aspect < 1 ? 1.3 : 1);
  const eye = groundY + 6.5;
  // Aim a little past the building's centre, towards the street it fronts, and below its roof.
  const target: Vec3 = [c[0] + fx * 2, groundY + height * 0.3, c[2] + fz * 2];
  return { position: [c[0] + dx * distance, eye, c[2] + dz * distance], target };
}

/**
 * Dollhouse: a high three-quarter view from the front corner into the cut plan. `side` is the outward
 * normal of the side face the camera turns towards (default: the front's left, seen from outside).
 */
export function sectionPose(building: Box3, front: Side, floorY: number, lens: Lens, side?: [number, number]): Pose {
  const [fx, fz] = SIDE_NORMAL[front];
  side ??= [-fz, fx];
  const [dx, dz] = norm2(fx + side[0] * 0.62, fz + side[1] * 0.62);
  const c = centerOf(building);
  const target: Vec3 = [c[0], floorY + 0.8, c[2]];
  const dir: Vec3 = [dx, 0.85, dz];
  const l = Math.hypot(...dir);
  const d = fitDistance(radiusOf(building), lens, 0.92);
  return { position: [target[0] + (dir[0] / l) * d, target[1] + (dir[1] / l) * d, target[2] + (dir[2] / l) * d], target };
}

/** Plan: straight down on the floor of the shown level, front side at the bottom of the screen. */
export function planPose(building: Box3, front: Side, floorY: number, lens: Lens): Pose {
  const c = centerOf(building);
  const [fx, fz] = SIDE_NORMAL[front];
  const halfX = (building.max[0] - building.min[0]) / 2;
  const halfZ = (building.max[2] - building.min[2]) / 2;
  const { v, h } = halfFields(lens);
  // Screen "up" points away from the front: x/z extents swap when the front is east or west.
  const across = fx !== 0 ? halfZ : halfX;
  const along = fx !== 0 ? halfX : halfZ;
  const d = Math.max(across / Math.tan(h), along / Math.tan(v)) * 1.12 + (building.max[1] - floorY);
  // A tiny offset towards the front keeps OrbitControls' up vector stable.
  return {
    position: [c[0] + fx * 0.01, floorY + d, c[2] + fz * 0.01],
    target: [c[0], floorY, c[2]],
  };
}

/**
 * Services: a higher three-quarter view than the dollhouse, whole building in frame; by default from the
 * other front corner (`side` as in `sectionPose`).
 */
export function networksPose(building: Box3, front: Side, floorY: number, lens: Lens, side?: [number, number]): Pose {
  const [fx, fz] = SIDE_NORMAL[front];
  side ??= [fz, -fx];
  const [dx, dz] = norm2(fx + side[0] * 0.75, fz + side[1] * 0.75);
  const c = centerOf(building);
  const target: Vec3 = [c[0], (floorY + building.max[1]) / 2, c[2]];
  const up = 1.05;
  const l = Math.hypot(dx, up, dz);
  const d = fitDistance(radiusOf(building), lens, 0.86);
  return { position: [target[0] + (dx / l) * d, target[1] + (up / l) * d, target[2] + (dz / l) * d], target };
}

export interface FocusOptions {
  /** A height finding (e.g. wall tiles) is read face-on from the room; a width finding from above. */
  axis?: "width" | "height";
  /** Floor level of the element's storey. */
  floorY: number;
  /** Plan centre of the room the element serves (its containing space), if known. */
  room?: [number, number];
  /** Measured height, so the camera frames the measured top. */
  value?: number;
  /** Services: a wider, less steep view, so the run can be followed from the element. */
  services?: boolean;
}

/** Close view of one element from the side that shows it, looking into the cut. */
export function focusPose(element: Box3, building: Box3, lens: Lens, options: FocusOptions): Pose {
  const c = centerOf(element);
  const b = centerOf(building);
  const ext: Vec3 = [element.max[0] - element.min[0], element.max[1] - element.min[1], element.max[2] - element.min[2]];
  const r = radiusOf(element);
  if (options.axis === "height") {
    // Face the wall from the room side, turned 28 degrees, high enough to see over the cut.
    const thinX = ext[0] < ext[2];
    const room = options.room ?? [b[0], b[2]];
    const inward: [number, number] = thinX ? [Math.sign(room[0] - c[0]) || 1, 0] : [0, Math.sign(room[1] - c[2]) || 1];
    const turn = (28 * Math.PI) / 180;
    const across: [number, number] = [-inward[1], inward[0]];
    const [dx, dz] = norm2(
      inward[0] * Math.cos(turn) + across[0] * Math.sin(turn),
      inward[1] * Math.cos(turn) + across[1] * Math.sin(turn),
    );
    const span = Math.max(ext[0], ext[2], options.value ?? 0, 2.4);
    const d = Math.max(5.5, fitDistance(span / 2, lens, 1.25));
    const targetY = options.floorY + Math.max(0.9, (options.value ?? 1.8) * 0.5);
    const elevation = (38 * Math.PI) / 180;
    return {
      position: [c[0] + dx * d * Math.cos(elevation), targetY + d * Math.sin(elevation), c[2] + dz * d * Math.cos(elevation)],
      target: [c[0], targetY, c[2]],
    };
  }
  // Look down into the cut plan from outside the building, on the element's side.
  const target: Vec3 = [c[0], Math.min(c[1], element.min[1] + 1.0), c[2]];
  let [ox, oz] = [c[0] - b[0], c[2] - b[2]];
  if (Math.hypot(ox, oz) < 0.5) [ox, oz] = [-0.6, 1];
  const [nx, nz] = norm2(ox, oz);
  const dir: Vec3 = options.services ? [nx * 0.9 + 0.2, 0.95, nz * 0.9 + 0.25] : [nx * 0.62 + 0.18, 1, nz * 0.62 + 0.22];
  const l = Math.hypot(...dir);
  const d = options.services ? Math.max(12, r * 10) : Math.max(7, r * 7);
  return { position: [target[0] + (dir[0] / l) * d, target[1] + (dir[1] / l) * d, target[2] + (dir[2] / l) * d], target };
}
