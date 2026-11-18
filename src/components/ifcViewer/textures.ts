import * as THREE from "three";

/*
 * Surface detail drawn in code with a seeded generator, so every load is identical and the
 * page ships no image files. Building textures are near-white: they modulate the colour each
 * element carries in the IFC file (vertex colours) instead of replacing it. UVs are in
 * metres, so `repeat = 1 / physical size of one tile`.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function valueNoise(size: number, cells: number, random: () => number): Float32Array {
  const grid = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = random();
  // wrap so the tile repeats seamlessly
  for (let i = 0; i <= cells; i++) {
    grid[i * (cells + 1) + cells] = grid[i * (cells + 1)];
    grid[cells * (cells + 1) + i] = grid[i];
  }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells;
      const gy = (y / size) * cells;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const tx = gx - x0, ty = gy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = grid[y0 * (cells + 1) + x0];
      const b = grid[y0 * (cells + 1) + x0 + 1];
      const c = grid[(y0 + 1) * (cells + 1) + x0];
      const d = grid[(y0 + 1) * (cells + 1) + x0 + 1];
      out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

function fbm(size: number, seed: number, octaves = 4, base = 4): Float32Array {
  const random = rng(seed);
  const out = new Float32Array(size * size);
  let amp = 0.5, total = 0;
  for (let o = 0; o < octaves; o++) {
    const layer = valueNoise(size, base << o, random);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function finish(canvas: HTMLCanvasElement, tile: number, color = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / tile, 1 / tile);
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function paint(size: number, draw: (img: ImageData) => void): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  draw(img);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Fine trowelled plaster, 2 m tile. */
export function plasterTexture(): THREE.CanvasTexture {
  const size = 512;
  const n = fbm(size, 11, 5, 6);
  return finish(
    paint(size, (img) => {
      for (let i = 0; i < n.length; i++) {
        const v = 236 + (n[i] - 0.5) * 30;
        img.data.set([v, v, v - 2, 255], i * 4);
      }
    }),
    2,
  );
}

/** Terrazzo floor with stone chips, 1.2 m tile. */
export function terrazzoTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = paint(size, (img) => {
    const n = fbm(size, 23, 3, 4);
    for (let i = 0; i < n.length; i++) {
      const v = 238 + (n[i] - 0.5) * 12;
      img.data.set([v, v - 2, v - 6, 255], i * 4);
    }
  });
  const ctx = canvas.getContext("2d")!;
  const random = rng(97);
  const chips = ["#9b958c", "#c9c2b6", "#6f6b66", "#b6a58e", "#e2ddd3", "#857a6c"];
  for (let i = 0; i < 2600; i++) {
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
  return finish(canvas, 1.2);
}

/** Straight wood grain, 1 m tile. */
export function woodTexture(): THREE.CanvasTexture {
  const size = 512;
  const n = fbm(size, 41, 4, 3);
  return finish(
    paint(size, (img) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const grain = Math.sin((x / size) * Math.PI * 2 * 26 + n[i] * 9) * 0.5 + 0.5;
          const v = 214 + grain * 30 + (n[i] - 0.5) * 18;
          img.data.set([v, v - 6, v - 14, 255], i * 4);
        }
      }
    }),
    1,
  );
}

/** Desert sand with faint wind ripples, 8 m tile. */
export function sandTexture(): THREE.CanvasTexture {
  const size = 1024;
  const n = fbm(size, 7, 6, 4);
  const random = rng(5);
  return finish(
    paint(size, (img) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const ripple = Math.sin((y / size) * Math.PI * 2 * 22 + n[i] * 14) * 0.5 + 0.5;
          const grain = (random() - 0.5) * 16;
          const v = (n[i] - 0.5) * 34 + ripple * 9 + grain;
          img.data.set([222 + v, 207 + v, 180 + v * 0.9, 255], i * 4);
        }
      }
    }),
    8,
  );
}
