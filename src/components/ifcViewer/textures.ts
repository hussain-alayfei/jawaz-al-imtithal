import * as THREE from "three";
import type { Finish } from "./finishes";

/*
 * Surface detail drawn in code with a seeded generator, so every load is identical and the
 * page ships no image files. Building textures are near-white: they modulate the colour each
 * element carries in the IFC file (vertex colours) instead of replacing it. UVs are in metres
 * (the reader's box projection), so `repeat = 1 / physical size of one tile`. Each set has a
 * colour map (sRGB) and, where the relief matters at viewing distance, a tangent-space normal
 * map and a roughness map (both linear). Sets are built on first use and cached for the page.
 */

export interface TextureSet {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  normalScale?: number;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Tileable value noise on a `cells` x `cellsY` grid. */
function valueNoise(size: number, cells: number, random: () => number, cellsY = cells): Float32Array {
  const gw = cells + 1;
  const grid = new Float32Array(gw * (cellsY + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = random();
  for (let j = 0; j <= cellsY; j++) grid[j * gw + cells] = grid[j * gw];
  for (let i = 0; i <= cells; i++) grid[cellsY * gw + i] = grid[i];
  const out = new Float32Array(size * size);
  const sx = cells / size;
  const sy = cellsY / size;
  for (let y = 0; y < size; y++) {
    const gy = y * sy;
    const y0 = gy | 0;
    let ty = gy - y0;
    ty = ty * ty * (3 - 2 * ty);
    const r0 = y0 * gw;
    const r1 = r0 + gw;
    for (let x = 0; x < size; x++) {
      const gx = x * sx;
      const x0 = gx | 0;
      let tx = gx - x0;
      tx = tx * tx * (3 - 2 * tx);
      const a = grid[r0 + x0], b = grid[r0 + x0 + 1], c = grid[r1 + x0], d = grid[r1 + x0 + 1];
      const top = a + (b - a) * tx;
      out[y * size + x] = top + (c + (d - c) * tx - top) * ty;
    }
  }
  return out;
}

function fbm(size: number, seed: number, octaves = 4, base = 4, stretchY = 1): Float32Array {
  const random = rng(seed);
  const out = new Float32Array(size * size);
  let amp = 0.5, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = base << o;
    const layer = valueNoise(size, cells, random, Math.max(1, Math.round(cells * stretchY)));
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Tangent-space normal map (OpenGL convention, row 0 = v 0) from a tileable height field. */
function normalFromHeight(height: Float32Array, size: number, strength: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const up = ((y + 1) % size) * size;
    const down = ((y - 1 + size) % size) * size;
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const right = (x + 1) % size;
      const left = (x - 1 + size) % size;
      const dx = (height[row + right] - height[row + left]) * strength;
      const dy = (height[up + x] - height[down + x]) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (row + x) * 4;
      out[i] = (-dx * inv * 0.5 + 0.5) * 255;
      out[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      out[i + 2] = (inv * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

function grey(values: Float32Array, scale = 255): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    const v = Math.min(255, Math.max(0, values[i] * scale));
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

function texture(data: Uint8Array, size: number, tile: number | [number, number], color: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const [tu, tv] = Array.isArray(tile) ? tile : [tile, tile];
  t.repeat.set(1 / tu, 1 / tv);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/* ---------------- building finishes ---------------- */

/** Fine trowelled plaster or matt paint, 2 m tile. */
function plaster(): TextureSet {
  const size = 512;
  const fine = fbm(size, 11, 5, 8);
  const broad = fbm(size, 12, 2, 2);
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < fine.length; i++) {
    const v = 236 + (fine[i] - 0.5) * 20 + (broad[i] - 0.5) * 12;
    rgba.set([v, v, v - 2, 255], i * 4);
  }
  return {
    map: texture(rgba, size, 2, true),
    normalMap: texture(normalFromHeight(fine, size, 1.6), size, 2, false),
    normalScale: 0.45,
  };
}

/** Board-marked concrete with pores and stains, 2.4 m tile. */
function concrete(): TextureSet {
  const size = 512;
  const n = fbm(size, 31, 5, 6);
  const stain = fbm(size, 32, 3, 2);
  const random = rng(33);
  const height = new Float32Array(n);
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < n.length; i++) {
    const pore = random() > 0.996 ? 1 : 0;
    height[i] -= pore * 0.6;
    const v = 226 + (n[i] - 0.5) * 26 + (stain[i] - 0.5) * 22 - pore * 50;
    rgba.set([v, v, v - 3, 255], i * 4);
  }
  return {
    map: texture(rgba, size, 2.4, true),
    normalMap: texture(normalFromHeight(height, size, 2.2), size, 2.4, false),
    normalScale: 0.5,
  };
}

/** Polished terrazzo with stone chips in 1.2 m bays separated by zinc divider strips. */
function terrazzo(): TextureSet {
  const size = 1024;
  const n = fbm(size, 23, 3, 4);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < n.length; i++) {
    const v = 238 + (n[i] - 0.5) * 12;
    img.data.set([v, v - 2, v - 6, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  const random = rng(97);
  const chips = ["#9b958c", "#c9c2b6", "#6f6b66", "#b6a58e", "#e2ddd3", "#857a6c", "#a89f92"];
  for (let i = 0; i < 3200; i++) {
    const x = random() * size, y = random() * size;
    const r = 1.2 + random() ** 3 * 7;
    ctx.fillStyle = chips[Math.floor(random() * chips.length)];
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + random() * 0.6;
      const rr = r * (0.6 + random() * 0.6);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  const data = new Uint8Array(ctx.getImageData(0, 0, size, size).data.buffer);
  // Divider strips (4 mm) on the bay edges; the strip stands proud of the polished surface.
  const strip = Math.max(2, Math.round((0.004 / 1.2) * size));
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x < strip || y < strip) {
        const i = (y * size + x) * 4;
        data[i] = 176; data[i + 1] = 172; data[i + 2] = 164;
        height[y * size + x] = 1;
      }
    }
  }
  return {
    map: texture(data, size, 1.2, true),
    normalMap: texture(normalFromHeight(height, size, 0.8), size, 1.2, false),
    normalScale: 0.6,
  };
}

/**
 * Square tiles with grout: `tiles` per texture side, `groutMetres` wide, with a soft cushion
 * edge, a small tone shift per tile and a glossy face over a rough grout.
 */
function tiles(
  seed: number,
  size: number,
  tileMetres: number,
  perSide: number,
  groutMetres: number,
  cushionMetres: number,
  base: [number, number, number],
  groutRgb: [number, number, number],
  faceRough: number,
  vein: number,
): TextureSet {
  const cell = size / perSide;
  const cushion = Math.max(1, (cushionMetres / tileMetres) * size);
  const grout = Math.max(1.2, (groutMetres / (tileMetres / perSide)) * cell);
  const random = rng(seed);
  const shade = Array.from({ length: perSide * perSide }, () => (random() - 0.5) * 2);
  const n = fbm(size, seed + 1, 4, 6);
  const rgba = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const cy = Math.floor(y / cell);
    const fy = y - cy * cell;
    const ey = Math.min(fy, cell - fy);
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cell);
      const fx = x - cx * cell;
      const edge = Math.min(ey, Math.min(fx, cell - fx));
      const i = y * size + x;
      if (edge < grout / 2) {
        rgba.set([groutRgb[0], groutRgb[1], groutRgb[2], 255], i * 4);
        height[i] = 0;
        rough[i] = 0.85;
      } else {
        const t = shade[cy * perSide + cx] * 3 + (n[i] - 0.5) * vein;
        rgba.set([clamp255(base[0] + t), clamp255(base[1] + t), clamp255(base[2] + t), 255], i * 4);
        // cushion edge: the glaze rounds over into the grout joint
        const rise = Math.min(1, (edge - grout / 2) / cushion);
        height[i] = 0.4 + 0.6 * Math.sin((rise * Math.PI) / 2) + (n[i] - 0.5) * 0.04;
        rough[i] = faceRough + (n[i] - 0.5) * 0.04;
      }
    }
  }
  return {
    map: texture(rgba, size, tileMetres, true),
    normalMap: texture(normalFromHeight(height, size, 3), size, tileMetres, false),
    roughnessMap: texture(grey(rough), size, tileMetres, false),
    normalScale: 0.8,
  };
}

/** Straight-grained oak, 1 m tile: grain in colour, relief and gloss. */
function wood(): TextureSet {
  const size = 512;
  const n = fbm(size, 41, 4, 3);
  const fine = fbm(size, 42, 3, 2, 16);
  const rgba = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const grain = Math.sin((y / size) * Math.PI * 2 * 26 + n[i] * 9) * 0.5 + 0.5;
      const v = 206 + grain * 34 + (n[i] - 0.5) * 18 + (fine[i] - 0.5) * 14;
      rgba.set([v, v - 7, v - 16, 255], i * 4);
      height[i] = grain * 0.6 + fine[i] * 0.4;
      rough[i] = 0.42 + grain * 0.16;
    }
  }
  return {
    map: texture(rgba, size, 1, true),
    normalMap: texture(normalFromHeight(height, size, 1.2), size, 1, false),
    roughnessMap: texture(grey(rough), size, 1, false),
    normalScale: 0.35,
  };
}

/** Plain-weave upholstery, 0.12 m tile (about 1.5 mm threads). */
function fabric(): TextureSet {
  const size = 256;
  const threads = 80;
  const heather = fbm(size, 51, 3, 16);
  const rgba = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = (x / size) * threads, v = (y / size) * threads;
      const over = (Math.floor(u) + Math.floor(v)) % 2 === 0;
      const warp = Math.sin((u % 1) * Math.PI), weft = Math.sin((v % 1) * Math.PI);
      height[i] = over ? warp * 0.8 + weft * 0.2 : weft * 0.8 + warp * 0.2;
      const c = 214 + (heather[i] - 0.5) * 36 + height[i] * 22;
      rgba.set([c, c, c, 255], i * 4);
    }
  }
  return {
    map: texture(rgba, size, 0.12, true),
    normalMap: texture(normalFromHeight(height, size, 1.4), size, 0.12, false),
    normalScale: 0.9,
  };
}

