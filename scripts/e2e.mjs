import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const artifactDirectory = path.join(projectDirectory, "artifacts", "e2e");
const baseUrl = "http://127.0.0.1:4173";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

await mkdir(artifactDirectory, { recursive: true });

const server = spawn(
  process.execPath,
  [
    path.join(projectDirectory, "node_modules", "vite", "bin", "vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "4173",
  ],
  {
    cwd: projectDirectory,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

const waitForServer = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
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

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--disable-gpu-sandbox", "--use-angle=swiftshader"],
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".hero h1").waitFor();
  await page.screenshot({
    path: path.join(artifactDirectory, "01-dashboard.png"),
    fullPage: true,
  });

  await page.locator(".hero .button--light").click();
  await page.getByRole("heading", { name: "عرّف مشروعك" }).waitFor();
  await page.getByRole("button", { name: /حفظ ومتابعة إلى النموذج/ }).click();
  await page.getByRole("heading", { name: "أضف النموذج الهندسي" }).waitFor();

  const samplePath = path.join(
    projectDirectory,
    "public",
    "samples",
    "restaurant-review.ifc",
  );
  await page.locator('input[type="file"]').setInputFiles(samplePath);
  await page.getByText("restaurant-review.ifc", { exact: true }).waitFor();
  await page.screenshot({
    path: path.join(artifactDirectory, "02-model-upload.png"),
    fullPage: true,
  });

  await page
    .getByRole("button", { name: /تأكيد النموذج وبدء الفحص/ })
    .click();
  await page.getByRole("heading", { name: "نتائج الفحص" }).waitFor({
    timeout: 15_000,
  });
  await page.locator("canvas").waitFor();
  await page.waitForTimeout(1_500);
  await page.screenshot({
    path: path.join(artifactDirectory, "03-workspace.png"),
    fullPage: true,
  });

  const canvasBox = await page.locator("canvas").boundingBox();
  if (!canvasBox || canvasBox.width < 300 || canvasBox.height < 300) {
    throw new Error("The interactive 3D canvas did not render at a usable size.");
  }

  await page
    .getByRole("button", { name: /إظهار العنصر في النموذج/ })
    .click();
  await page.waitForTimeout(900);
  await page.screenshot({
    path: path.join(artifactDirectory, "04-focused-issue.png"),
    fullPage: true,
  });

  await page
    .getByRole("button", { name: /تقرير الجاهزية/ })
    .first()
    .click();
  await page.getByRole("heading", { name: "تقرير جاهزية الطلب" }).waitFor();
  await page.screenshot({
    path: path.join(artifactDirectory, "05-report.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  if (dimensions.scrollWidth > dimensions.viewportWidth + 1) {
    throw new Error(
      `Mobile layout overflows horizontally (${dimensions.scrollWidth}px > ${dimensions.viewportWidth}px).`,
    );
  }
  await page.screenshot({
    path: path.join(artifactDirectory, "06-mobile-dashboard.png"),
    fullPage: true,
  });

  if (runtimeErrors.length) {
    throw new Error(`Browser runtime errors:\n${runtimeErrors.join("\n")}`);
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        screenshots: 6,
        canvas: canvasBox,
        mobile: dimensions,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server.kill();
}
