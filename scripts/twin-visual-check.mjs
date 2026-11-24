/**
 * Browser acceptance check and screenshots for the digital twin studio (#/twin).
 *
 * For a desktop (1440 x 900) and a phone (390 x 844) it opens the studio directly, then for each scene
 * (المقهى، المطعم، العمارة) opens each panel tab (الأنظمة، المساحات، الملفات، التحليلات), checks its
 * content, picks an element from a demo IFC file and checks it reaches the selection. On the phone it
 * also checks the bottom sheet: folded and drawn folded after a pick (the scene usable above it), opened
 * by its handle, folded by Escape. It checks the keyboard tabs, the panel's hide and show focus, leaving
 * by Escape or «العودة», and fails on any console error or page error. A portrait tablet (834 x 1112)
 * gets the scene screenshots only.
 *
 * Usage: `npm run build && node scripts/twin-visual-check.mjs` serves dist/client with `vite preview`.
 * TWIN_URL=http://127.0.0.1:5861 checks a running server instead (e.g. `npx vite --port 5861`).
 * TWIN_SHOTS sets the screenshot folder (default artifacts/digital-twin), CHROME_PATH the browser.
 *
 * The scene renders in software (SwiftShader) on machines without a GPU, often at one or two frames a
 * second, so every wait is long. Screenshots are visual evidence only: they do not certify engineering
 * accuracy.
 */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const target = process.env.TWIN_SHOTS || join(root, "artifacts", "digital-twin");
const port = Number(process.env.TWIN_PORT || 4174);
/** One wait (an element, a camera flight, a file read) on a slow software-rendered page. */
const SLOW = Number(process.env.TWIN_TIMEOUT || 150000);
const chrome = process.env.CHROME_PATH || "/usr/bin/google-chrome";

const SCENES = [
  { key: "cafe", label: "المقهى", title: "مقهى", sign: "مقهى" },
  { key: "restaurant", label: "المطعم", title: "مطعم", sign: "مطعم" },
  { key: "building", label: "العمارة" },
];
const TABS = [
  { key: "systems", label: "الأنظمة" },
  { key: "spaces", label: "المساحات" },
  { key: "files", label: "الملفات" },
  { key: "analysis", label: "التحليلات" },
];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844, touch: true },
  { name: "tablet", width: 834, height: 1112, touch: true, shotsOnly: true },
];

const failures = [];
let server;
let browser;