/** Pebbled leather grain, 0.3 m tile. */
function leather(): TextureSet {
  const size = 512;
  const n = fbm(size, 61, 4, 24);
  const height = new Float32Array(size * size);
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < n.length; i++) {
    const ridge = 1 - Math.abs(n[i] - 0.5) * 2;
    height[i] = ridge ** 3;
    const v = 226 + (n[i] - 0.5) * 18 - height[i] * 18;
    rgba.set([v, v, v, 255], i * 4);
  }
  return {
    map: texture(rgba, size, 0.3, true),
    normalMap: texture(normalFromHeight(height, size, 2), size, 0.3, false),
    normalScale: 0.6,
  };
}

/** Brushed stainless steel: fine streaks along u in the gloss, 0.8 m tile. */
function brushed(): TextureSet {
  const size = 512;
  const streak = fbm(size, 71, 4, 4, 48);
  const smudge = fbm(size, 72, 3, 3);
  const rough = new Float32Array(size * size);
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < streak.length; i++) {
    rough[i] = 0.2 + streak[i] * 0.16 + (smudge[i] - 0.5) * 0.08;
    const v = 238 + (streak[i] - 0.5) * 18;
    rgba.set([v, v, v, 255], i * 4);
  }
  return {
    map: texture(rgba, size, 0.8, true),
    roughnessMap: texture(grey(rough), size, 0.8, false),
    normalMap: texture(normalFromHeight(streak, size, 0.6), size, 0.8, false),
    normalScale: 0.15,
  };
}

