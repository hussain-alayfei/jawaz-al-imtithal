import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { finishTextures, siteTextures } from "../ifcViewer/textures";

/*
 * SaudiStreet: a lively Riyadh street block built around one building's footprint. Context only:
 * nothing here comes from a file. Everything is made in code (no downloads), static, instanced
 * (about 35 draw calls at "high"), so it costs nothing per frame beyond drawing it.
 *
 *   <SaudiStreet footprint={{ minX, minZ, maxX, maxZ }} groundY={0} front="south" />
 *
 * Props (only `footprint` is required; this API is shared by other screens, keep it small and stable):
 *   footprint  { minX, minZ, maxX, maxZ }  plan box of the building the street wraps, in scene metres
 *              (x east, y up, z south). The plot under and around it is paved; nothing is drawn inside it
 *              above the paving.
 *   groundY    0          top of the plot paving and the sidewalks; the road lies one kerb (0.15 m) lower.
 *   front      "south"    the footprint side that faces the main street: forecourt, sidewalk, road.
 *   corner     "right"    the plot side (seen from the street) where a cross street opens the block, so
 *                         the building stands on a corner plot; "left", or "none" for neighbours on both sides.
 *   detail     "high"     "low": paving, roads, kerbs, markings and the neighbouring buildings;
 *                         "medium": + date palms, street lamps, parked cars and the city beyond;
 *                         "high": + distant skyline, median planting, cafe umbrellas, rooftop tanks and traffic.
 *   intensity  0.7        how much colour and contrast the context keeps (0 = pale grey, 1 = full colour), so
 *                         the building stays the subject. Changing it re-renders only, nothing is rebuilt.
 *   sky        true       a light warm-haze sky dome; pass false when the host draws its own sky.
 *   shadows    true       the near context casts and receives shadows (the far city and skyline never do).
 *   seed       7          varies heights, colours and the parked cars.
 *
 * Also exported: `streetBounds(props)`, the world plan box of the detailed street (for a shadow camera).
 *
 * The street section follows a common Riyadh commercial street (30 m right of way): 5 m sidewalks,
 * parking lanes, two lanes each way and a planted median with palms and double-arm lamps. Neighbours are
 * contemporary low-rise (2-4 storeys) in limestone and beige, with regular windows, shopfronts on the
 * ground floor and Najdi triangle crenellations on some parapets.
 */

export type StreetSide = "south" | "north" | "east" | "west";
export type StreetDetail = "low" | "medium" | "high";

