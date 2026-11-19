#!/usr/bin/env node
/*
 * Renders the landing-page images of the 3D model from the app itself (the sample IFC file run
 * through the real pipeline, drawn by the real viewer):
 *
 *   src/assets/model-hero.webp      /?capture=hero#/check?sample=tiles       golden-hour facade, no interface
 *   src/assets/model-networks.webp  /?capture=networks#/check?sample=tiles   building-services view, no interface
 *
 * Usage (from the project folder):
 *   npm run build && node scripts/capture-model.mjs          serves dist/client with `vite preview`
 *   node scripts/capture-model.mjs http://127.0.0.1:5401      uses a server that is already running (dev or preview)
 *
 * Options:
 *   --shots hero,networks   which images (default both)
 *   --sample tiles          sample id from src/content/samples.ts
 *   --size 2400x1350        viewport in CSS pixels (device scale 1)
 *   --quality 0.9           WebP quality
 *   --png                   also write PNG copies next to the WebP files
 *   --out src/assets        output folder
 *   --browser <path|chrome|msedge>   browser to drive (default: the installed Chrome)
 *   --software              force SwiftShader (machines without a GPU; frame times are then not representative)
 *   --timeout 300000        per-shot timeout in ms
 *
 * The sample link opens the check on its review step (nothing runs on its own), so the script presses
 * «بدء الفحص», waits for the summary and presses «عرض النتائج», as a visitor would.
 * The viewer renders continuously in capture mode (its normal frame loop is on demand) and sets
 * window.__APP__.ready after its warm-up and 8 frames; the script waits for that, lets a few more
 * frames settle, screenshots the window and encodes WebP in the page. Prints one JSON summary line;
 * exit code 1 on console errors, a timeout or a failed write, 2 on bad arguments or setup.
 */
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* The check wizard's buttons (copy.web.wizard.start and copy.web.wizard.results in src/content/copy.ts). */
const CHECK_START = "بدء الفحص";
const CHECK_RESULTS = "عرض النتائج";

function parse(argv) {
  const o = { shots: "hero,networks", sample: "tiles", size: "2400x1350", quality: 0.9, out: "src/assets", timeout: 300000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--shots") o.shots = next();
    else if (a === "--sample") o.sample = next();
    else if (a === "--size") o.size = next();
    else if (a === "--quality") o.quality = Number(next());
    else if (a === "--out") o.out = next();
    else if (a === "--browser") o.browser = next();
    else if (a === "--timeout") o.timeout = Number(next());
    else if (a === "--png") o.png = true;
    else if (a === "--software") o.software = true;
    else if (a === "-h" || a === "--help") o.help = true;
    else if (/^https?:\/\//.test(a)) o.url = a.replace(/\/+$/, "");
    else throw new Error(`unknown argument: ${a}`);
  }
  return o;
}

/** playwright-core from the project, else playwright from the global npm install (CommonJS require). */
async function loadPlaywright() {
  try {
    return await import("playwright-core");
  } catch {
    // fall through
  }
  const local = createRequire(path.join(projectDir, "package.json"));
  for (const name of ["playwright-core", "playwright"]) {
    try {
      return local(name);
    } catch {
      // fall through
    }
  }
  try {
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    const globalRequire = createRequire(path.join(root, "noop.js"));
    for (const name of ["playwright", "playwright-core"]) {
      try {
        return globalRequire(path.join(root, name));
      } catch {
        // fall through
      }
    }
  } catch {
    // fall through
  }
  console.error("Playwright not found: run `npm i -D playwright-core` in the project, or `npm i -g playwright`.");
  process.exit(2);
}

/** GPU flags as in the 3d-studio skill's capture.mjs: real GPU by default, SwiftShader on request. */
function gpuArgs(software) {
  if (software) return ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
  const args = ["--ignore-gpu-blocklist", "--enable-gpu-rasterization"];
  if (process.platform === "win32") args.push("--use-angle=d3d11");
  return args;
}

async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function startPreview() {
  if (!existsSync(path.join(projectDir, "dist", "client", "index.html"))) {
    console.error("dist/client/index.html is missing: run `npm run build` first, or pass the URL of a running server.");
    process.exit(2);
  }
  const port = 4391;
  const url = `http://127.0.0.1:${port}`;
  const server = spawn(
    process.execPath,
    [path.join(projectDir, "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    // Keep stdin open: Vite's CLI exits when its stdin closes.
    { cwd: projectDir, stdio: ["pipe", "ignore", "inherit"], windowsHide: true },
  );
  for (let i = 0; i < 80; i++) {
    if (await reachable(url)) return { url, stop: () => server.kill() };
    await new Promise((r) => setTimeout(r, 250));
  }
  server.kill();
  console.error(`vite preview did not answer on ${url}.`);
  process.exit(2);
}

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] * 10) / 10;
};

