// End-to-end check of the main flows in a real browser.
// Run: npm run test:e2e   (set CHROME_PATH to use another Chrome/Chromium binary, E2E_PORT for another port)
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
const fixtureDirectory = path.join(projectDirectory, "test-fixtures", "ifc");
const testPort = process.env.E2E_PORT ?? "4287";
const baseUrl = `http://127.0.0.1:${testPort}`;
const chromePath =
  process.env.CHROME_PATH ??
  (process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "/opt/pw-browsers/chromium");

/* Without a GPU (containers, CI) the 3D viewer renders in software and can hold the page's main thread for
   a minute while it warms up, so steps that wait on it get a long timeout. */
const SLOW = 240_000;

/* The check is a three-step wizard (src/screens/Check.tsx, copy.web.wizard). */
const WIZARD = {
  projectTitle: "بيانات المشروع",
  planTitle: "ملف المخطط",
  reviewTitle: "المراجعة وبدء الفحص",
  running: "جارٍ قراءة الملف وقياس العناصر ومقارنتها بالاشتراطات.",
  errorTitle: "تعذر إكمال الفحص.",
  next: "التالي",
  start: "بدء الفحص",
  results: "عرض النتائج",
  change: "تغيير الملف",
};

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

/* Vite exits at once when the port is taken; then the page on that port belongs to something else. */
let serverExit;
server.on("exit", (code) => {
  serverExit = code;
});

const waitForServer = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    // Wait first, so a port conflict has stopped Vite before anything answers on the port.
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (serverExit !== undefined) {
      throw new Error(`The Vite development server stopped (exit code ${serverExit}). Is port ${testPort} free? Set E2E_PORT.`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
  }
  throw new Error("Timed out waiting for the Vite development server.");
};

const shot = (page, name) =>
  page.screenshot({ path: path.join(artifactDirectory, `${name}.png`), fullPage: false });

const expectText = async (page, text, context) => {
  try {
    await page.waitForFunction((value) => document.body.innerText.includes(value), text, { timeout: 120_000 });
  } catch {
    const body = (await page.locator("body").innerText()).slice(0, 400).replace(/\s+/g, " ");
    throw new Error(`${context}: expected the page to show «${text}». Page starts with: ${body}`);
  }
};

const expectHeading = async (page, name, context) => {
  try {
    await page.locator("main").getByRole("heading", { name }).waitFor({ timeout: 120_000 });
  } catch {
    const body = (await page.locator("main").innerText()).slice(0, 400).replace(/\s+/g, " ");
    throw new Error(`${context}: expected the heading «${name}». The page shows: ${body}`);
  }
};

const ensureUsableCanvas = async (page, context) => {
  const canvas = page.locator("canvas").first();
  await canvas.waitFor({ state: "visible", timeout: SLOW });
  await page.waitForTimeout(1_200);
  const box = await canvas.boundingBox({ timeout: SLOW });
  if (!box || box.width < 300 || box.height < 280) {
    throw new Error(`${context}: 3D canvas is not usable: ${JSON.stringify(box)}.`);
  }
  return { width: Math.round(box.width), height: Math.round(box.height) };
};

const ensureNoHorizontalScroll = async (page, name) => {
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  if (widths.scrollWidth > widths.viewportWidth + 1) {
    throw new Error(`${name} overflows horizontally (${widths.scrollWidth}px > ${widths.viewportWidth}px).`);
  }
  await page.screenshot({ path: path.join(artifactDirectory, `${name}.png`), fullPage: true });
};

/** The review step is open and nothing runs on its own: the check starts only from «بدء الفحص». */
const expectReview = async (page, context) => {
  await expectHeading(page, WIZARD.reviewTitle, context);
  await page.waitForTimeout(800);
  const started = await page.locator("main").getByRole("heading", { name: WIZARD.running }).count();
  if (started || !/#\/check/.test(page.url())) {
    throw new Error(`${context}: the check started without «${WIZARD.start}».`);
  }
};