export interface StreetFootprint {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface SaudiStreetProps {
  footprint: StreetFootprint;
  groundY?: number;
  front?: StreetSide;
  corner?: "left" | "right" | "none";
  detail?: StreetDetail;
  intensity?: number;
  sky?: boolean;
  shadows?: boolean;
  seed?: number;
}

/* ---------------- street section (metres) ---------------- */

const NORMAL: Record<StreetSide, [number, number]> = { south: [0, 1], north: [0, -1], east: [1, 0], west: [-1, 0] };
const KERB = 0.15;
const SIDEWALK = 5;
const PARK = 2.5;
const LANE = 3.3;
const MEDIAN = 2.4;
const ROAD = 2 * PARK + 4 * LANE + MEDIAN;
const CROSS_WALK = 4;
const CROSS_ROAD = 11;
const REAR_LANE = 7;
/** Service alley between the plot and its neighbour away from the corner. */
const ALLEY = 2.5;
const NEAR = 86;
const ROAD_LENGTH = 700;
const GROUND_FLOOR = 4.6;
const STOREY = 3.4;
const PARAPET = 1.2;

type Rect = { x0: number; z0: number; x1: number; z1: number };

interface Layout {
  plot: Rect;
  /** Near kerb line (front of the sidewalk). */
  zK: number;
  zMed0: number;
  zMed1: number;
  /** Far kerb line and the building line across the street. */
  zFar: number;
  zAcross: number;
  /** Rear lane: from zRear (block edge) back to zRearFar; the rear block's building line is zRearLine. */
  zRear: number;
  zRearFar: number;
  zRearLine: number;
  /** Building line of the neighbours on the restaurant's side. */
  zFront: number;
  /** Cross street: sidewalk-to-sidewalk road band along x, or undefined. */
  cross?: { a: number; b: number };
  /** The corner side's sign along local x (+1 right, -1 left). */
  s: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function layoutOf(across: number, deep: number, corner: "left" | "right" | "none"): Layout {
  const side = 3;
  const forecourt = clamp(deep * 0.9 + 2, 6.5, 12);
  const plot: Rect = { x0: -across - side, z0: -deep - side, x1: across + side, z1: deep + forecourt };
  const zK = plot.z1 + SIDEWALK;
  const zMed0 = zK + PARK + 2 * LANE;
  const zFar = zK + ROAD;
  const s = corner === "left" ? -1 : 1;
  let cross: Layout["cross"];
  if (corner !== "none") {
    const inner = s > 0 ? plot.x1 + CROSS_WALK : plot.x0 - CROSS_WALK;
    const outer = inner + s * CROSS_ROAD;
    cross = { a: Math.min(inner, outer), b: Math.max(inner, outer) };
  }
  return {
    plot,
    zK,
    zMed0,
    zMed1: zMed0 + MEDIAN,
    zFar,
    zAcross: zFar + SIDEWALK,
    zRear: plot.z0,
    zRearFar: plot.z0 - REAR_LANE,
    zRearLine: plot.z0 - REAR_LANE - 2,
    zFront: deep + 0.6,
    cross,
    s,
  };
}

interface Frame {
  cx: number;
  cz: number;
  across: number;
  deep: number;
  angle: number;
}

function frameOf(footprint: StreetFootprint, front: StreetSide): Frame {
  const [fx, fz] = NORMAL[front];
  const w = footprint.maxX - footprint.minX;
  const d = footprint.maxZ - footprint.minZ;
  return {
    cx: (footprint.minX + footprint.maxX) / 2,
    cz: (footprint.minZ + footprint.maxZ) / 2,
    across: (fx !== 0 ? d : w) / 2,
    deep: (fx !== 0 ? w : d) / 2,
    angle: Math.atan2(fx, fz),
  };
}

/** World plan box of the detailed street around `footprint` (the far city and skyline lie beyond it). */
export function streetBounds({ footprint, front = "south", corner = "right" }: Pick<SaudiStreetProps, "footprint" | "front" | "corner">): StreetFootprint {
  const f = frameOf(footprint, front);
  const l = layoutOf(f.across, f.deep, corner);
  const z0 = l.zRearLine - 16;
  const z1 = l.zAcross + 18;
  const c = Math.cos(f.angle);
  const s = Math.sin(f.angle);
  const xs: number[] = [];
  const zs: number[] = [];
  for (const x of [-NEAR, NEAR]) {
    for (const z of [z0, z1]) {
      xs.push(f.cx + x * c + z * s);
      zs.push(f.cz - x * s + z * c);
    }
  }
  return { minX: Math.min(...xs), minZ: Math.min(...zs), maxX: Math.max(...xs), maxZ: Math.max(...zs) };
}

/* ---------------- seeded noise and small textures ---------------- */

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function dataTexture(data: Uint8Array, size: number, color: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function normalFromHeight(height: Float32Array, size: number, strength: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const up = ((y + 1) % size) * size;
    const down = ((y - 1 + size) % size) * size;
    for (let x = 0; x < size; x++) {
      const dx = (height[y * size + ((x + 1) % size)] - height[y * size + ((x - 1 + size) % size)]) * strength;
      const dy = (height[up + x] - height[down + x]) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      out[i] = (-dx * inv * 0.5 + 0.5) * 255;
      out[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      out[i + 2] = (inv * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

interface Textures {
  slabs: THREE.DataTexture;
  slabsNormal: THREE.DataTexture;
  frond: THREE.CanvasTexture;
  bark: THREE.DataTexture;
  barkNormal: THREE.DataTexture;
  facade: THREE.CanvasTexture;
}

let textures: Textures | undefined;

/** Sidewalk stone: 60 x 60 cm honed slabs in stack bond, 2.4 m tile (UVs are in metres). */
function slabTextures(): Pick<Textures, "slabs" | "slabsNormal"> {
  const size = 512;
  const slab = size / 4;
  const random = rng(401);
  const tones = Array.from({ length: 16 }, () => (random() - 0.5) * 16);
  const rgba = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const fx = x % slab;
      const fy = y % slab;
      const edge = Math.min(fx, slab - fx, fy, slab - fy);
      if (edge < 1.2) {
        rgba.set([150, 145, 136, 255], i * 4);
        height[i] = 0;
        continue;
      }
      const tone = tones[Math.floor(y / slab) * 4 + Math.floor(x / slab)] + (random() - 0.5) * 12 + (random() > 0.992 ? -18 : 0);
      rgba.set([203 + tone, 196 + tone, 184 + tone * 0.9], i * 4);
      rgba[i * 4 + 3] = 255;
      height[i] = 0.4 + 0.6 * Math.min(1, (edge - 1.2) / 2.5);
    }
  }
  const slabs = dataTexture(rgba, size, true);
  slabs.repeat.set(1 / 2.4, 1 / 2.4);
  const slabsNormal = dataTexture(normalFromHeight(height, size, 2), size, false);
  slabsNormal.repeat.copy(slabs.repeat);
  return { slabs, slabsNormal };
}

/**
 * One date-palm frond seen flat: the rachis up the middle (base at v 0, tip at v 1) and stiff grey-green
 * leaflets angled towards the tip with gaps between them; alpha cuts the leaflets out (and their shadows).
 */
function frondTexture(): THREE.CanvasTexture {
  const w = 96;
  const h = 384;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  const random = rng(311);
  g.lineCap = "round";
  for (let y = h - 8; y > 5; y -= 4.4) {
    const t = 1 - y / h;
    // Short spines near the base, long leaflets in the middle, shorter again to the tip.
    const shape = Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + t * 0.97)), 0.55);
    const reach = (w / 2 - 3) * shape * (t < 0.16 ? 0.2 + (t / 0.16) * 0.8 : 1);
    for (const side of [-1, 1]) {
      const len = reach * (0.78 + random() * 0.22);
      const rise = len * (0.62 + random() * 0.16);
      const tone = 104 + random() * 42;
      g.strokeStyle = `rgb(${Math.round(tone - 10)}, ${Math.round(tone + 8)}, ${Math.round(tone - 16)})`;
      g.lineWidth = 1.9;
      g.beginPath();
      g.moveTo(w / 2 + side * 1.5, y + (side > 0 ? 1.2 : 0));
      g.quadraticCurveTo(w / 2 + side * len * 0.45, y - rise * 0.42, w / 2 + side * len, y - rise);
      g.stroke();
    }
  }
  // The rachis, thick at the base and thin at the tip.
  g.fillStyle = "rgb(164, 156, 112)";
  g.beginPath();
  g.moveTo(w / 2 - 3, h);
  g.lineTo(w / 2 + 3, h);
  g.lineTo(w / 2 + 0.8, 0);
  g.lineTo(w / 2 - 0.8, 0);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Date-palm bark: the diamond pattern of old frond bases in staggered rows, as a colour map and a normal
 * map; one tile is a quarter of the trunk's girth by two rows (repeat 4 around, about 26 along).
 */
function barkTextures(): { map: THREE.DataTexture; normal: THREE.DataTexture } {
  const size = 128;
  const random = rng(331);
  const height = new Float32Array(size * size);
  const rgba = new Uint8Array(size * size * 4);
  const centres: [number, number][] = [
    [0.25, 0.25], [0.75, 0.25], [-0.25, 0.25], [1.25, 0.25],
    [0, 0.75], [0.5, 0.75], [1, 0.75], [0, -0.25], [0.5, -0.25], [1, -0.25], [0.25, 1.25], [0.75, 1.25],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let best = 9;
      let dyBest = 0;
      for (const [cx, cy] of centres) {
        const d = Math.abs(u - cx) / 0.27 + Math.abs(v - cy) / 0.3;
        if (d < best) {
          best = d;
          dyBest = v - cy;
        }
      }
      const stub = Math.max(0, 1 - best);
      const i = y * size + x;
      const grain = (random() - 0.5) * 0.12;
      height[i] = Math.pow(stub, 0.55) + grain * 0.4;
      // The upper lip of each stub catches light; the grooves between them are dark.
      const lip = dyBest > 0 ? 0.12 * stub : 0;
      const k = 0.48 + 0.5 * Math.pow(stub, 0.4) + lip + grain;
      rgba[i * 4] = clamp(Math.round(150 * k + 18), 0, 255);
      rgba[i * 4 + 1] = clamp(Math.round(132 * k + 14), 0, 255);
      rgba[i * 4 + 2] = clamp(Math.round(104 * k + 10), 0, 255);
      rgba[i * 4 + 3] = 255;
    }
  }
  const map = dataTexture(rgba, size, true);
  const normal = dataTexture(normalFromHeight(height, size, 3.2), size, false);
  map.repeat.set(4, 26);
  normal.repeat.set(4, 26);
  return { map, normal };
}

/** Background buildings: one 3.2 m bay by one 3.5 m storey of plain wall with a window (box-projected). */
function facadeTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#ededeb";
  g.fillRect(0, 0, size, size);
  // Floor line at the bottom of the storey.
  g.fillStyle = "#d6d4d0";
  g.fillRect(0, size - 6, size, 6);
  // Window: dark glass with a lighter reflected sky at its head, and a pale stone surround.
  const x0 = size * 0.28;
  const x1 = size * 0.72;
  const top = size * 0.2;
  const bottom = size * 0.66;
  g.fillStyle = "#cfcbc4";
  g.fillRect(x0 - 5, top - 5, x1 - x0 + 10, bottom - top + 10);
  const glass = g.createLinearGradient(0, top, 0, bottom);
  glass.addColorStop(0, "#6f7c86");
  glass.addColorStop(0.45, "#3b434a");
  glass.addColorStop(1, "#30363b");
  g.fillStyle = glass;
  g.fillRect(x0, top, x1 - x0, bottom - top);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function streetTextures(): Textures {
  if (!textures) {
    const bark = barkTextures();
    textures = { ...slabTextures(), frond: frondTexture(), bark: bark.map, barkNormal: bark.normal, facade: facadeTexture() };
  }
  return textures;
}

/* ---------------- context materials ---------------- */

interface Tone {
  desat: { value: number };
  flat: { value: number };
  ground: { value: number };
}

/** How a material maps its texture: by its own UVs, or in world metres (instanced boxes of any size). */
type Projection = "uv" | "ground" | "stone" | "facade";

/**
 * Context materials share one shader patch: desaturate and flatten the lit colour (the `intensity`
 * prop), and, for instanced boxes of any size, sample the texture in world metres (box projection).
 */
function contextual<T extends THREE.MeshStandardMaterial>(material: T, tone: Tone, projection: Projection = "uv"): T {
  const world = projection !== "uv";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.ctxDesat = tone.desat;
    shader.uniforms.ctxFlat = tone.flat;
    shader.uniforms.ctxGround = tone.ground;
    if (world) {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCtxWorld;\nvarying vec3 vCtxNormal;")
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
  vec4 ctxWorld = vec4(transformed, 1.0);
  vec3 ctxNormal = objectNormal;
  #ifdef USE_INSTANCING
    ctxWorld = instanceMatrix * ctxWorld;
    ctxNormal = mat3(instanceMatrix) * ctxNormal;
  #endif
  vCtxWorld = (modelMatrix * ctxWorld).xyz;
  vCtxNormal = normalize(mat3(modelMatrix) * ctxNormal);`,
        );
    }
    let fragment = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
uniform float ctxDesat;
uniform float ctxFlat;
uniform float ctxGround;
${world ? "varying vec3 vCtxWorld;\nvarying vec3 vCtxNormal;" : ""}
float ctxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ctxNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ctxHash(i), ctxHash(i + vec2(1.0, 0.0)), u.x), mix(ctxHash(i + vec2(0.0, 1.0)), ctxHash(i + vec2(1.0)), u.x), u.y);
}`,
    );
    if (projection === "ground") {
      // Large paved and asphalt areas: a slow world-space mottling so their tile does not repeat visibly.
      fragment = fragment.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
  diffuseColor.rgb *= 0.88 + 0.22 * (ctxNoise(vCtxWorld.xz / 11.0) * 0.6 + ctxNoise(vCtxWorld.xz / 2.7) * 0.25 + ctxNoise(vCtxWorld.xz / 0.7) * 0.15);`,
      );
    } else if (projection === "stone") {
      fragment = fragment.replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
  vec3 ctxAn = abs(vCtxNormal);
  vec2 ctxUv = ctxAn.y > 0.5 ? vCtxWorld.xz : (ctxAn.x > 0.5 ? vCtxWorld.zy : vCtxWorld.xy);
  diffuseColor *= texture2D(map, ctxUv / 1.2);
  diffuseColor.rgb *= 0.94 + 0.1 * ctxNoise(vec2(ctxUv.x / 5.0, ctxUv.y / 3.0));
#endif`,
      );
    } else if (projection === "facade") {
      fragment = fragment.replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
  vec3 ctxAn = abs(vCtxNormal);
  if (ctxAn.y > 0.5) {
    diffuseColor.rgb *= 0.84 + 0.08 * ctxNoise(vCtxWorld.xz / 3.0);
  } else {
    float ctxAlong = ctxAn.x > 0.5 ? vCtxWorld.z : vCtxWorld.x;
    diffuseColor *= texture2D(map, vec2(ctxAlong / 3.2, (vCtxWorld.y - ctxGround) / 3.5));
  }
#endif`,
      );
    }
    shader.fragmentShader = fragment.replace(
      "#include <opaque_fragment>",
      `#include <opaque_fragment>
  float ctxL = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(ctxL), ctxDesat);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.5, 0.48, 0.45), ctxFlat);`,
    );
  };
  material.customProgramCacheKey = () => `saudi-street-${projection}`;
  return material;
}

/* ---------------- geometry helpers ---------------- */

const box = (sx: number, sy: number, sz: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);