async function serve() {
  if (process.env.TWIN_URL) return process.env.TWIN_URL.replace(/\/$/, "");
  if (!existsSync(join(root, "dist", "client", "index.html")))
    throw new Error("dist/client is missing: run `npm run build` first, or set TWIN_URL to a running server.");
  const base = `http://127.0.0.1:${port}`;
  let log = "";
  server = spawn(process.execPath, [join("node_modules", "vite", "bin", "vite.js"), "preview",
    "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", data => { log += String(data); });
  server.stderr?.on("data", data => { log += String(data); });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(base)).ok) return base;
    } catch { /* still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("preview server unavailable: " + log.slice(-800));
}

/** A step of one viewport: a failure is recorded and the check goes on with the next step. */
function checker(viewport) {
  const fail = message => {
    failures.push(viewport + ": " + message);
    console.log("  FAIL " + message);
  };
  return {
    fail,
    expect(condition, message) {
      if (!condition) fail(message);
      return Boolean(condition);
    },
    async step(name, run) {
      const started = Date.now();
      try {
        await run();
        console.log(`  ok   ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
      } catch (error) {
        fail(name + ": " + String(error?.message || error).split("\n")[0]);
      }
    },
  };
}

/** Waits for a condition evaluated in the page, polling on a timer (frames are slow). */
async function until(page, fn, arg, timeout = SLOW) {
  await page.waitForFunction(fn, arg, { timeout, polling: 200 });
}

/** Waits until the camera has finished its flight (the rigs mark the canvas), then one more frame. */
async function settle(page) {
  await page.locator('[data-testid="twin-canvas"] canvas[data-camera="still"]').waitFor({ timeout: SLOW });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function shoot(page, name) {
  await settle(page);
  await page.screenshot({ path: join(target, name + ".png"), animations: "disabled", caret: "hide" });
  console.log("  shot " + join(target, name + ".png"));
}

/** Where the phone's sheet is drawn, and what a tap on the middle of the scene above it would reach. */
function sheetState(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-testid="twin-panel"]');
    const body = document.querySelector('[data-testid="twin-panel-body"]');
    const peek = panel.querySelector(".tw-panel__peek");
    const stage = document.querySelector(".tw-body").getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const hit = document.elementFromPoint(stage.left + stage.width / 2, stage.top + (stage.height - peek.offsetHeight) / 2);
    return {
      open: panel.classList.contains("is-sheet-open"),
      inert: body.inert,
      top: Math.round(box.top),
      foldedTop: Math.round(stage.bottom - peek.offsetHeight),
      stageTop: Math.round(stage.top),
      stageHeight: Math.round(stage.height),
      sceneReachable: Boolean(hit?.closest('[data-testid="twin-canvas"]')),
    };
  });
}

async function expectFolded(page, t, when) {
  /* The state changes first; the sheet must be drawn folded with it, not seconds later. */
  await until(page, () => !document.querySelector('[data-testid="twin-panel"]').classList.contains("is-sheet-open"), null);
  const sheet = await sheetState(page);
  t.expect(sheet.inert, `${when}: the folded sheet's list is not inert`);
  t.expect(Math.abs(sheet.top - sheet.foldedTop) <= 3,
    `${when}: the sheet says folded but is drawn at top=${sheet.top} (folded is ${sheet.foldedTop})`);
  t.expect(sheet.sceneReachable, `${when}: the scene above the folded sheet does not receive taps`);
}

async function expectOpen(page, t, when) {
  await until(page, () => document.querySelector('[data-testid="twin-panel"]').classList.contains("is-sheet-open"), null);
  const sheet = await sheetState(page);
  t.expect(!sheet.inert, `${when}: the open sheet's list is inert`);
  t.expect(sheet.top < sheet.stageTop + sheet.stageHeight / 2, `${when}: the sheet says open but is drawn at top=${sheet.top}`);
}

async function checkViewport(base, viewport) {
  const t = checker(viewport.name);
  const phone = viewport.name === "phone";
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1,
    ...(viewport.touch ? { hasTouch: true, isMobile: true } : {}),
  });
  page.setDefaultTimeout(SLOW);
  const errors = [];
  page.on("console", message => { if (message.type() === "error") errors.push("console: " + message.text()); });
  page.on("pageerror", error => errors.push("page: " + error.message));
  /* Taps on the phone, clicks elsewhere. */
  const press = locator => phone ? locator.tap() : locator.click();
  const panelBody = page.locator('[data-testid="twin-panel-body"]');
  const selection = page.locator('[data-testid="twin-selection"]');
  console.log(`${viewport.name} ${viewport.width}x${viewport.height}`);

  await t.step("open #/twin", async () => {
    await page.goto(base + "/#/twin", { waitUntil: "load", timeout: SLOW });
    await page.locator('[data-testid="twin-studio"]').waitFor({ timeout: SLOW });
    await page.locator('[data-testid="twin-canvas"] canvas').waitFor({ state: "visible", timeout: SLOW });
    await settle(page);
  });

  if (viewport.shotsOnly) {
    for (const scene of SCENES) {
      await t.step("screenshot " + scene.key, async () => {
        const button = page.locator(`[data-testid="venue-scene-switcher"] [data-scene="${scene.key}"]`);
        if (await button.getAttribute("aria-pressed") !== "true") await press(button);
        await shoot(page, `${viewport.name}-${scene.key}`);
      });
    }
  } else {
    await t.step("studio on entry", async () => {
      t.expect((await page.locator("h1").first().textContent())?.trim() === "استوديو التوأم الرقمي", "studio title missing");
      await until(page, () => document.activeElement?.matches("h1"), null, 20000)
        .catch(() => t.fail("focus did not move to the studio's title"));
      const scenes = page.locator('[data-testid="venue-scene-switcher"] button');
      t.expect(JSON.stringify(await scenes.allTextContents()) === JSON.stringify(SCENES.map(s => s.label)),
        "scene switcher is not المقهى / المطعم / العمارة");
      t.expect(await scenes.first().getAttribute("aria-pressed") === "true", "the cafe is not the first scene");
      const tabs = page.getByRole("tab");
      t.expect(JSON.stringify(await tabs.allTextContents()) === JSON.stringify(TABS.map(x => x.label)),
        "panel tabs are not الأنظمة / المساحات / الملفات / التحليلات");
      t.expect(await page.locator('[data-testid="twin-tab-systems"]').getAttribute("aria-selected") === "true",
        "الأنظمة is not the first tab");
      if (phone) await expectFolded(page, t, "on entry");
    });

    if (!phone) {
      await t.step("tabs follow the arrow keys (right to left)", async () => {
        await page.locator('[data-testid="twin-tab-systems"]').focus();
        const selected = () => page.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]')?.dataset.testid);
        const focused = () => page.evaluate(() => document.activeElement?.dataset?.testid);
        await page.keyboard.press("ArrowLeft");
        t.expect(await selected() === "twin-tab-spaces" && await focused() === "twin-tab-spaces", "ArrowLeft did not move to المساحات");
        await page.keyboard.press("End");
        t.expect(await selected() === "twin-tab-analysis", "End did not move to التحليلات");
        await page.keyboard.press("ArrowLeft");
        t.expect(await selected() === "twin-tab-systems", "ArrowLeft did not wrap to الأنظمة");
        await page.keyboard.press("ArrowRight");
        t.expect(await selected() === "twin-tab-analysis", "ArrowRight did not wrap to التحليلات");
        await page.keyboard.press("Home");
        t.expect(await selected() === "twin-tab-systems" && await focused() === "twin-tab-systems", "Home did not return to الأنظمة");
      });
      await t.step("panel hides and comes back, with focus", async () => {
        await page.locator('[data-testid="twin-panel-hide"]').click();
        await page.locator('[data-testid="twin-panel-show"]').waitFor();
        t.expect(await page.locator('[data-testid="twin-panel"]').isHidden(), "panel still shown after «إخفاء اللوحة»");
        await until(page, () => document.activeElement?.dataset?.testid === "twin-panel-show", null, 20000)
          .catch(() => t.fail("focus did not move to «عرض اللوحة»"));
        await page.locator('[data-testid="twin-panel-show"]').click();
        await page.locator('[data-testid="twin-panel"]').waitFor({ state: "visible" });
        await until(page, () => document.activeElement?.dataset?.testid === "twin-panel-hide", null, 20000)
          .catch(() => t.fail("focus did not return to «إخفاء اللوحة»"));
      });
    }

    for (const scene of SCENES) {
      const venue = scene.key !== "building";
      const openTab = async key => {
        const tab = page.locator(`[data-testid="twin-tab-${key}"]`);
        await press(tab);
        await until(page, k => document.querySelector(`[data-testid="twin-tab-${k}"]`)?.getAttribute("aria-selected") === "true", key);
        if (phone) await expectOpen(page, t, `tab ${key} in ${scene.key}`);
      };

      await t.step(`${scene.key}: open the scene`, async () => {
        const button = page.locator(`[data-testid="venue-scene-switcher"] [data-scene="${scene.key}"]`);
        if (await button.getAttribute("aria-pressed") !== "true") await press(button);
        await until(page, k => document.querySelector(`[data-scene="${k}"]`)?.getAttribute("aria-pressed") === "true", scene.key);
        const title = (await page.locator('[data-testid="twin-scene-title"]').textContent()) ?? "";
        if (venue) {
          t.expect(title.includes(scene.title), `${scene.key}: panel title «${title}» does not name the ${scene.key}`);
          t.expect(!title.includes("موائم"), `${scene.key}: the demo venue carries the product's name («${title}»)`);
          const sign = (await page.locator(".venue-sign").first().textContent())?.trim();
          t.expect(sign === scene.sign, `${scene.key}: the shop sign reads «${sign}», expected «${scene.sign}»`);
        } else {
          t.expect((await page.locator(".tw-panel__kicker").textContent())?.includes("عمارة توضيحية"),
            "building: the panel does not introduce the illustrative building");
        }
        await shoot(page, `${viewport.name}-${scene.key}`);
      });

      await t.step(`${scene.key}: الأنظمة`, async () => {
        await openTab("systems");
        const rows = page.locator('[data-testid="network-visibility-summary"] button');
        t.expect(await rows.count() === 8, `${scene.key}: expected 8 rows in الأنظمة`);
        t.expect(await page.locator('[data-system="all"]').getAttribute("aria-pressed") === "true", `${scene.key}: جميع الأنظمة not chosen`);
        t.expect(await page.locator('[data-network-visible="true"]').count() === 7, `${scene.key}: not all six networks shown`);
        await press(page.locator('[data-system="water"]'));
        await until(page, () => document.querySelector('[data-system="water"]')?.getAttribute("aria-pressed") === "true", null);
        t.expect(await page.locator('[data-network-visible="true"]').count() === 1, `${scene.key}: water alone is not isolated`);
        if (phone) {
          await expectFolded(page, t, `${scene.key}: after choosing المياه`);
          await openTab("systems");
        }
        await press(page.locator('[data-system="all"]'));
        await until(page, () => document.querySelectorAll('[data-network-visible="true"]').length === 7, null);
        if (phone) await expectFolded(page, t, `${scene.key}: after choosing جميع الأنظمة`);
      });

      await t.step(`${scene.key}: المساحات`, async () => {
        await openTab("spaces");
        if (venue) {
          t.expect(await page.locator('[data-testid="venue-room-filters"] .tw-row').count() === 4, `${scene.key}: expected 4 venue areas`);
        } else {
          t.expect(await page.locator('[data-testid="twin-floors"] .tw-row').count() === 7, "building: expected the whole building, 5 floors and the roof");
          t.expect(await page.locator('[data-testid="twin-room-filters"] .tw-chip').count() > 1, "building: no room filters");
          t.expect(await page.locator('[data-testid="twin-inventory"] .tw-row').count() > 0, "building: no furniture list");
        }
      });

      await t.step(`${scene.key}: التحليلات`, async () => {
        await openTab("analysis");
        if (venue) {
          const analysis = page.locator(`[data-testid="venue-analysis-${scene.key}"]`);
          await analysis.waitFor();
          t.expect(await analysis.locator(".venue-analysis__systems article").count() === 6, `${scene.key}: expected 6 systems in التحليلات`);
          const stats = (await analysis.locator(".venue-analysis__stats").textContent()) ?? "";
          t.expect(stats.includes("عنصرًا مفهرسًا") && stats.includes("نقطة تمديدات"),
            `${scene.key}: counted nouns in the stats read «${stats.replace(/\s+/g, " ")}»`);
        } else {
          t.expect(await page.locator('[data-testid="twin-detail-points"] .tw-row').count() > 0, "building: no service points in التحليلات");
        }
      });

      await t.step(`${scene.key}: الملفات, pick an element`, async () => {
        await openTab("files");
        const library = page.locator(venue ? `[data-testid="venue-bim-${scene.key}"]` : '[data-testid="bim-demo-library"]');
        await library.locator('[data-file="MEP.ifc"]').waitFor();
        t.expect(await library.locator('[data-file$=".ifc"]').count() === 4, `${scene.key}: expected 4 IFC files`);
        await press(library.locator('[data-file="MEP.ifc"] [data-testid="bim-file-open"]'));
        const list = page.locator(venue ? '[data-testid="venue-bim-elements"]' : '[data-testid="bim-file-elements"]');
        await list.waitFor({ state: "attached" });
        let picked;
        if (venue) {
          t.expect((await list.locator("header b").textContent())?.trim() === "15 عنصرًا", `${scene.key}: MEP.ifc does not list 15 عنصرًا`);
          picked = `VENUE-${scene.key}-electricity-0`;
          await press(list.locator(`[data-scene-id="${picked}"]`));
        } else {
          /* Opening a building file picks its first element. */
          picked = await list.locator("[data-scene-id]").first().getAttribute("data-scene-id");
        }
        await until(page, id => document.querySelector('[data-testid="twin-selection"] code')?.textContent === id, picked);
        t.expect(await selection.locator("h3").isVisible(), `${scene.key}: the picked element's name is not shown`);
        if (phone) await expectFolded(page, t, `${scene.key}: after picking ${picked}`);
        await shoot(page, `${viewport.name}-${scene.key}-selected`);
      });

      if (phone) {
        await t.step(`${scene.key}: the sheet's handle and Escape`, async () => {
          await press(page.locator('[data-testid="twin-sheet-handle"]'));
          await expectOpen(page, t, `${scene.key}: handle tapped`);
          await page.keyboard.press("Escape");
          await expectFolded(page, t, `${scene.key}: Escape`);
          t.expect(await page.locator('[data-testid="twin-studio"]').count() === 1, `${scene.key}: Escape over the open sheet left the studio`);
        });
      }

      await t.step(`${scene.key}: clear the selection`, async () => {
        await press(selection.getByRole("button", { name: "مسح التحديد" }));
        await selection.waitFor({ state: "detached" });
      });
    }

    await t.step("text and layout", async () => {
      const measured = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        width: window.innerWidth,
        indicDigits: /[٠-٩۰-۹]/.test(document.querySelector('[data-testid="twin-studio"]')?.textContent ?? ""),
      }));
      t.expect(measured.scrollWidth <= measured.width + 1, "horizontal overflow: " + measured.scrollWidth);
      t.expect(!measured.indicDigits, "Arabic-Indic digits in the studio (the site writes 0-9)");
    });

    await t.step(phone ? "«العودة» leaves the studio" : "Escape leaves the studio", async () => {
      if (phone) await press(page.locator('[data-testid="twin-close"]'));
      else await page.keyboard.press("Escape");
      await page.locator('[data-testid="twin-studio"]').waitFor({ state: "detached" });
      t.expect(!(await page.evaluate(() => location.hash)).startsWith("#/twin"), "the address still points to the studio");
    });
  }

  for (const error of errors) t.fail(error);
  await page.close();
}

try {
  await mkdir(target, { recursive: true });
  const base = await serve();
  if (!existsSync(chrome)) throw new Error(`no browser at ${chrome}: set CHROME_PATH`);
  browser = await chromium.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--ignore-gpu-blocklist", "--enable-webgl",
      "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  for (const viewport of VIEWPORTS) await checkViewport(base, viewport);
} catch (error) {
  failures.push("setup: " + (error?.message || error));
} finally {
  await browser?.close();
  server?.kill();
}
if (failures.length) {
  console.error("\nTwin visual check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("\nTwin visual check passed; screenshots in " + target);