/** From the review step: start the check, wait for its summary and open the results. */
const startAndOpenResults = async (page, context) => {
  const main = page.locator("main");
  await main.getByRole("button", { name: WIZARD.start }).click();
  const results = main.getByRole("button", { name: WIZARD.results });
  try {
    await results.waitFor({ timeout: 120_000 });
  } catch {
    const body = (await main.innerText()).slice(0, 400).replace(/\s+/g, " ");
    throw new Error(`${context}: the check did not finish. The panel shows: ${body}`);
  }
  await results.click();
  await page.waitForURL(/#\/results/, { timeout: 60_000 });
};

/** A sample link opens the review step with that sample chosen; the check runs after «بدء الفحص». */
const runSample = async (page, sampleId) => {
  await page.goto(`${baseUrl}/#/check?sample=${sampleId}`, { waitUntil: "domcontentloaded" });
  await expectReview(page, `Sample ${sampleId}`);
  await startAndOpenResults(page, `Sample ${sampleId}`);
};

/** A fresh check up to step 2 (project data keeps its defaults). */
const openPlanStep = async (page, context) => {
  await page.goto(`${baseUrl}/#/check`, { waitUntil: "networkidle" });
  await expectHeading(page, WIZARD.projectTitle, context);
  await page.locator("main").getByRole("button", { name: WIZARD.next }).click();
  await expectHeading(page, WIZARD.planTitle, context);
};

const summary = {};
const runtimeErrors = [];
let browser;

try {
  await waitForServer();
  browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(SLOW);
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  // 1. Landing: hero, sections the header links to, footer.
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("main h1").first().waitFor();
  for (const id of ["home-how", "home-model", "home-clauses", "home-twin"]) {
    if ((await page.locator(`#${id}`).count()) !== 1) throw new Error(`Landing is missing section #${id}.`);
  }
  if ((await page.locator("footer").count()) !== 1) throw new Error("Site footer is missing.");
  await shot(page, "01-landing");

  // 2. The hero's «بدء الفحص» opens the wizard; a sample link (the tiles sample) opens its review step;
  //    start, then the results with the real model.
  await page.locator('main a[href="#/check"]').first().click();
  await page.waitForURL(/#\/check/);
  await page.goto(`${baseUrl}/#/check?sample=tiles`, { waitUntil: "domcontentloaded" });
  await expectReview(page, "Landing sample link");
  await shot(page, "02-check-review");
  await startAndOpenResults(page, "Tiles sample");
  await expectText(page, "11 من 14", "Tiles sample scope");
  await expectText(page, "4.5.2", "Tiles sample failing clause");
  summary.tilesCanvas = await ensureUsableCanvas(page, "Tiles results");
  await shot(page, "03-results-tiles");

  // 3. Report and back.
  await page.getByRole("button", { name: /التقرير/ }).first().click();
  await page.waitForURL(/#\/report/);
  await expectText(page, "تقرير الفحص", "Report");
  await shot(page, "04-report");
  await page.goBack();
  await page.waitForURL(/#\/results/);

  // 4. Drainage sample: clause 4.1.3 is measured from the file's networks and fails.
  await runSample(page, "drain");
  await expectText(page, "4.1.3", "Drainage sample");
  await expectText(page, "11 من 14", "Drainage sample scope");
  summary.drainCanvas = await ensureUsableCanvas(page, "Drainage results");
  await shot(page, "05-results-drain");

  // 5. All three steps with an uploaded file: an older MOWAEM contract file still runs and shows the
  //    illustrative scene. Step 2 refuses a file that is not IFC before anything runs.
  await openPlanStep(page, "Contract file");
  const check = page.locator("main");
  const next = check.getByRole("button", { name: WIZARD.next });
  if (await next.isEnabled()) throw new Error("Step 2: «التالي» is enabled before a file or sample is chosen.");
  const fileInput = check.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(fixtureDirectory, "invalid", "invalid-envelope.ifc"));
  await expectText(page, "تعذرت قراءة الملف", "Step 2 inline file error");
  await fileInput.setInputFiles(path.join(fixtureDirectory, "restaurant", "submission-v1.ifc"));
  await check.getByRole("radio", { name: "submission-v1.ifc" }).waitFor();
  await shot(page, "06-check-file");
  await next.click();
  await expectReview(page, "Contract file");
  await startAndOpenResults(page, "Contract file");
  await expectText(page, "مشهد توضيحي", "Contract file scene label");
  summary.contractCanvas = await ensureUsableCanvas(page, "Contract results");
  await shot(page, "07-results-contract");

  // 6. A file the engine rejects stops in the panel, with a way back to step 2.
  await openPlanStep(page, "Rejected file");
  await check.locator('input[type="file"]').setInputFiles(path.join(fixtureDirectory, "invalid", "unsupported-schema.ifc"));
  await check.getByRole("radio", { name: "unsupported-schema.ifc" }).waitFor();
  await check.getByRole("button", { name: WIZARD.next }).click();
  await expectReview(page, "Rejected file");
  await check.getByRole("button", { name: WIZARD.start }).click();
  await expectHeading(page, WIZARD.errorTitle, "Rejected file");
  await shot(page, "08-check-error");
  await check.getByRole("button", { name: WIZARD.change }).click();
  await expectHeading(page, WIZARD.planTitle, "Back to step 2 after an error");

  // 7. Digital twin studio opens and returns inside the site.
  await page.goto(`${baseUrl}/#/twin`, { waitUntil: "domcontentloaded" });
  await expectText(page, "التوأم الرقمي", "Twin studio");
  summary.twinCanvas = await ensureUsableCanvas(page, "Twin studio");
  await shot(page, "09-twin");
  await page.getByRole("button", { name: "العودة" }).first().click();
  await page.waitForFunction(() => !location.hash.startsWith("#/twin"));

  // 8. Phone width: no horizontal scroll on the landing and on each step of the check.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  phone.setDefaultTimeout(SLOW);
  phone.on("pageerror", (error) => runtimeErrors.push(`phone: ${error.message}`));
  await phone.goto(`${baseUrl}/#/`, { waitUntil: "networkidle" });
  await ensureNoHorizontalScroll(phone, "10-phone-landing");
  await openPlanStep(phone, "Phone check");
  await ensureNoHorizontalScroll(phone, "11-phone-check-plan");
  await phone.locator("main").getByText("مطعم بمغسلة غير موصولة بالصرف").click();
  await phone.locator("main").getByRole("button", { name: WIZARD.next }).click();
  await expectReview(phone, "Phone check");
  await ensureNoHorizontalScroll(phone, "12-phone-check-review");

  if (runtimeErrors.length) throw new Error(`Browser runtime errors:\n${runtimeErrors.join("\n")}`);
  process.stdout.write(`${JSON.stringify({ ok: true, ...summary }, null, 2)}\n`);
} finally {
  await browser?.close();
  server.stdin?.end();
  server.kill();
}