/** A box over a plan rectangle from y0 to y1, with UVs in metres (box projection). */
function slab(r: Rect, y0: number, y1: number, swap = false): THREE.BufferGeometry {
  const g = box(r.x1 - r.x0, y1 - y0, r.z1 - r.z0, (r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2);
  const p = g.getAttribute("position");
  const n = g.getAttribute("normal");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    if (ay > 0.5) {
      if (swap) uv.setXY(i, p.getZ(i), p.getX(i));
      else uv.setXY(i, p.getX(i), p.getZ(i));
    } else if (ax > 0.5) uv.setXY(i, p.getZ(i), p.getY(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  return g;
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts) ?? new THREE.BufferGeometry();
  for (const p of parts) p.dispose();
  return g;
}

/** Window surround: head, sill and jambs around a `w` x `h` opening, `d` proud of the wall (back at z 0). */
function surroundGeometry(w: number, h: number, t: number, d: number): THREE.BufferGeometry {
  return merged([
    box(w + 2 * t, t, d, 0, h / 2 + t / 2, d / 2),
    box(w + 2 * t + 0.14, t * 0.75, d + 0.06, 0, -h / 2 - t * 0.375, (d + 0.06) / 2),
    box(t, h, d, -w / 2 - t / 2, 0, d / 2),
    box(t, h, d, w / 2 + t / 2, 0, d / 2),
  ]);
}

/** Unit triangular prism: base 1 wide on y 0, apex at y 1, 1 deep centred on z 0. */
function prismGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
  return new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
}

/** Street lamp, 9 m pole with one arm (or two) towards +x; base at the origin. */
function lampGeometry(double: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(0.2, 0.23, 0.55, 10).translate(0, 0.275, 0),
    new THREE.CylinderGeometry(0.065, 0.11, 9, 10).translate(0, 4.5, 0),
  ];
  for (const s of double ? [1, -1] : [1]) {
    parts.push(box(1.7, 0.07, 0.07, s * 0.85, 8.86, 0));
    parts.push(box(0.78, 0.11, 0.3, s * 1.55, 8.79, 0));
  }
  return merged(parts);
}

/** Date-palm trunk, 1 m tall (scaled per palm): a slight taper, a swollen foot, bark from the texture. */
function trunkGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.19, 0.25, 1, 14, 12, true).translate(0, 0.5, 0);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const foot = 1 + 0.35 * Math.max(0, 1 - y / 0.08);
    const neck = 1 + 0.12 * Math.max(0, (y - 0.93) / 0.07);
    p.setX(i, p.getX(i) * foot * neck);
    p.setZ(i, p.getZ(i) * foot * neck);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Date-palm crown: two dozen arching fronds on golden-angle azimuths, young ones upright, old ones
 * drooping and the lowest few dry; each frond is a ribbon folded in a V along its rachis, its leaflets
 * cut out by alpha.
 */
function crownGeometry(random: () => number): THREE.BufferGeometry {
  const fronds = 26;
  const segments = 8;
  const width = 1.15;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let k = 0; k < fronds; k++) {
    const az = k * 2.39996 + random() * 0.25;
    const f = k / (fronds - 1);
    const dry = f > 0.86;
    const elevation = ((74 - f * 96) * Math.PI) / 180 + (random() - 0.5) * 0.12;
    const length = 2.5 + f * 1.1 + random() * 0.35;
    const droop = 0.07 + f * 0.07 + (dry ? 0.08 : 0);
    const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const lateral = new THREE.Vector3(-dir.z, 0, dir.x);
    const fold = 0.62;
    const tint = dry ? [1.32, 1.02, 0.66] : [0.96 + random() * 0.08, 1, 0.94 + random() * 0.08];
    const base = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const s = length * t;
      const along = 0.12 + s * Math.cos(elevation);
      const up = s * Math.sin(elevation) - droop * s * s;
      const centre = new THREE.Vector3(dir.x * along, up + 0.15, dir.z * along);
      const half = (width / 2) * (t < 0.1 ? 0.35 + t * 6.5 : 1);
      for (const side of [-1, 0, 1]) {
        const v = centre
          .clone()
          .addScaledVector(lateral, side * half * Math.cos(fold))
          .add(new THREE.Vector3(0, Math.abs(side) * half * Math.sin(fold), 0));
        positions.push(v.x, v.y, v.z);
        uvs.push((side + 1) / 2, t);
        colors.push(tint[0], tint[1], tint[2]);
      }
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 3;
      const b = a + 3;
      indices.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  // Light the crown as one soft mass (normals up and out from its heart), so the undersides of the
  // fronds do not go black and the crown keeps a rounded light-and-shade.
  const n = g.getAttribute("normal");
  const p = g.getAttribute("position");
  const m = new THREE.Vector3();
  const out = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    out.set(p.getX(i), p.getY(i) + 0.9, p.getZ(i)).normalize();
    m.set(n.getX(i), n.getY(i), n.getZ(i));
    if (m.y < 0) m.negate();
    m.lerp(out, 0.65).normalize();
    n.setXYZ(i, m.x, m.y, m.z);
  }
  return g;
}

/** Car body and greenhouse from a side profile (x along the car, front at -x, y up), extruded across. */
function carGeometries(kind: "sedan" | "suv"): { body: THREE.BufferGeometry; cabin: THREE.BufferGeometry } {
  const suv = kind === "suv";
  const { wheel, axle, width } = CAR[kind];
  const yw = wheel;
  const body = new THREE.Shape();
  const bottom = suv ? 0.42 : 0.3;
  const len = suv ? 2.42 : 2.36;
  body.moveTo(-len, bottom + 0.06);
  body.lineTo(-axle - wheel - 0.06, bottom);
  body.absarc(-axle, yw, wheel + 0.07, Math.PI, 0, true);
  body.lineTo(axle - wheel - 0.07, bottom);
  body.absarc(axle, yw, wheel + 0.07, Math.PI, 0, true);
  body.lineTo(len - 0.05, bottom + 0.04);
  if (suv) {
    body.lineTo(len, 0.95);
    body.lineTo(len - 0.06, 1.12);
    body.lineTo(-1.15, 1.12);
    body.lineTo(-len + 0.15, 1.02);
    body.lineTo(-len, 0.72);
  } else {
    body.lineTo(len, 0.64);
    body.lineTo(len - 0.12, 0.92);
    body.lineTo(1.5, 0.97);
    body.lineTo(-0.95, 0.97);
    body.lineTo(-len + 0.22, 0.84);
    body.lineTo(-len, 0.62);
  }
  body.closePath();
  const cabin = new THREE.Shape(
    suv
      ? [new THREE.Vector2(-1.2, 1.08), new THREE.Vector2(-0.6, 1.76), new THREE.Vector2(2.08, 1.78), new THREE.Vector2(2.34, 1.08)]
      : [new THREE.Vector2(-1.0, 0.95), new THREE.Vector2(-0.28, 1.42), new THREE.Vector2(0.82, 1.43), new THREE.Vector2(1.58, 0.95)],
  );
  const bodyGeometry = new THREE.ExtrudeGeometry(body, {
    depth: width,
    bevelEnabled: true,
    bevelSize: 0.05,
    bevelThickness: 0.07,
    bevelSegments: 2,
    curveSegments: 6,
  }).translate(0, 0, -width / 2);
  const cabinWidth = width - 0.22;
  const cabinGeometry = new THREE.ExtrudeGeometry(cabin, {
    depth: cabinWidth,
    bevelEnabled: true,
    bevelSize: 0.05,
    bevelThickness: 0.06,
    bevelSegments: 2,
  }).translate(0, 0, -cabinWidth / 2);
  return { body: bodyGeometry, cabin: cabinGeometry };
}

/* ---------------- instance batches ---------------- */

class Batch {
  private readonly matrices: THREE.Matrix4[] = [];
  private readonly colors: THREE.Color[] = [];