/** Powder-coated or enamelled steel: a faint orange peel, 0.5 m tile. */
function painted(): TextureSet {
  const size = 256;
  const peel = fbm(size, 81, 3, 24);
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < peel.length; i++) {
    const v = 240 + (peel[i] - 0.5) * 10;
    rgba.set([v, v, v, 255], i * 4);
  }
  return {
    map: texture(rgba, size, 0.5, true),
    normalMap: texture(normalFromHeight(peel, size, 1.2), size, 0.5, false),
    normalScale: 0.25,
  };
}

/** Honed limestone cladding in 0.6 m courses. */
function stone(): TextureSet {
  return tiles(91, 1024, 1.2, 2, 0.004, 0.002, [236, 228, 212], [196, 190, 178], 0.7, 26);
}

/** Loop-pile carpet, 0.5 m tile. */
function carpet(): TextureSet {
  const size = 256;
  const n = fbm(size, 95, 4, 48);
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < n.length; i++) {
    const v = 216 + (n[i] - 0.5) * 50;
    rgba.set([v, v, v, 255], i * 4);
  }
  return {
    map: texture(rgba, size, 0.5, true),
    normalMap: texture(normalFromHeight(n, size, 3), size, 0.5, false),
    normalScale: 0.8,
  };
}

/** Texture recipe per finish; finishes that share a surface share one cached set. */
const recipes = {
  plaster,
  concrete,
  stone,
  terrazzo,
  porcelain: () => tiles(101, 1024, 1.2, 2, 0.003, 0.0012, [236, 234, 230], [176, 172, 166], 0.32, 10),
  // Kitchen wall tiles: 20 x 20 cm glazed ceramic, 2 mm grey grout, 2.5 mm cushion edge.
  ceramicTile: () => tiles(111, 1024, 1.2, 6, 0.002, 0.0025, [246, 246, 244], [168, 168, 164], 0.08, 6),
  // Flat-roof tiles: 40 x 40 cm cement tiles, 6 mm joints.
  roofTile: () => tiles(115, 512, 1.2, 3, 0.006, 0.002, [232, 228, 220], [170, 166, 158], 0.9, 30),
  // Lay-in ceiling tiles: 60 x 60 cm in a 15 mm grid.
  ceilingTile: () => tiles(117, 512, 1.2, 2, 0.015, 0.001, [248, 248, 246], [214, 214, 210], 0.85, 4),
  // Aluminium composite panels: 1.2 m modules with 10 mm open joints, semi-gloss coil coating.
  panel: () => tiles(119, 512, 2.4, 2, 0.01, 0.0015, [244, 244, 244], [44, 46, 48], 0.32, 3),
  wood,
  fabric,
  leather,
  carpet,
  brushed,
  painted,
};
type Recipe = keyof typeof recipes;