async function main() {
  let o;
  try {
    o = parse(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  if (o.help) {
    console.log(
      "usage: node scripts/capture-model.mjs [url] [--shots hero,networks] [--sample tiles] [--size 2400x1350] [--quality 0.9] [--png] [--out src/assets] [--browser chrome|msedge|path] [--software] [--timeout ms]",
    );
    return;
  }
  const size = o.size.match(/^(\d+)x(\d+)$/);
  const shots = o.shots.split(",").map((s) => s.trim()).filter(Boolean);
  if (!size || !shots.every((s) => s === "hero" || s === "networks")) {
    console.error("bad --size or --shots (use e.g. --size 2400x1350 --shots hero,networks)");
    process.exit(2);
  }
  const viewport = { width: Number(size[1]), height: Number(size[2]) };
  // Linux without a GPU device (CI, containers): Chrome has no automatic software fallback any more.
  const software = o.software || (process.platform === "linux" && !existsSync("/dev/dri"));

  const server = o.url ? { url: o.url, stop: () => {} } : await startPreview();
  if (o.url && !(await reachable(o.url))) {
    console.error(`server not reachable at ${o.url}: start it first (e.g. npx vite --port 5401), or omit the URL to use vite preview.`);
    process.exit(2);
  }

  const { chromium } = await loadPlaywright();
  const launch = { headless: true, args: gpuArgs(software) };
  if (!o.browser || o.browser === "chrome" || o.browser === "msedge") launch.channel = o.browser ?? "chrome";
  else launch.executablePath = o.browser;
  let browser;
  try {
    browser = await chromium.launch(launch);
  } catch (error) {
    server.stop();
    console.error(`could not start the browser (${launch.channel ?? launch.executablePath}): ${error.message.split("\n")[0]}`);
    console.error("install Google Chrome, or pass --browser msedge / --browser <path to chrome>");
    process.exit(2);
  }

  const outDir = path.resolve(projectDir, o.out);
  mkdirSync(outDir, { recursive: true });
  const summary = { url: server.url, size: o.size, software, gpu: null, files: [], frames: {}, console: [], errors: [] };
  try {
    for (const shot of shots) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        const text = m.text();
        if (/GPU stall due to ReadPixels|THREE\.Clock|X4122/.test(text)) return;
        summary.console.push(`${shot}: ${text.split("\n")[0]}`);
      });
      page.on("pageerror", (e) => summary.console.push(`${shot}: pageerror: ${e.message}`));
      const target = `${server.url}/?capture=${shot}#/check?sample=${encodeURIComponent(o.sample)}`;
      const started = Date.now();
      await page.goto(target, { waitUntil: "load", timeout: o.timeout });
      // The review step: start the check, then open its results (the viewer lives there).
      const check = page.locator("main");
      await check.getByRole("button", { name: CHECK_START }).click({ timeout: o.timeout });
      await check.getByRole("button", { name: CHECK_RESULTS }).click({ timeout: o.timeout });
      await page.waitForFunction(
        (name) => window.__APP__?.ready === true && window.__APP__?.shot === name,
        shot,
        { timeout: o.timeout, polling: 250 },
      );
      const readyMs = Date.now() - started;
      // A few more frames for shadows and the ambient-occlusion buffers to settle.
      const count = await page.evaluate(() => window.__APP__.frameTimes.length);
      await page.waitForFunction((n) => window.__APP__.frameTimes.length >= Math.min(n + 4, 600) || window.__APP__.frameTimes.length >= 600, count, {
        timeout: o.timeout,
      });
      await page.evaluate(() => document.fonts.ready);
      const app = await page.evaluate(() => ({
        gpu: window.__APP__.gpu,
        view: window.__APP__.view,
        systems: window.__APP__.systems,
        layers: window.__APP__.layers,
        triangles: window.__APP__.triangles,
        drawCalls: window.__APP__.drawCalls,
        frameTimes: window.__APP__.frameTimes.slice(-8),
      }));
      summary.gpu ??= app.gpu;
      if (shot === "networks" && !app.systems) {
        // A services image without services would mislead: keep the previous file.
        summary.errors.push("networks: the sample has no building-services systems (facts.systems is empty); image not written");
        await page.close();
        continue;
      }
      // Stop the continuous loop so the screenshot does not wait on a slow frame (the canvas keeps its image).
      await page.evaluate(() => window.__APP__.freeze?.());
      await page.waitForTimeout(300);
      const png = await page.screenshot({ type: "png", timeout: o.timeout });
      const webp = await page.evaluate(
        async ({ data, quality }) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          canvas.getContext("2d").drawImage(image, 0, 0);
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
          if (!blob || blob.type !== "image/webp") throw new Error("this browser cannot encode WebP");
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = "";
          for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return btoa(binary);
        },
        { data: png.toString("base64"), quality: o.quality },
      );
      const file = path.join(outDir, `model-${shot}.webp`);
      writeFileSync(file, Buffer.from(webp, "base64"));
      summary.files.push(path.relative(projectDir, file));
      if (o.png) {
        const pngFile = path.join(outDir, `model-${shot}.png`);
        writeFileSync(pngFile, png);
        summary.files.push(path.relative(projectDir, pngFile));
      }
      summary.frames[shot] = {
        readyMs,
        view: app.view,
        systems: app.systems,
        layers: app.layers?.map((l) => l.kind) ?? [],
        triangles: app.triangles,
        drawCalls: app.drawCalls,
        frameMsP50: percentile(app.frameTimes, 0.5),
        frameMsMax: percentile(app.frameTimes, 1),
      };
      await page.close();
    }
  } catch (error) {
    summary.errors.push(error.message.split("\n")[0]);
  } finally {
    await browser.close();
    server.stop();
  }
  console.log(JSON.stringify(summary));
  if (software) console.error(`note: software renderer (${summary.gpu}): frame times are not representative of a real GPU`);
  for (const e of summary.errors) console.error(`error: ${e}`);
  for (const c of summary.console) console.error(`console ${c}`);
  process.exit(summary.errors.length || summary.console.length ? 1 : 0);
}

main();
