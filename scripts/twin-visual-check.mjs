/**
 * Browser acceptance/capture check for the schematic engineering studio.
 *
 * Uses the already-installed playwright-core and runner Chrome; no remote assets.
 * Captures provide visual evidence but do not certify real-world engineering accuracy.
 */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const base = "http://127.0.0.1:4174";
const target = join(process.cwd(), "artifacts", "digital-twin");
await mkdir(target, { recursive: true });
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4174", "--strictPort"], {
  cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
});
let stderr = "";
server.stderr?.on("data", data => { stderr += String(data); });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      const response = await fetch(base);
      if (response.ok) { ready = true; break; }
    } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 240));
  }
  if (!ready) throw new Error("preview server unavailable: " + stderr.slice(-800));
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const failures = [];
  const sizes = [
    { name: "desktop", width: 1920, height: 1080 },
    { name: "laptop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
  ];
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base, { waitUntil: "networkidle" });
    await page.locator(size.width <= 660
      ? '[data-testid="open-digital-twin-mobile"]'
      : '[data-testid="open-digital-twin"]').first().click();
    await page.locator(".twin-studio__canvas canvas").waitFor({ state: "visible", timeout: 25000 });
    await page.waitForTimeout(1800);
    const hasCanvas = await page.locator(".twin-studio__canvas canvas").count();
    if (!hasCanvas) failures.push(size.name + ": no 3D canvas");
    if (await page.getByText("الطاقة الشمسية", { exact: true }).count())
      failures.push(size.name + ": removed solar energy still appears");
    if (await page.locator(".twin-studio__floor-list button").count() !== 7)
      failures.push(size.name + ": five real scene levels and roof are not selectable");
    if (size.width > 1000) {
      const mep = page.locator('.bim-library__file[data-file="MEP.ifc"] button');
      await mep.click();
      await page.locator("[data-testid='bim-file-elements']").waitFor({state:"visible"});
      if (!(await page.locator(".bim-library__status").textContent())?.includes("75"))
        failures.push(size.name + ": MEP demo file not verified");
      await page.locator(".bim-library__content select").selectOption("4");
      await page.locator('[data-scene-id="DETAIL-4-electricity-2"]').click();
      await page.screenshot({path:join(target,size.name+"-ifc-5floor.png"),fullPage:false});
      await page.locator(".twin-studio__floor-list button").filter({hasText:"كامل المبنى"}).click();
      await page.locator(".twin-studio__system-list button").filter({hasText:"العمارة والإنشاء"}).click();
    }
    if (size.width <= 660) {
      await page.locator('[data-testid="mobile-bim-files"]').click();
      await page.locator(".twin-studio__inspector.is-mobile-open").waitFor({state:"visible"});
      await page.locator(".twin-studio__mobile-inspector-close").click();
    }
    if (size.width > 1000) {
      await page.locator(".twin-studio__inspector-tabs button").filter({hasText:"تفاصيل العناصر"}).click();
      if (!await page.locator(".twin-studio__inventory button").count())
        failures.push(size.name + ": no furniture inventory when item inspector is active");
      await page.locator(".twin-studio__inspector-tabs button").filter({hasText:"ملفات IFC التجريبية"}).click();
    }
    if (size.width > 660) {
      const roomFilters = page.locator(".twin-studio__room-filter button");
      if (await roomFilters.count() !== 5) failures.push(size.name + ": missing room filters");
      await roomFilters.nth(2).click();
      if (!await roomFilters.nth(2).getAttribute("aria-pressed") || await roomFilters.nth(2).getAttribute("aria-pressed") !== "true")
        failures.push(size.name + ": room filter not selected");
      await roomFilters.first().click();
    } else {
      await page.locator(".twin-studio__mobile-floors select[aria-label='الغرفة']").selectOption("hall");
      await page.locator(".twin-studio__mobile-floors select[aria-label='الدور']").selectOption("ground");
    }
    await page.waitForTimeout(750);
    await page.screenshot({ path: join(target, size.name + "-interior.png"), fullPage: false, animations: "disabled" });
    if (size.width > 660) {
      await page.locator(".twin-studio__system-list button").filter({ hasText: "كل شبكات التمديدات" }).click();
    } else {
      await page.locator(".twin-studio__system-list button").filter({ hasText: "المياه" }).click();
    }
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(target, size.name + "-services.png"), fullPage: false, animations: "disabled" });
    const measured = await page.evaluate(() => ({
      bodyWidth: document.documentElement.scrollWidth,
      screenWidth: window.innerWidth,
      studio: !!document.querySelector(".twin-studio"),
      activeSystem: document.querySelector(".twin-studio__system.is-active")?.textContent?.trim(),
    }));
    if (measured.bodyWidth > measured.screenWidth + 10) failures.push(size.name + ": horizontal overflow " + measured.bodyWidth);
    if (!measured.studio || !measured.activeSystem) failures.push(size.name + ": studio or selection missing");
    if (errors.length) failures.push(size.name + ": " + errors.join(" | "));
    await page.close();
    process.stdout.write(JSON.stringify({ ...size, ...measured, errors }) + "\n");
  }
  if (failures.length) throw new Error(failures.join("\n"));
  console.log("Visual acceptance passed; captures in " + target);
} finally {
  await browser?.close();
  server.kill();
}