const RECIPE_OF: Partial<Record<Finish, Recipe>> = {
  plaster: "plaster",
  paint: "plaster",
  concrete: "concrete",
  stone: "stone",
  panel: "panel",
  terrazzo: "terrazzo",
  porcelain: "porcelain",
  epoxy: "painted",
  roofTile: "roofTile",
  ceilingTile: "ceilingTile",
  woodFloor: "wood",
  carpet: "carpet",
  ceramicTile: "ceramicTile",
  wood: "wood",
  fabric: "fabric",
  leather: "leather",
  stainless: "brushed",
  aluminium: "painted",
  paintedMetal: "painted",
  ceramic: "painted",
  generic: "plaster",
};

const cache = new Map<string, TextureSet>();

/** Texture set for a finish (undefined for glass, which has none). */
export function finishTextures(finish: Finish): TextureSet | undefined {
  const recipe = RECIPE_OF[finish];
  if (!recipe) return undefined;
  const key = `finish:${recipe}`;
  let set = cache.get(key);
  if (!set) cache.set(key, (set = recipes[recipe]()));
  return set;
}

/* ---------------- site context ---------------- */

/** Concrete paving slabs, 60 x 30 cm in running bond, warm grey-beige, 2.4 m tile. */
function pavers(): TextureSet {
  const size = 1024;
  const tile = 2.4;
  const px = size / tile; // pixels per metre
  const w = 0.6 * px, h = 0.3 * px;
  const joint = 0.006 * px;
  const random = rng(121);
  const cols = Math.round(tile / 0.6), rows = Math.round(tile / 0.3);
  const shade = Array.from({ length: cols * rows }, () => random());
  const n = fbm(size, 122, 5, 8);
  const speck = rng(123);
  const rgba = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / h);
    const fy = y - row * h;
    const offset = row % 2 ? w / 2 : 0;
    for (let x = 0; x < size; x++) {
      const xs = (x + offset) % size;
      const col = Math.floor(xs / w);
      const fx = xs - col * w;
      const edge = Math.min(fx, w - fx, fy, h - fy);
      const i = y * size + x;
      if (edge < joint / 2) {
        rgba.set([146, 140, 130, 255], i * 4);
        height[i] = 0;
        rough[i] = 0.95;
        continue;
      }
      const s = shade[(row % rows) * cols + (col % cols)];
      const tone = (s - 0.5) * 22 + (n[i] - 0.5) * 26 + (speck() > 0.985 ? -28 : 0);
      rgba.set([clamp255(212 + tone), clamp255(204 + tone), clamp255(189 + tone * 0.9), 255], i * 4);
      const bevel = Math.min(1, (edge - joint / 2) / (0.004 * px));
      height[i] = 0.5 + 0.5 * bevel + (n[i] - 0.5) * 0.12;
      rough[i] = 0.86 + (n[i] - 0.5) * 0.1;
    }
  }
  return {
    map: texture(rgba, size, tile, true),
    normalMap: texture(normalFromHeight(height, size, 2.5), size, tile, false),
    roughnessMap: texture(grey(rough), size, tile, false),
    normalScale: 0.9,
  };
}

