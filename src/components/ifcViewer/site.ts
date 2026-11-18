import type { Box3 } from "../../ifc/standard/model";
import { SIDE_NORMAL, type Side } from "./views";

/*
 * Context only, not from the file: a paved plot raised one kerb above the street, an asphalt
 * street along the building's front, and desert sand beyond. Sizes follow common Riyadh
 * practice (15 cm kerbs, 7.5 m two-lane local street); the plot margin grows with the building.
 */

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface SiteLayout {
  /** Top of the paving: the storey's floor level (a hair below, so the floor finish wins). */
  plazaY: number;
  /** Street and sand level, one kerb below the paving. */
  streetY: number;
  plaza: Rect;
  /** Kerb stones along the plot edge, on the paving. */
  kerbs: Rect[];
  street: Rect;
  /** Dashed centre line. */
  markings: Rect[];
}

export const KERB_HEIGHT = 0.15;
export const KERB_WIDTH = 0.15;
const STREET_WIDTH = 7.5;
const STREET_LENGTH = 260;

/** Rect in a frame where the front faces +z, mapped to the world for the given front side. */
function place(r: Rect, front: Side, cx: number, cz: number): Rect {
  const [fx, fz] = SIDE_NORMAL[front];
  // local +z -> front normal, local +x -> the front's right-hand axis seen from outside
  const map = (x: number, z: number): [number, number] => [cx + x * fz + z * fx, cz - x * fx + z * fz];
  const [ax, az] = map(r.x0, r.z0);
  const [bx, bz] = map(r.x1, r.z1);
  return { x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) };
}

export function siteLayout(building: Box3, floorTop: number, front: Side): SiteLayout {
  const cx = (building.min[0] + building.max[0]) / 2;
  const cz = (building.min[2] + building.max[2]) / 2;
  const [fx] = SIDE_NORMAL[front];
  // Half sizes across (along the street) and deep (towards the street), in the local frame.
  const across = (fx !== 0 ? building.max[2] - building.min[2] : building.max[0] - building.min[0]) / 2;
  const deep = (fx !== 0 ? building.max[0] - building.min[0] : building.max[2] - building.min[2]) / 2;
  const size = Math.max(across, deep) * 2;
  const margin = Math.min(12, Math.max(3.5, size * 0.25));
  const forecourt = Math.min(18, Math.max(6.5, deep * 0.9 + 2));
  const plazaY = floorTop - 0.02;
  const streetY = plazaY - KERB_HEIGHT;
  const plazaLocal: Rect = { x0: -across - margin, z0: -deep - margin, x1: across + margin, z1: deep + forecourt };
  const k = KERB_WIDTH;
  const kerbsLocal: Rect[] = [
    { x0: plazaLocal.x0, z0: plazaLocal.z1 - k, x1: plazaLocal.x1, z1: plazaLocal.z1 },
    { x0: plazaLocal.x0, z0: plazaLocal.z0, x1: plazaLocal.x1, z1: plazaLocal.z0 + k },
    { x0: plazaLocal.x0, z0: plazaLocal.z0 + k, x1: plazaLocal.x0 + k, z1: plazaLocal.z1 - k },
    { x0: plazaLocal.x1 - k, z0: plazaLocal.z0 + k, x1: plazaLocal.x1, z1: plazaLocal.z1 - k },
  ];
  const streetLocal: Rect = { x0: -STREET_LENGTH / 2, z0: plazaLocal.z1, x1: STREET_LENGTH / 2, z1: plazaLocal.z1 + STREET_WIDTH };
  const mid = plazaLocal.z1 + STREET_WIDTH / 2;
  const markingsLocal: Rect[] = [];
  for (let x = -STREET_LENGTH / 2 + 2; x < STREET_LENGTH / 2 - 3; x += 9) {
    markingsLocal.push({ x0: x, z0: mid - 0.06, x1: x + 3, z1: mid + 0.06 });
  }
  return {
    plazaY,
    streetY,
    plaza: place(plazaLocal, front, cx, cz),
    kerbs: kerbsLocal.map((r) => place(r, front, cx, cz)),
    street: place(streetLocal, front, cx, cz),
    markings: markingsLocal.map((r) => place(r, front, cx, cz)),
  };
}
