// End-to-end check of the main flows in a real browser.
// Run: npm run test:e2e   (set CHROME_PATH to use another Chrome/Chromium binary)
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const artifactDirectory = path.join(projectDirectory, "artifacts", "e2e");
const testPort = process.env.E2E_PORT ?? "4287";
const baseUrl = `http://127.0.0.1:${testPort}`;
const chromePath =
  process.env.CHROME_PATH ??
  (process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "/opt/pw-browsers/chromium");

if (!existsSync(chromePath)) {
  throw new Error(`No browser at ${chromePath}. Set CHROME_PATH to a Chrome or Chromium binary.`);
}

await mkdir(artifactDirectory, { recursive: true });

const server = spawn(
  process.execPath,
  [
    path.join(projectDirectory, "node_modules", "vite", "bin", "vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    testPort,
    "--strictPort",
    "--configLoader",
    "runner",
  ],
  {
    cwd: projectDirectory,
    windowsHide: true,
    // Keep stdin open. Vite's CLI shuts down when its stdin stream closes.
    stdio: ["pipe", "inherit", "inherit"],
  },
);

const waitForServer = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for the Vite development server.");
};

const shot = (page, name) =>
  page.screenshot({ path: path.join(artifactDirectory, `${name}.png`), fullPage: false });

const expectText = async (page, text, context) => {
  try {
    await page.waitForFunction((value) => document.body.innerText.includes(value), text, { timeout: 60_000 });
  } catch {
    const body = (await page.locator("body").innerText()).slice(0, 400).replace(/\s+/g, " ");
    throw new Error(`${context}: expected the page to show «${text}». Page starts with: ${body}`);
  }
};

const ensureUsableCanvas = async (page, context) => {
  const canvas = page.locator("canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(1_200);
  const box = await canvas.boundingBox();
  if (!box || box.width < 300 || box.height < 280) {
    throw new Error(`${context}: 3D canvas is not usable: ${JSON.stringify(box)}.`);
  }
  return { width: Math.round(box.width), height: Math.round(box.height) };
};

const runSample = async (page, sampleId) => {
  await page.goto(`${baseUrl}/#/check?sample=${sampleId}`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/#\/results/, { timeout: 120_000 });
};

const summary = {};
const runtimeErrors = [];
let browser;

try {
  await waitForServer();
  browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  // 1. Landing: formal header, hero, sections, footer.
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1, name: "فحص مخطط المطعم قبل طلب الترخيص" }).waitFor();
  for (const id of ["home-clauses", "home-how", "home-model", "home-twin"]) {
    if ((await page.locator(`#${id}`).count()) !== 1) throw new Error(`Landing is missing section #${id}.`);
  }
  if ((await page.locator("footer.site-footer").count()) !== 1) throw new Error("Site footer is missing.");
  await shot(page, "01-landing");

  // 2. Ready sample from the hero link: results with the real model.
  await page.getByText("جرّب مخططًا جاهزًا", { exact: true }).first().click();
  await page.waitForURL(/#\/results/, { timeout: 120_000 });
  await expectText(page, "11 من 14", "Tiles sample scope");
  await expectText(page, "4.5.2", "Tiles sample failing clause");
  summary.tilesCanvas = await ensureUsableCanvas(page, "Tiles results");
  await shot(page, "02-results-tiles");

  // 3. Report and back.
  await page.getByRole("button", { name: "عرض التقرير" }).first().click();
  await page.waitForURL(/#\/report/);
  await expectText(page, "تقرير الفحص", "Report");
  await shot(page, "03-report");
  await page.goBack();
  await page.waitForURL(/#\/results/);

  // 4. Drainage sample: clause 4.1.3 is measured from the file's networks and fails.
  await runSample(page, "drain");
  await expectText(page, "4.1.3", "Drainage sample");
  await expectText(page, "11 من 14", "Drainage sample scope");
  summary.drainCanvas = await ensureUsableCanvas(page, "Drainage results");
  await shot(page, "04-results-drain");

  // 5. An older MOWAEM contract file still runs and shows the illustrative scene.
  await page.goto(`${baseUrl}/#/check`, { waitUntil: "networkidle" });
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(projectDirectory, "test-fixtures", "ifc", "restaurant", "submission-v1.ifc"));
  await page.getByRole("button", { name: "ابدأ الفحص" }).click();
  const openResults = page.getByRole("button", { name: "عرض النتائج" });
  await openResults.waitFor({ timeout: 120_000 });
  await openResults.click();
  await page.waitForURL(/#\/results/);
  await expectText(page, "مشهد توضيحي", "Contract file scene label");
  summary.contractCanvas = await ensureUsableCanvas(page, "Contract results");
  await shot(page, "05-results-contract");

  // 6. Digital twin studio opens and returns inside the site.
  await page.goto(`${baseUrl}/#/twin`, { waitUntil: "domcontentloaded" });
  await expectText(page, "التوأم الرقمي", "Twin studio");
  summary.twinCanvas = await ensureUsableCanvas(page, "Twin studio");
  await shot(page, "06-twin");
  await page.getByRole("button", { name: "العودة" }).first().click();
  await page.waitForFunction(() => !location.hash.startsWith("#/twin"));

  // 7. Phone width: no horizontal scroll on the landing and the check page.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  phone.on("pageerror", (error) => runtimeErrors.push(`phone: ${error.message}`));
  for (const [hash, name] of [
    ["#/", "07-phone-landing"],
    ["#/check", "08-phone-check"],
  ]) {
    await phone.goto(`${baseUrl}/${hash}`, { waitUntil: "networkidle" });
    const widths = await phone.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    if (widths.scrollWidth > widths.viewportWidth + 1) {
      throw new Error(`${name} overflows horizontally (${widths.scrollWidth}px > ${widths.viewportWidth}px).`);
    }
    await phone.screenshot({ path: path.join(artifactDirectory, `${name}.png`), fullPage: true });
  }

  if (runtimeErrors.length) throw new Error(`Browser runtime errors:\n${runtimeErrors.join("\n")}`);
  process.stdout.write(`${JSON.stringify({ ok: true, ...summary }, null, 2)}\n`);
} finally {
  await browser?.close();
  server.stdin?.end();
  server.kill();
}