/** Asphalt with exposed aggregate, 3 m tile. */
function asphalt(): TextureSet {
  const size = 512;
  const n = fbm(size, 131, 5, 6);
  const random = rng(132);
  const height = new Float32Array(size * size);
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < n.length; i++) {
    const stone = random();
    const bump = stone > 0.93 ? (stone - 0.93) * 10 : 0;
    height[i] = n[i] * 0.4 + bump;
    const v = 96 + (n[i] - 0.5) * 22 + bump * 40 + (random() - 0.5) * 10;
    rgba.set([v, v, v + 2, 255], i * 4);
  }
  return {
    map: texture(rgba, size, 3, true),
    normalMap: texture(normalFromHeight(height, size, 1.5), size, 3, false),
    normalScale: 0.7,
  };
}

/** Precast kerb stones, 1 m long. */
function kerb(): TextureSet {
  const size = 256;
  const n = fbm(size, 141, 4, 6);
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const joint = x < 2 ? -40 : 0;
      const v = 214 + (n[i] - 0.5) * 22 + joint;
      rgba.set([v, v - 1, v - 5, 255], i * 4);
    }
  }
  return { map: texture(rgba, size, 1, true), normalMap: texture(normalFromHeight(n, size, 1.5), size, 1, false), normalScale: 0.4 };
}

/** Desert sand with faint wind ripples, 8 m tile. */
function sand(): TextureSet {
  const size = 1024;
  const n = fbm(size, 7, 6, 4);
  const random = rng(5);
  const rgba = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const ripple = Math.sin((y / size) * Math.PI * 2 * 22 + n[i] * 14) * 0.5 + 0.5;
      const grain = (random() - 0.5) * 16;
      const v = (n[i] - 0.5) * 34 + ripple * 9 + grain;
      height[i] = ripple * 0.5 + n[i] * 0.5;
      rgba.set([clamp255(222 + v), clamp255(207 + v), clamp255(180 + v * 0.9), 255], i * 4);
    }
  }
  return { map: texture(rgba, size, 8, true), normalMap: texture(normalFromHeight(height, size, 1.2), size, 8, false), normalScale: 0.5 };
}

const siteBuilders = { pavers, asphalt, kerb, sand };
export type SiteSurface = keyof typeof siteBuilders;

export function siteTextures(surface: SiteSurface): TextureSet {
  const key = `site:${surface}`;
  let set = cache.get(key);
  if (!set) cache.set(key, (set = siteBuilders[surface]()));
  return set;
}

/** Frees the GPU copies; the cached sources upload again on the next use. */
export function releaseTextures() {
  for (const set of cache.values()) {
    set.map.dispose();
    set.normalMap?.dispose();
    set.roughnessMap?.dispose();
  }
}