  add(position: [number, number, number], scale: [number, number, number] = [1, 1, 1], rotY = 0, color?: THREE.ColorRepresentation, tiltX = 0) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, rotY, 0, "YXZ"));
    this.matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(...position), q, new THREE.Vector3(...scale)));
    if (color !== undefined) this.colors.push(new THREE.Color(color));
  }

  get size() {
    return this.matrices.length;
  }

  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, cast: boolean, receive: boolean): THREE.InstancedMesh | undefined {
    if (!this.matrices.length) return undefined;
    const mesh = new THREE.InstancedMesh(geometry, material, this.matrices.length);
    this.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    if (this.colors.length === this.matrices.length) this.colors.forEach((c, i) => mesh.setColorAt(i, c));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

/* ---------------- buildings ---------------- */

type Style = "mixed" | "shops" | "residential" | "office";
type FaceId = "front" | "back" | "left" | "right";

interface Building {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  floors: number;
  style: Style;
  /** Faces that look onto a street (windows, shopfronts). */
  faces: FaceId[];
  stone: string;
  najdi?: boolean;
  awnings?: boolean;
  fascia?: string;
  signs?: string[];
}

interface Face {
  cx: number;
  cz: number;
  nx: number;
  nz: number;
  length: number;
  rot: number;
}

function faceOf(b: Building, id: FaceId): Face {
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  const f: Record<FaceId, [number, number, number, number, number]> = {
    front: [cx, b.z1, 0, 1, w],
    back: [cx, b.z0, 0, -1, w],
    right: [b.x1, cz, 1, 0, d],
    left: [b.x0, cz, -1, 0, d],
  };
  const [x, z, nx, nz, length] = f[id];
  return { cx: x, cz: z, nx, nz, length, rot: Math.atan2(nx, nz) };
}

const heightOf = (b: Building) => GROUND_FLOOR + (b.floors - 1) * STOREY + PARAPET;

interface Batches {
  stone: Batch;
  plain: Batch;
  glass: Batch;
  metal: Batch;
  prism: Batch;
  window: Batch;
  slot: Batch;
  cylinder: Batch;
  far: Batch;
  trunk: Batch;
  crown: Batch;
  lamp: Batch;
  lamp2: Batch;
  sedan: Batch;
  sedanCabin: Batch;
  suv: Batch;
  suvCabin: Batch;
  wheel: Batch;
  cone: Batch;
  shrub: Batch;
}

/** Puts a unit-box element on a facade: `u` along it, `v` up from the ground, `w` out from the wall. */
function onFace(batch: Batch, face: Face, gy: number, u: number, v: number, w: number, size: [number, number, number], color?: string, tilt = 0) {
  const tx = Math.cos(face.rot);
  const tz = -Math.sin(face.rot);
  batch.add([face.cx + tx * u + face.nx * w, gy + v, face.cz + tz * u + face.nz * w], size, face.rot, color, tilt);
}

function building(b: Building, gy: number, out: Batches, random: () => number, rich: boolean) {
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  const h = heightOf(b);
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const coping = shade(b.stone, 1.06);
  out.stone.add([cx, gy + h / 2 - 0.1, cz], [w, h + 0.2, d], 0, b.stone);
  // Coping and floor bands all round.
  out.plain.add([cx, gy + h + 0.06, cz], [w + 0.2, 0.14, d + 0.2], 0, coping);
  if (b.style !== "office") {
    for (let f = 1; f < b.floors; f++) {
      out.plain.add([cx, gy + GROUND_FLOOR + (f - 1) * STOREY - 0.05, cz], [w + 0.14, 0.24, d + 0.14], 0, coping);
    }
  }
  const signs = b.signs ?? ["#2f5a4a", "#7a5a3a", "#3d4a5a"];
  for (const id of b.faces) {
    const face = faceOf(b, id);
    const len = face.length;
    // Ground floor: glazed shop bays between stone piers, a fascia and sign panels.
    if (b.style === "shops" || b.style === "mixed") {
      const bays = Math.max(1, Math.round(len / 4.2));
      const bay = len / bays;
      const pane = GROUND_FLOOR - 1.35;
      for (let i = 0; i <= bays; i++) out.stone.add(...pierAt(face, gy, -len / 2 + i * bay, b.stone));
      for (let i = 0; i < bays; i++) {
        const u = -len / 2 + (i + 0.5) * bay;
        onFace(out.glass, face, gy, u, 0.05 + pane / 2, 0.05, [bay - 0.55, pane, 0.06]);
        onFace(out.metal, face, gy, u, 0.05 + pane / 2, 0.1, [0.07, pane, 0.06]);
        onFace(out.metal, face, gy, u, 2.75, 0.1, [bay - 0.55, 0.07, 0.06]);
        if (b.awnings && rich) onFace(out.plain, face, gy, u, GROUND_FLOOR - 1.55, 0.75, [bay - 0.7, 0.05, 1.45], i % 2 ? "#b8a58a" : "#8a7a64", 0.32);
      }
      onFace(out.plain, face, gy, 0, GROUND_FLOOR - 0.7, 0.2, [len + 0.1, 0.95, 0.4], b.fascia ?? shade(b.stone, 0.92));
      const shops = Math.max(1, Math.round(bays / 2));
      for (let i = 0; i < shops; i++) {
        const span = len / shops;
        onFace(out.plain, face, gy, -len / 2 + (i + 0.5) * span, GROUND_FLOOR - 0.7, 0.43, [Math.min(span - 1.4, 6), 0.55, 0.06], signs[i % signs.length]);
      }
    } else if (b.style === "residential") {
      // Entrance: a dark glass door in a stone frame, centred.
      onFace(out.glass, face, gy, 0, 1.3, 0.04, [1.8, 2.6, 0.06]);
      onFace(out.plain, face, gy, 0, 2.75, 0.25, [2.6, 0.18, 0.5], coping);
    }
    const upperFloors = b.floors - 1;
    if (b.style === "office") {
      // Glass bands behind vertical stone fins, from the ground-floor head to the parapet.
      for (let f = 0; f < b.floors; f++) {
        const base = f === 0 ? 0.1 : GROUND_FLOOR + (f - 1) * STOREY + 0.55;
        const tall = f === 0 ? GROUND_FLOOR - 0.6 : STOREY - 1.0;
        onFace(out.glass, face, gy, 0, base + tall / 2, 0.04, [len - 0.6, tall, 0.06]);
      }
      const fins = Math.max(2, Math.round(len / 1.6));
      for (let i = 0; i <= fins; i++) {
        onFace(out.plain, face, gy, -len / 2 + 0.2 + (i * (len - 0.4)) / fins, h / 2, 0.24, [0.22, h - 0.2, 0.48], coping);
      }
      continue;
    }
    // Upper floors: a regular rhythm of windows in stone surrounds (slot windows on the Najdi ones).
    const slot = !!b.najdi;
    const bayW = slot ? 2.2 : 3.2;
    const n = Math.max(1, Math.floor(len / bayW));
    const step = len / n;
    for (let f = 0; f < upperFloors; f++) {
      const sill = GROUND_FLOOR + f * STOREY + (slot ? 0.55 : 0.85);
      const winH = slot ? 2.1 : 1.6;
      const winW = slot ? 0.8 : 1.3;
      for (let i = 0; i < n; i++) {
        const u = -len / 2 + (i + 0.5) * step;
        onFace(slot ? out.slot : out.window, face, gy, u, sill + winH / 2, 0, [1, 1, 1], coping);
        onFace(out.glass, face, gy, u, sill + winH / 2, 0.03, [winW + 0.02, winH + 0.02, 0.04]);
        if (slot) onFace(out.prism, face, gy, u, sill + winH + 0.28, 0.02, [0.62, 0.42, 0.06], shade(b.stone, 0.62));
      }
    }
    if (b.najdi) {
      // A band of small triangular vents under the coping (Najdi parapet).
      const vents = Math.floor(len / 0.75);
      for (let i = 0; i < vents; i++) {
        onFace(out.prism, face, gy, -len / 2 + (i + 0.5) * (len / vents), h - 0.75, 0.02, [0.34, 0.32, 0.05], shade(b.stone, 0.55));
      }
    }
  }
  if (b.najdi) {
    // Triangle crenellations all round the parapet.
    for (const id of ["front", "back", "left", "right"] as FaceId[]) {
      const face = faceOf(b, id);
      const count = Math.floor(face.length / 0.95);
      for (let i = 0; i < count; i++) {
        onFace(out.prism, face, gy, -face.length / 2 + (i + 0.5) * (face.length / count), h + 0.13, -0.08, [0.62, 0.55, 0.2], coping);
      }
    }
  }
  if (rich) {
    // Rooftop life: water tanks and air-conditioning condensers.
    const tanks = 1 + Math.floor(random() * 3);
    for (let i = 0; i < tanks; i++) {
      const x = b.x0 + 1.5 + random() * (w - 3);
      const z = b.z0 + 1.5 + random() * Math.min(5, d - 3);
      out.cylinder.add([x, gy + h + 0.6, z], [0.75, 1.2, 0.75], 0, random() > 0.7 ? "#b9c6cf" : "#e4e0d6");
    }
    const units = 2 + Math.floor(random() * 4);
    for (let i = 0; i < units; i++) {
      out.plain.add([b.x0 + 1.2 + random() * (w - 2.4), gy + h + 0.37, b.z0 + 1 + random() * (d - 2)], [0.95, 0.75, 0.4], random() * Math.PI, "#c9c9c4");
    }
  }
}

function pierAt(face: Face, gy: number, u: number, color: string): [[number, number, number], [number, number, number], number, string] {
  const tx = Math.cos(face.rot);
  const tz = -Math.sin(face.rot);
  const w = 0.16;
  return [[face.cx + tx * u + face.nx * w, gy + GROUND_FLOOR / 2, face.cz + tz * u + face.nz * w], [0.55, GROUND_FLOOR, 0.32], face.rot, color];
}

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

/** Plain background buildings along a frontage (box-projected windows), from `a` to `b` along x. */
function fillRow(out: Batches, random: () => number, a: number, b: number, zLine: number, depth: number, facing: 1 | -1, gy: number, skip?: { a: number; b: number }) {
  let x = a;
  const dir = b > a ? 1 : -1;
  while ((b - x) * dir > 6) {
    const w = 11 + random() * 12;
    const x0 = x;
    const x1 = x + dir * Math.min(w, Math.abs(b - x));
    x = x1 + dir * (random() > 0.6 ? 2 + random() * 3 : 0.4);
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    if (skip && hi > skip.a - 1 && lo < skip.b + 1) continue;
    const floors = random() > 0.75 ? 4 : random() > 0.4 ? 3 : 2;
    const h = floors * 3.5 + 1;
    const z0 = facing > 0 ? zLine - depth : zLine;
    out.far.add([(lo + hi) / 2, gy - 0.2 + h / 2, z0 + depth / 2], [hi - lo, h + 0.2, depth], 0, STONES[Math.floor(random() * STONES.length)]);
    out.plain.add([(lo + hi) / 2, gy + h + 0.06, z0 + depth / 2], [hi - lo + 0.16, 0.14, depth + 0.16], 0, "#ddd6c8");
  }
}

const STONES = ["#e9dfcd", "#e4d8c2", "#efe8dc", "#dccdb4", "#e8e2d6", "#d9cbb3", "#f0ebe2"];
/** Car paints: mostly white and silver, as on Riyadh streets, with some pearl, beige, grey and black. */
const PAINTS = ["#f1f0ec", "#f1f0ec", "#eceae4", "#f3f2ee", "#c4c7ca", "#a9adb1", "#e3dccd", "#d5c6a8", "#6b7077", "#2a2c2f", "#f1f0ec", "#3e4752"];

/* ---------------- the street ---------------- */

interface Options {
  footprint: StreetFootprint;
  groundY: number;
  front: StreetSide;
  corner: "left" | "right" | "none";
  detail: StreetDetail;
  sky: boolean;
  shadows: boolean;
  seed: number;
}

interface Built {
  group: THREE.Group;
  dispose: () => void;
}

function buildStreet(o: Options, tone: Tone): Built {
  const tex = streetTextures();
  const random = rng(o.seed * 7919 + 13);
  const frame = frameOf(o.footprint, o.front);
  const L = layoutOf(frame.across, frame.deep, o.corner);
  const gy = o.groundY;
  const road = gy - KERB;
  const medium = o.detail !== "low";
  const high = o.detail === "high";
  const cast = o.shadows;
  const recv = o.shadows;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const own = <T extends THREE.BufferGeometry>(g: T) => (geometries.push(g), g);
  const mat = <T extends THREE.Material>(m: T) => (materials.push(m), m);

  const group = new THREE.Group();
  group.name = "saudi-street";
  group.position.set(frame.cx, 0, frame.cz);
  group.rotation.y = frame.angle;
  const add = (mesh: THREE.Object3D | undefined, name?: string) => {
    if (!mesh) return;
    if (name) mesh.name = name;
    group.add(mesh);
  };

  /* ---- materials ---- */
  const pavers = siteTextures("pavers");
  const asphaltSet = siteTextures("asphalt");
  const kerbSet = siteTextures("kerb");
  const stoneSet = finishTextures("stone");
  const m = {
    pavers: mat(contextual(new THREE.MeshStandardMaterial({ map: pavers.map, normalMap: pavers.normalMap ?? null, roughnessMap: pavers.roughnessMap ?? null, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 1, color: "#ece4d6" }), tone, "ground")),
    slabs: mat(contextual(new THREE.MeshStandardMaterial({ map: tex.slabs, normalMap: tex.slabsNormal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.9 }), tone, "ground")),
    asphalt: mat(contextual(new THREE.MeshStandardMaterial({ map: asphaltSet.map, normalMap: asphaltSet.normalMap ?? null, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.93, color: "#8a8784" }), tone, "ground")),
    kerb: mat(contextual(new THREE.MeshStandardMaterial({ map: kerbSet.map, normalMap: kerbSet.normalMap ?? null, roughness: 0.85, color: "#dedbd4" }), tone)),
    paint: mat(contextual(new THREE.MeshStandardMaterial({ color: "#eeece6", roughness: 0.7 }), tone)),
    median: mat(contextual(new THREE.MeshStandardMaterial({ color: "#8a7f66", roughness: 1 }), tone, "ground")),
    ground: mat(contextual(new THREE.MeshStandardMaterial({ color: "#c2baac", roughness: 1 }), tone, "ground")),
    stone: mat(contextual(new THREE.MeshStandardMaterial({ map: stoneSet?.map ?? null, roughness: 0.92 }), tone, "stone")),
    plain: mat(contextual(new THREE.MeshStandardMaterial({ roughness: 0.85 }), tone)),
    glass: mat(contextual(new THREE.MeshStandardMaterial({ color: "#2b3238", roughness: 0.08, metalness: 0.1, envMapIntensity: 1.3 }), tone)),
    metal: mat(contextual(new THREE.MeshStandardMaterial({ color: "#45464a", roughness: 0.45, metalness: 0.6 }), tone)),
    far: mat(contextual(new THREE.MeshStandardMaterial({ map: tex.facade, roughness: 0.95 }), tone, "facade")),
    trunk: mat(contextual(new THREE.MeshStandardMaterial({ map: tex.bark, normalMap: tex.barkNormal, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 1 }), tone)),
    frond: mat(contextual(new THREE.MeshStandardMaterial({ map: tex.frond, vertexColors: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8, color: "#eef2e2" }), tone)),
    lamp: mat(contextual(new THREE.MeshStandardMaterial({ color: "#3b3e42", roughness: 0.5, metalness: 0.55 }), tone)),
    paintwork: mat(contextual(new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.3, envMapIntensity: 1.1 }), tone)),
    carGlass: mat(contextual(new THREE.MeshStandardMaterial({ color: "#1a1f24", roughness: 0.06, metalness: 0.2, envMapIntensity: 1.4 }), tone)),
    tyre: mat(contextual(new THREE.MeshStandardMaterial({ color: "#1e1f21", roughness: 0.85 }), tone)),
    shrub: mat(contextual(new THREE.MeshStandardMaterial({ color: "#5f6b45", roughness: 1 }), tone)),
  };

  /* ---- ground: plot, sidewalks, roads, kerbs, median, markings ---- */
  const { plot, zK, zMed0, zMed1, zFar, zAcross, zRear, zRearFar, zRearLine, zFront, cross, s } = L;
  const far = ROAD_LENGTH / 2;
  const sidewalks: THREE.BufferGeometry[] = [];
  const asphalt: THREE.BufferGeometry[] = [];
  const kerbs: THREE.BufferGeometry[] = [];
  const marks: THREE.BufferGeometry[] = [];
  const pave = (r: Rect) => sidewalks.push(slab(r, gy - 0.3, gy - 0.004));
  const tar = (r: Rect) => asphalt.push(slab(r, road - 0.3, road));
  const kerbX = (x0: number, x1: number, z: number, out: 1 | -1) => kerbs.push(slab({ x0, z0: out > 0 ? z - 0.3 : z, x1, z1: out > 0 ? z : z + 0.3 }, road - 0.2, gy + 0.008));
  const kerbZ = (z0: number, z1: number, x: number, out: 1 | -1) => kerbs.push(slab({ x0: out > 0 ? x - 0.3 : x, z0, x1: out > 0 ? x : x + 0.3, z1 }, road - 0.2, gy + 0.008, true));
  /** x-ranges of a full-length band, minus the cross street. */
  const spans = (gap = 0): [number, number][] =>
    cross ? [[-far, cross.a - gap], [cross.b + gap, far]] : [[-far, far]];

  // The plot: the forecourt and the paving round the building.
  const plotGeometry = own(slab(plot, gy - 0.32, gy));
  add(withShadow(new THREE.Mesh(plotGeometry, m.pavers), false, recv), "plot");
  // The block the plot sits in: sidewalk in front, paving to the sides and the building line.
  const blockA = cross ? (s > 0 ? -far : cross.b) : -far;
  const blockB = cross ? (s > 0 ? cross.a : far) : far;
  pave({ x0: blockA, z0: plot.z1, x1: blockB, z1: zK });
  if (cross && s > 0) {
    pave({ x0: -far, z0: zRear, x1: plot.x0, z1: plot.z1 });
    pave({ x0: plot.x1, z0: zRear, x1: cross.a, z1: plot.z1 });
  } else if (cross) {
    pave({ x0: plot.x1, z0: zRear, x1: far, z1: plot.z1 });
    pave({ x0: cross.b, z0: zRear, x1: plot.x0, z1: plot.z1 });
  } else {
    pave({ x0: -far, z0: zRear, x1: plot.x0, z1: plot.z1 });
    pave({ x0: plot.x1, z0: zRear, x1: far, z1: plot.z1 });
  }
  // The corner block beyond the cross street, the far sidewalk, the rear sidewalk.
  if (cross) {
    const [a, b] = s > 0 ? [cross.b, far] : [-far, cross.a];
    pave({ x0: a, z0: zRear, x1: b, z1: zK });
    kerbX(a, b, zK, 1);
    kerbX(a, b, zRear, -1);
    kerbZ(zRear, zK, s > 0 ? cross.b : cross.a, s > 0 ? -1 : 1);
    kerbZ(zRear, zK, s > 0 ? cross.a : cross.b, s > 0 ? 1 : -1);
    kerbX(blockA, blockB, zK, 1);
    kerbX(blockA, blockB, zRear, -1);
  } else {
    kerbX(-far, far, zK, 1);
    kerbX(-far, far, zRear, -1);
  }
  if (cross) {
    kerbZ(zFar, zAcross + 30, cross.a, 1);
    kerbZ(zFar, zAcross + 30, cross.b, -1);
    kerbZ(zRearLine - 40, zRearFar, cross.a, 1);
    kerbZ(zRearLine - 40, zRearFar, cross.b, -1);
  }
  for (const [a, b] of spans()) {
    pave({ x0: a, z0: zFar, x1: b, z1: zAcross + 30 });
    kerbX(a, b, zFar, -1);
    pave({ x0: a, z0: zRearLine - 40, x1: b, z1: zRearFar });
    kerbX(a, b, zRearFar, 1);
  }
  // Roads: the main street, the rear lane and the cross street through both blocks.
  tar({ x0: -far, z0: zK, x1: far, z1: zFar });
  tar({ x0: -far, z0: zRearFar, x1: far, z1: zRear });
  if (cross) {
    tar({ x0: cross.a, z0: zRearLine - 60, x1: cross.b, z1: zRearFar });
    tar({ x0: cross.a, z0: zRear, x1: cross.b, z1: zK });
    tar({ x0: cross.a, z0: zFar, x1: cross.b, z1: zAcross + 60 });
  }
  // The planted median with its kerbs, open at the cross street.
  const medianParts: THREE.BufferGeometry[] = [];
  for (const [a, b] of spans(2)) {
    medianParts.push(slab({ x0: a, z0: zMed0 + 0.3, x1: b, z1: zMed1 - 0.3 }, road, gy - 0.02));
    kerbX(a, b, zMed0, -1);
    kerbX(a, b, zMed1, 1);
  }
  // Markings: lane lines, edge lines by the median, parking bays, a zebra crossing at the corner.
  const paintY0 = road;
  const paintY1 = road + 0.006;
  const line = (x0: number, x1: number, z: number, wd = 0.12) => marks.push(box(x1 - x0, paintY1 - paintY0, wd, (x0 + x1) / 2, (paintY0 + paintY1) / 2, z));
  for (const [a, b] of spans(2)) {
    for (let x = a + 1; x < b - 3; x += 9) {
      line(x, x + 3, zK + PARK + LANE);
      line(x, x + 3, zMed1 + LANE);
    }
    line(a, b, zMed0 - 0.25);
    line(a, b, zMed1 + 0.25);
    for (let x = a + 1; x < b; x += 6) {
      marks.push(box(0.1, 0.006, 0.9, x, road + 0.003, zK + PARK - 0.45));
      marks.push(box(0.1, 0.006, 0.9, x, road + 0.003, zFar - PARK + 0.45));
    }
    line(a, b, zK + PARK, 0.1);
    line(a, b, zFar - PARK, 0.1);
  }
  if (cross) {
    const cx = (cross.a + cross.b) / 2;
    const zebraX = s > 0 ? cross.a - 3.2 : cross.b + 3.2;
    for (let z = zK + 0.6; z < zFar - 0.4; z += 1.0) {
      if (z > zMed0 - 0.2 && z < zMed1 + 0.2) continue;
      marks.push(box(3.4, 0.006, 0.5, zebraX, road + 0.003, z + 0.25));
    }
    for (let z = zRear - 1; z > zRearLine - 60; z -= 9) marks.push(box(0.12, 0.006, 3, cx, road + 0.003, z - 1.5));
    for (let z = zFar + 3; z < zAcross + 60; z += 9) marks.push(box(0.12, 0.006, 3, cx, road + 0.003, z + 1.5));
    marks.push(box(CROSS_ROAD / 2 - 0.4, 0.006, 0.4, (cross.a + cx) / 2, road + 0.003, zK - 1.2));
  }
  add(withShadow(new THREE.Mesh(own(merged(sidewalks)), m.slabs), false, recv), "sidewalks");
  add(withShadow(new THREE.Mesh(own(merged(asphalt)), m.asphalt), false, recv), "roads");
  add(withShadow(new THREE.Mesh(own(merged(kerbs)), m.kerb), false, recv), "kerbs");
  add(withShadow(new THREE.Mesh(own(merged(medianParts)), m.median), false, recv), "median");
  add(withShadow(new THREE.Mesh(own(merged(marks)), m.paint), false, recv), "markings");
  // Beyond the streets: city ground to the haze.
  const groundDisc = own(new THREE.CircleGeometry(2400, 72).rotateX(-Math.PI / 2).translate(0, road - 0.05, 0));
  add(withShadow(new THREE.Mesh(groundDisc, m.ground), false, recv), "city-ground");

  /* ---- buildings ---- */
  const b: Batches = {
    stone: new Batch(),
    plain: new Batch(),
    glass: new Batch(),
    metal: new Batch(),
    prism: new Batch(),
    window: new Batch(),
    slot: new Batch(),
    cylinder: new Batch(),
    far: new Batch(),
    trunk: new Batch(),
    crown: new Batch(),
    lamp: new Batch(),
    lamp2: new Batch(),
    sedan: new Batch(),
    sedanCabin: new Batch(),
    suv: new Batch(),
    suvCabin: new Batch(),
    wheel: new Batch(),
    cone: new Batch(),
    shrub: new Batch(),
  };
  // Mirror helper: x on the side away from the corner is -s * |x|.
  const away = (x: number) => -s * x;
  const span = (a: number, w: number): [number, number] => {
    const x1 = a + -s * w;
    return [Math.min(a, x1), Math.max(a, x1)];
  };
  const edgeAway = s > 0 ? plot.x0 : plot.x1;
  const neighbours: Building[] = [];
  const depth = zFront - zRear;
  {
    // Along the main street, away from the corner: a mixed-use block, a row of shops, an office.
    const [l1a, l1b] = span(edgeAway - s * ALLEY, 15);
    neighbours.push({ x0: l1a, x1: l1b, z0: zRear + 0.4, z1: zFront, floors: 2, style: "shops", faces: ["front", s > 0 ? "right" : "left"], stone: "#e9dfcc", najdi: true, awnings: true, fascia: "#ddd2bd", signs: ["#2f5446", "#7a5636"] });
    const [l2a, l2b] = span(s > 0 ? l1a - 0.5 : l1b + 0.5, 15);
    neighbours.push({ x0: l2a, x1: l2b, z0: zRear + 0.4, z1: zFront, floors: 3, style: "mixed", faces: ["front"], stone: "#e4d8c3", fascia: "#3e4144", signs: ["#e2d2b0", "#a8463a", "#e2d2b0"] });
    const [l3a, l3b] = span(s > 0 ? l2a - 0.5 : l2b + 0.5, 18);
    neighbours.push({ x0: l3a, x1: l3b, z0: zRear + 0.4, z1: zFront - 1, floors: 4, style: "office", faces: ["front"], stone: "#dfd3bd" });
    fillRow(b, random, s > 0 ? l3a - 0.5 : l3b + 0.5, -s * NEAR, zFront, depth - 0.4, 1, gy);
  }
  if (cross) {
    // The corner block beyond the cross street: shops on the corner, flats next to them.
    const start = s > 0 ? cross.b + CROSS_WALK : cross.a - CROSS_WALK;
    const r1: [number, number] = s > 0 ? [start, start + 18] : [start - 18, start];
    neighbours.push({ x0: r1[0], x1: r1[1], z0: zRear + 0.4, z1: zFront, floors: 2, style: "shops", faces: ["front", s > 0 ? "left" : "right"], stone: "#e9dfcb", najdi: true, fascia: "#d9cdb5", signs: ["#355a4b", "#8a6a40"] });
    const r2: [number, number] = s > 0 ? [r1[1] + 0.5, r1[1] + 16.5] : [r1[0] - 16.5, r1[0] - 0.5];
    neighbours.push({ x0: r2[0], x1: r2[1], z0: zRear + 0.4, z1: zFront, floors: 3, style: "residential", faces: ["front"], stone: "#efe7d9" });
    fillRow(b, random, s > 0 ? r2[1] + 0.5 : r2[0] - 0.5, s * NEAR, zFront, depth - 0.4, 1, gy);
  } else {
    const [r1a, r1b] = [plot.x1 + 0.5, plot.x1 + 18.5];
    neighbours.push({ x0: r1a, x1: r1b, z0: zRear + 0.4, z1: zFront, floors: 2, style: "shops", faces: ["front"], stone: "#e9dfcb", najdi: true });
    fillRow(b, random, r1b + 0.5, NEAR, zFront, depth - 0.4, 1, gy);
  }
  {
    // Across the main street, facing the building.
    const z0 = zAcross + 0.5;
    const a1: [number, number] = [away(4) - 11, away(4) + 11];
    neighbours.push({ x0: a1[0], x1: a1[1], z0, z1: z0 + 16, floors: 3, style: "mixed", faces: ["back"], stone: "#e4d7c0", fascia: "#cfc2aa", signs: ["#3c4a44", "#7b5b3d", "#56463a"] });
    const a2: [number, number] = s > 0 ? [a1[0] - 16.5, a1[0] - 0.5] : [a1[1] + 0.5, a1[1] + 16.5];
    neighbours.push({ x0: a2[0], x1: a2[1], z0, z1: z0 + 15, floors: 2, style: "shops", faces: ["back"], stone: "#ece5d8", najdi: true, awnings: true, fascia: "#e0d5bf", signs: ["#2c5b4d", "#9a4c35"] });
    fillRow(b, random, s > 0 ? a2[0] - 0.5 : a2[1] + 0.5, -s * NEAR, z0, 16, -1, gy);
    const nearCorner = s > 0 ? Math.max(a1[1] + 0.5, -far) : Math.min(a1[0] - 0.5, far);
    fillRow(b, random, nearCorner, s * NEAR, z0, 16, -1, gy, cross);
    // The rear block, behind the rear lane: flats over the building's roofline.
    const z1 = zRearLine;
    const b1: [number, number] = [-frame.across - 3, frame.across + 5];
    neighbours.push({ x0: b1[0], x1: b1[1], z0: z1 - 15, z1, floors: 3, style: "residential", faces: ["front"], stone: "#ebe2d2", najdi: true });
    fillRow(b, random, b1[0] - 0.5, -NEAR, z1, 15, 1, gy, cross);
    fillRow(b, random, b1[1] + 0.5, NEAR, z1, 15, 1, gy, cross);
  }
  for (const n of neighbours) building(n, gy, b, random, high);

  /* ---- palms, lamps, cars ---- */
  if (medium) {
    const palmsX = (x0: number, x1: number, z: number, stepM: number, planter: boolean) => {
      const dir = x1 >= x0 ? 1 : -1;
      for (let x = x0; (x1 - x) * dir >= 0; x += dir * stepM) {
        if (cross && x > cross.a - 1.5 && x < cross.b + 1.5) continue;
        palm(b, random, [x, gy + (planter ? 0.48 : 0), z], high);
        if (planter) {
          b.plain.add([x, gy + 0.24, z], [1.5, 0.48, 1.5], 0, "#ddd3c1");
          b.plain.add([x, gy + 0.47, z], [1.26, 0.03, 1.26], 0, "#5e5141");
        }
      }
    };
    const front0 = -frame.across - 1.2;
    const front1 = frame.across + 1.2;
    // Near sidewalk: palms in stone planters, framing the building's frontage (none in front of it).
    const range = NEAR - 20;
    if (cross && s > 0) palmsX(cross.b + 2.5, range, zK - 1.4, 9, true);
    else palmsX(front1, range, zK - 1.4, 9, true);
    if (cross && s < 0) palmsX(cross.a - 2.5, -range, zK - 1.4, 9, true);
    else palmsX(front0, -range, zK - 1.4, 9, true);
    // One palm on the forecourt corner away from the corner, framing the frontage in the street views.
    const fx = s > 0 ? front0 - 1.2 : front1 + 1.2;
    palm(b, random, [fx, gy + 0.48, plot.z1 - 2], high);
    b.plain.add([fx, gy + 0.24, plot.z1 - 2], [1.5, 0.48, 1.5], 0, "#ddd3c1");
    b.plain.add([fx, gy + 0.47, plot.z1 - 2], [1.26, 0.03, 1.26], 0, "#5e5141");
    // Low planters of shrubs along the forecourt's sides.
    for (const side of [-1, 1]) {
      const x = side * (frame.across + 1.6);
      const z0 = frame.deep + 1.2;
      const z1 = plot.z1 - 3.6;
      if (z1 - z0 < 1.5) continue;
      b.plain.add([x, gy + 0.25, (z0 + z1) / 2], [1.1, 0.5, z1 - z0], 0, "#ddd3c1");
      for (let z = z0 + 0.5; z < z1 - 0.3; z += 0.8) b.shrub.add([x + (random() - 0.5) * 0.2, gy + 0.42, z], [0.95, 0.7 + random() * 0.25, 0.9], random() * 3);
    }
    // Median: a palm every 10 m and a double-arm lamp every 30 m.
    const zm = (zMed0 + zMed1) / 2;
    palmsX(-range - 5, range + 5, zm, 10, false);
    for (let x = -range + 10; x <= range; x += 30) {
      if (cross && x > cross.a - 4 && x < cross.b + 4) continue;
      b.lamp2.add([x + 5, gy - 0.02, zm], [1, 1, 1], Math.PI / 2);
    }
    // Far sidewalk palms, and single lamps along both kerbs.
    palmsX(-range, range, zFar + 1.5, 10, false);
    for (let x = -range; x <= range; x += 25) {
      const xs = x + 12;
      if (!(xs > front0 - 2 && xs < front1 + 2) && !(cross && xs > cross.a - 2 && xs < cross.b + 2)) {
        b.lamp.add([xs, gy, zK - 0.55], [1, 1, 1], -Math.PI / 2);
      }
      if (!(cross && x > cross.a - 2 && x < cross.b + 2)) b.lamp.add([x, gy, zFar + 0.55], [1, 1, 1], Math.PI / 2);
    }
    if (cross) {
      // Along the cross street, beside the buildings (the corner itself stays open).
      const xa = cross.a - 1.3;
      const xb = cross.b + 1.3;
      for (let z = zRear + 4; z < zFront - 1.5; z += 9) {
        palm(b, random, [xa, gy, z], high);
        palm(b, random, [xb, gy, z], high);
      }
    }
    // Parked cars along both parking lanes and the cross street; a few on the move.
    const park = (x: number, z: number, rot: number) => car(b, random, [x, road, z], rot);
    for (let x = -range; x < range; x += 6.2) {
      // Customers park along the frontage too; the corner by the cross street stays clear.
      const clear = cross && (s > 0 ? x > cross.a - 13 && x < cross.b + 5 : x > cross.a - 5 && x < cross.b + 13);
      if (!clear && random() < 0.62) park(x + random() * 0.6, zK + PARK / 2 + 0.05, random() > 0.5 ? 0 : Math.PI);
      if (!(cross && x > cross.a - 6 && x < cross.b + 5) && random() < 0.55) park(x + random() * 0.6, zFar - PARK / 2 - 0.05, random() > 0.5 ? 0 : Math.PI);
    }
    // The rear lane: cars parked along the far side, nose to tail.
    for (let x = -range; x < range; x += 6.0) {
      if (cross && x > cross.a - 6 && x < cross.b + 4) continue;
      if (random() < 0.45) park(x + random() * 0.5, zRearFar + 1.25, random() > 0.5 ? 0 : Math.PI);
    }
    if (cross) {
      for (let z = zRear - 2; z > zRearLine - 40; z -= 6.2) if (random() < 0.5) park(cross.a + 1.2, z, Math.PI / 2);
      for (let z = zFar + 4; z < zAcross + 40; z += 6.2) if (random() < 0.5) park(cross.b - 1.2, z, -Math.PI / 2);
    }
    if (high) {
      // Traffic keeps right: the near carriageway runs towards -x, the far one towards +x.
      park(away(-32), zK + PARK + LANE * 1.5, 0);
      park(away(26), zK + PARK + LANE * 0.5, 0);
      park(away(-6), zMed1 + LANE * 0.5, Math.PI);
      park(away(40), zMed1 + LANE * 1.5, Math.PI);
      // Median planting between the palms.
      for (const [a, c] of spans(2)) {
        for (let x = Math.max(a, -NEAR) + 1.5; x < Math.min(c, NEAR) - 1.5; x += 2.2) {
          b.shrub.add([x + random() * 0.6, gy - 0.05, zm + (random() - 0.5) * 0.6], [0.9 + random() * 0.5, 0.45 + random() * 0.3, 0.9 + random() * 0.3], random() * 3);
        }
      }
      // Cafe umbrellas in front of the shops across the street.
      const cafe = away(4) - 6;
      for (let i = 0; i < 3; i++) {
        const x = cafe + i * 4.2 * -s;
        const z = zAcross - 2.2;
        b.cone.add([x, gy + 2.35, z], [1.45, 0.45, 1.45], 0, i % 2 ? "#ece5d6" : "#d8c9ad");
        b.cylinder.add([x, gy + 1.2, z], [0.05, 2.4, 0.05], 0, "#d9d6cf");
        b.plain.add([x, gy + 0.74, z], [0.8, 0.04, 0.8], 0, "#e7e3da");
        b.cylinder.add([x, gy + 0.37, z], [0.06, 0.74, 0.06], 0, "#3a3a3a");
      }
    }
  }

  /* ---- far city and skyline ---- */
  if (medium) {
    const pitch = 66;
    for (let gx = -8; gx <= 8; gx++) {
      for (let gz = -8; gz <= 8; gz++) {
        const bx = gx * pitch;
        const bz = gz * pitch + (zAcross + zRearLine) / 2;
        if (Math.hypot(bx, bz) > 520) continue;
        const cells = 2 + Math.floor(random() * 3);
        for (let i = 0; i < cells; i++) {
          for (let j = 0; j < 2; j++) {
            const w = 40 / cells - 2 - random() * 3;
            const dd = 18 - random() * 5;
            const x = bx - 20 + (i + 0.5) * (40 / cells);
            const z = bz - 10 + j * 22;
            if (Math.abs(x) < NEAR + w / 2 + 4 && z > zRearLine - 45 && z < zAcross + 40) continue;
            const r = random();
            const floors = r > 0.97 ? 9 + Math.floor(random() * 6) : r > 0.86 ? 4 + Math.floor(random() * 3) : r > 0.45 ? 2 + Math.floor(random() * 2) : 1 + Math.floor(random() * 2);
            const h = floors * 3.5 + 1;
            b.far.add([x, gy - 0.3 + h / 2, z], [w, h + 0.3, dd], 0, STONES[Math.floor(random() * STONES.length)]);
          }
        }
      }
    }
  }

  /* ---- build the instanced meshes ---- */
  const unit = own(new THREE.BoxGeometry(1, 1, 1));
  const prism = own(prismGeometry());
  const surround = own(surroundGeometry(1.3, 1.6, 0.16, 0.14));
  const slotSurround = own(surroundGeometry(0.8, 2.1, 0.14, 0.16));
  const cylinder = own(new THREE.CylinderGeometry(1, 1, 1, 14));
  const cone = own(new THREE.ConeGeometry(1, 1, 10, 1, false));
  const shrub = own(new THREE.SphereGeometry(0.5, 10, 6).translate(0, 0.3, 0));
  add(b.stone.mesh(unit, m.stone, cast, recv), "neighbours");
  add(b.plain.mesh(unit, m.plain, cast, recv), "details");
  add(b.glass.mesh(unit, m.glass, false, recv), "glazing");
  add(b.metal.mesh(unit, m.metal, false, false), "mullions");
  add(b.prism.mesh(prism, m.plain, cast, recv), "najdi-triangles");
  add(b.window.mesh(surround, m.plain, cast, recv), "windows");
  add(b.slot.mesh(slotSurround, m.plain, cast, recv), "slot-windows");
  add(b.cylinder.mesh(cylinder, m.plain, cast, recv), "tanks");
  add(b.cone.mesh(cone, m.plain, cast, recv), "umbrellas");
  add(b.shrub.mesh(shrub, m.shrub, false, recv), "median-shrubs");
  const farMesh = b.far.mesh(unit, m.far, false, false);
  add(farMesh, "city");
  if (medium) {
    const trunk = own(trunkGeometry());
    const crown = own(crownGeometry(rng(o.seed + 5)));
    add(b.trunk.mesh(trunk, m.trunk, cast, recv), "palm-trunks");
    add(b.crown.mesh(crown, m.frond, cast, recv), "palm-crowns");
    add(b.lamp.mesh(own(lampGeometry(false)), m.lamp, cast, false), "lamps");
    add(b.lamp2.mesh(own(lampGeometry(true)), m.lamp, cast, false), "median-lamps");
    const sedan = carGeometries("sedan");
    const suv = carGeometries("suv");
    add(b.sedan.mesh(own(sedan.body), m.paintwork, cast, recv), "cars");
    add(b.sedanCabin.mesh(own(sedan.cabin), m.carGlass, cast, false), "car-glass");
    add(b.suv.mesh(own(suv.body), m.paintwork, cast, recv), "suvs");
    add(b.suvCabin.mesh(own(suv.cabin), m.carGlass, cast, false), "suv-glass");
    add(b.wheel.mesh(own(new THREE.CylinderGeometry(1, 1, 1, 16).rotateX(Math.PI / 2)), m.tyre, false, false), "wheels");
  }
  if (high) add(skyline(rng(o.seed + 11), road, own, mat), "skyline");
  if (o.sky) add(hazeSky(own, mat), "sky");

  return {
    group,
    dispose: () => {
      group.traverse((obj) => {
        if (obj instanceof THREE.InstancedMesh) obj.dispose();
      });
      for (const g of geometries) g.dispose();
      for (const x of materials) x.dispose();
      if (textures) {
        textures.slabs.dispose();
        textures.slabsNormal.dispose();
        textures.frond.dispose();
        textures.bark.dispose();
        textures.barkNormal.dispose();
        textures.facade.dispose();
      }
    },
  };
}

function withShadow<T extends THREE.Mesh>(mesh: T, cast: boolean, receive: boolean): T {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

/** One date palm at `base` (top of its planter or the ground): 5.5-8 m trunk and a crown. */
function palm(out: Batches, random: () => number, base: [number, number, number], lean: boolean) {
  const h = 5.4 + random() * 2.6;
  const tilt = lean ? (random() - 0.5) * 0.08 : 0;
  const turn = random() * Math.PI * 2;
  out.trunk.add(base, [1, h, 1], turn, undefined, tilt);
  // The trunk's top after its lean (Euler YXZ: tilt about x, then the turn about y).
  const top = h - 0.15;
  const k = 0.9 + random() * 0.25;
  out.crown.add(
    [base[0] + top * Math.sin(tilt) * Math.sin(turn), base[1] + top * Math.cos(tilt), base[2] + top * Math.sin(tilt) * Math.cos(turn)],
    [k, k * (0.9 + random() * 0.2), k],
    random() * Math.PI * 2,
  );
}

/** Wheel radius, axle offset from the car's middle and body width of each car type (as in carGeometries). */
const CAR = { sedan: { wheel: 0.34, axle: 1.4, width: 1.7 }, suv: { wheel: 0.4, axle: 1.45, width: 1.78 } };

/** A car on the road at `at` (road level), its front towards -x rotated by `rot`. */
function car(out: Batches, random: () => number, at: [number, number, number], rot: number) {
  const suv = random() < 0.42;
  const spec = suv ? CAR.suv : CAR.sedan;
  const paint = PAINTS[Math.floor(random() * PAINTS.length)];
  (suv ? out.suv : out.sedan).add(at, [1, 1, 1], rot, paint);
  (suv ? out.suvCabin : out.sedanCabin).add(at, [1, 1, 1], rot);
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  const half = spec.width / 2 - 0.02;
  for (const ax of [-spec.axle, spec.axle]) {
    for (const side of [-half, half]) {
      // Local (ax, side) rotated about y by rot.
      const x = at[0] + ax * c + side * sn;
      const z = at[2] - ax * sn + side * c;
      out.wheel.add([x, at[1] + spec.wheel, z], [spec.wheel, spec.wheel, 0.24], rot);
    }
  }
}

/** Distant towers as soft silhouettes in the haze (no fog, no lighting). */
function skyline(random: () => number, y0: number, own: <T extends THREE.BufferGeometry>(g: T) => T, mat: <T extends THREE.Material>(m: T) => T): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const clusters: [number, number, number, number][] = [
    // angle (radians, from local -z towards +x), distance, towers, max height
    [-0.42, 980, 11, 230],
    [0.95, 1250, 7, 150],
    [-1.75, 1350, 6, 120],
    [2.6, 1400, 5, 110],
  ];
  for (const [angle, dist, count, top] of clusters) {
    const cx = Math.sin(angle) * dist;
    const cz = -Math.cos(angle) * dist;
    for (let i = 0; i < count; i++) {
      const w = 22 + random() * 26;
      const h = (0.3 + random() * 0.7) * top * (i === 0 ? 1.15 : 1);
      const x = cx + (random() - 0.5) * 260;
      const z = cz + (random() - 0.5) * 160;
      parts.push(box(w, h, w * (0.7 + random() * 0.6), x, y0 + h / 2, z));
      if (random() > 0.6) parts.push(box(w * 0.55, h * 0.12, w * 0.55, x, y0 + h + h * 0.06, z));
    }
  }
  const g = merged(parts);
  const p = g.getAttribute("position");
  const colors: number[] = [];
  const low = new THREE.Color("#d9d8d2");
  const high = new THREE.Color("#bfc3c6");
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.copy(low).lerp(high, Math.min(1, (p.getY(i) - y0) / 220));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  own(g);
  const material = mat(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  return mesh;
}

/** A light warm-haze sky: pale warm horizon, soft blue overhead (for hosts without their own sky). */
function hazeSky(own: <T extends THREE.BufferGeometry>(g: T) => T, mat: <T extends THREE.Material>(m: T) => T): THREE.Mesh {
  const g = own(new THREE.SphereGeometry(2600, 32, 16));
  const p = g.getAttribute("position");
  const colors: number[] = [];
  const zenith = new THREE.Color("#9dbad3");
  const mid = new THREE.Color("#c9d7e1");
  const horizon = new THREE.Color("#efe6d6");
  const below = new THREE.Color("#e3d9c8");
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 2600;
    if (y < 0) c.copy(below);
    else if (y < 0.18) c.copy(horizon).lerp(mid, y / 0.18);
    else c.copy(mid).lerp(zenith, Math.min(1, (y - 0.18) / 0.6));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(g, mat(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

/* ---------------- component ---------------- */

export function SaudiStreet({
  footprint,
  groundY = 0,
  front = "south",
  corner = "right",
  detail = "high",
  intensity = 0.7,
  sky = true,
  shadows = true,
  seed = 7,
}: SaudiStreetProps) {
  const invalidate = useThree((state) => state.invalidate);
  const tone = useMemo<Tone>(() => ({ desat: { value: 0.18 }, flat: { value: 0.09 }, ground: { value: 0 } }), []);
  const { minX, minZ, maxX, maxZ } = footprint;
  const built = useMemo(
    () => buildStreet({ footprint: { minX, minZ, maxX, maxZ }, groundY, front, corner, detail, sky, shadows, seed }, tone),
    [minX, minZ, maxX, maxZ, groundY, front, corner, detail, sky, shadows, seed, tone],
  );
  useEffect(() => () => built.dispose(), [built]);
  useEffect(() => {
    const k = clamp(intensity, 0, 1);
    tone.desat.value = (1 - k) * 0.6;
    tone.flat.value = (1 - k) * 0.3;
    tone.ground.value = groundY - KERB;
    invalidate();
  }, [intensity, groundY, tone, invalidate]);
  return <primitive object={built.group} />;
}

export default SaudiStreet;
