import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const artifactDirectory = path.join(projectDirectory, "artifacts", "e2e");
const testPort = "4287";
const baseUrl = `http://127.0.0.1:${testPort}`;
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

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

const ensureUsableCanvas = async (page, context) => {
  const canvas = page.locator("canvas");
  await canvas.waitFor({ state: "visible" });
  await page.waitForTimeout(1_200);

  const box = await canvas.boundingBox();
  if (!box || box.width < 300 || box.height < 300) {
    throw new Error(
      `${context} 3D canvas did not render at a usable size: ${JSON.stringify(box)}.`,
    );
  }

  return box;
};

const requireViewerControl = async (page, testId, label) => {
  const control = page.getByTestId(testId);
  if ((await control.count()) !== 1) {
    throw new Error(`Expected exactly one 3D viewer control with id "${testId}".`);
  }
  await control.waitFor({ state: "visible" });
  const accessibleLabel =
    (await control.getAttribute("aria-label")) ?? (await control.getAttribute("title"));
  if (accessibleLabel !== label) {
    throw new Error(
      `Viewer control "${testId}" has label "${accessibleLabel}", expected "${label}".`,
    );
  }
  return control;
};

const waitForEnabled = async (locator, context) => {
  await locator.waitFor({ state: "visible" });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await locator.isEnabled()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`${context} did not become enabled after validation.`);
};

const uploadAndFinishAnalysis = async (
  page,
  activityId,
  context,
  uploadScreenshotPath,
) => {
  const startAnalysis = page.getByRole("button", {
    name: /تأكيد النموذج وبدء الفحص/,
  });
  await startAnalysis.waitFor({ state: "visible" });
  if (await startAnalysis.isEnabled()) {
    throw new Error(`${context} analysis was enabled before selecting a file.`);
  }

  const fixturePath = path.join(
    projectDirectory,
    "test-fixtures",
    "ifc",
    activityId,
    "submission-v1.ifc",
  );
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.getByText("submission-v1.ifc", { exact: true }).waitFor();
  if (uploadScreenshotPath) {
  await page.screenshot({ path: uploadScreenshotPath, fullPage: true });
  }
  await waitForEnabled(startAnalysis, `${context} analysis button`);
  await page.evaluate(() => {
    window.__miyarProcessingTrace = {
      sawActiveStage: false,
      sawIntermediateWork: false,
    };
    const observer = new MutationObserver(() => {
      const activeStage = document.querySelector(".analysis-stage.is-active");
      const progress = activeStage?.querySelector(
        ".analysis-stage__work",
      )?.getAttribute("aria-valuenow");
      if (activeStage) window.__miyarProcessingTrace.sawActiveStage = true;
      if (progress && Number(progress) > 0 && Number(progress) < 100) {
        window.__miyarProcessingTrace.sawIntermediateWork = true;
      }
      if (document.querySelector(".analysis-stage.is-failed")) {
        observer.disconnect();
      }
    });
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  });
  await startAnalysis.click();

  const analysis = page.locator(".analysis-card");
  await analysis.waitFor({ state: "visible" });
  const showResults = page.getByRole("button", { name: /عرض نتائج الفحص/ });
  await showResults.waitFor({ state: "visible", timeout: 15_000 });

  const completedStages = analysis.locator(".analysis-stage.is-done");
  if ((await completedStages.count()) !== 6) {
    throw new Error(
      `${context} did not complete all six real processing stages.`,
    );
  }
  if ((await completedStages.locator(".analysis-stage__detail").count()) !== 6) {
    throw new Error(`${context} processing stages did not retain their evidence.`);
  }
  const processingTrace = await page.evaluate(() => window.__miyarProcessingTrace);
  if (!processingTrace?.sawActiveStage || !processingTrace?.sawIntermediateWork) {
    throw new Error(
      `${context} did not render byte-derived intermediate processing work: ${JSON.stringify(processingTrace)}.`,
    );
  }
  if (uploadScreenshotPath) {
    await page.screenshot({
      path: path.join(
        path.dirname(uploadScreenshotPath),
        "02b-analysis-complete.png",
      ),
      fullPage: true,
    });
  }

  await showResults.click();
  await page.locator(".workspace-page").waitFor({ state: "visible" });

  const score = (await page.locator(".summary-overview .score-ring strong").innerText()).trim();
  const passed = (await page.locator(".summary-stat--pass strong").innerText()).trim();
  const failed = (await page.locator(".summary-stat--fail strong").innerText()).trim();
  const unknown = (await page.locator(".summary-stat--unknown strong").innerText()).trim();
  if (score !== "40" || passed !== "4" || failed !== "5" || unknown !== "1") {
    throw new Error(
      `${context} summary is inconsistent: score=${score}, pass=${passed}, fail=${failed}, unknown=${unknown}.`,
    );
  }
};

const openSectorFixture = async (page, activityId, context) => {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByTestId(`activity-example-${activityId}`).click();
  await page.getByRole("heading", { name: "عرّف مشروعك" }).waitFor();
  await page.getByRole("button", { name: /حفظ ومتابعة إلى النموذج/ }).click();
  await page.getByRole("heading", { name: "أضف النموذج الهندسي" }).waitFor();
  await uploadAndFinishAnalysis(page, activityId, context);
};

const exerciseViewerControls = async (page) => {
  const requiredControls = [
    ["viewer-reset", "إعادة ضبط المشهد"],
    ["viewer-preset-top", "المسقط الأفقي"],
    ["viewer-preset-front", "الواجهة الأمامية"],
    ["viewer-preset-walk", "منظور داخلي"],
    ["viewer-ghost", "شفافية الغلاف المعماري"],
    ["viewer-labels-toggle", "إظهار أسماء المساحات"],
    ["viewer-dimensions-toggle", "إظهار القياسات"],
    ["viewer-exploded-toggle", "عرض المشهد المفكك"],
    ["viewer-layers", "طبقات النموذج"],
    ["viewer-fullscreen", "ملء الشاشة"],
    ["viewer-help", "مساعدة التحكم"],
  ];

  for (const [testId, label] of requiredControls) {
    await requireViewerControl(page, testId, label);
  }

  const topView = await requireViewerControl(
    page,
    "viewer-preset-top",
    "المسقط الأفقي",
  );
  await topView.click();
  if (!(await topView.getAttribute("class"))?.includes("is-active")) {
    throw new Error("The top-view control did not enter its active state.");
  }

  const ghost = await requireViewerControl(
    page,
    "viewer-ghost",
    "شفافية الغلاف المعماري",
  );
  await ghost.click();
  if ((await ghost.getAttribute("aria-pressed")) !== "true") {
    throw new Error("The wall-transparency control did not enter its active state.");
  }

  const layers = await requireViewerControl(
    page,
    "viewer-layers",
    "طبقات النموذج",
  );
  await layers.click();
  const layerPanel = page.locator(".viewer__layers");
  await layerPanel.waitFor({ state: "visible" });
  const layerCount = await layerPanel.locator('input[type="checkbox"]').count();
  if (layerCount < 4) {
    throw new Error(`Expected at least four model layers, found ${layerCount}.`);
  }
  await layers.click();
  await layerPanel.waitFor({ state: "hidden" });

  const spaceLabels = await requireViewerControl(
    page,
    "viewer-labels-toggle",
    "إظهار أسماء المساحات",
  );
  const labelsBefore = await spaceLabels.getAttribute("aria-pressed");
  await spaceLabels.click();
  if ((await spaceLabels.getAttribute("aria-pressed")) === labelsBefore) {
    throw new Error("The space-label control did not toggle its state.");
  }
  await spaceLabels.click();

  const dimensions = await requireViewerControl(
    page,
    "viewer-dimensions-toggle",
    "إظهار القياسات",
  );
  const dimensionsBefore = await dimensions.getAttribute("aria-pressed");
  await dimensions.click();
  if ((await dimensions.getAttribute("aria-pressed")) === dimensionsBefore) {
    throw new Error("The dimensions control did not toggle its state.");
  }
  await dimensions.click();

  const exploded = await requireViewerControl(
    page,
    "viewer-exploded-toggle",
    "عرض المشهد المفكك",
  );
  await exploded.click();
  if ((await exploded.getAttribute("aria-pressed")) !== "true") {
    throw new Error("The exploded-view control did not enter its active state.");
  }

  const walk = await requireViewerControl(
    page,
    "viewer-preset-walk",
    "منظور داخلي",
  );
  await walk.click();
  if (!(await walk.getAttribute("class"))?.includes("is-active")) {
    throw new Error("The walkthrough control did not enter its active state.");
  }

  const help = await requireViewerControl(
    page,
    "viewer-help",
    "مساعدة التحكم",
  );
  await help.click();
  await page.getByTestId("viewer-help-panel").waitFor({ state: "visible" });
  await help.click();
  await page.getByTestId("viewer-help-panel").waitFor({ state: "hidden" });

  const reset = await requireViewerControl(
    page,
    "viewer-reset",
    "إعادة ضبط المشهد",
  );
  await reset.click();
  await page.waitForTimeout(1_200);
  if ((await walk.getAttribute("class"))?.includes("is-active")) {
    throw new Error("Reset did not leave walkthrough mode.");
  }
  await page.locator(".viewer__selection").waitFor({ state: "hidden" });

  return {
    requiredControls: requiredControls.map(([testId]) => testId),
    layerCount,
  };
};

const exerciseFindingMarkers = async (page, context) => {
  const markers = page.locator(".model-pin");
  await markers.first().waitFor({ state: "visible" });
  const markerCount = await markers.count();
  if (markerCount !== 6) {
    throw new Error(
      `${context}: expected six dynamic markers for the six unresolved findings, found ${markerCount}.`,
    );
  }

  const labels = (await markers.allTextContents())
    .map((label) => label.trim())
    .sort((left, right) => Number(left) - Number(right));
  if (labels.join(",") !== "1,2,3,4,5,6") {
    throw new Error(
      `${context}: dynamic marker labels are not the actual unresolved ordinals: ${labels}.`,
    );
  }

  const firstMarker = markers.first();
  const linkedTitle = await firstMarker.getAttribute("title");
  await firstMarker.evaluate((button) => button.click());
  const selectedCard = page.locator(".finding-card.is-selected");
  await selectedCard.waitFor({ state: "visible" });
  if (linkedTitle && !(await selectedCard.innerText()).includes(linkedTitle)) {
    throw new Error(
      `${context}: clicking marker "${linkedTitle}" did not select its exact finding card.`,
    );
  }

  return { markerCount, labels };
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

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".hero h1").waitFor();
  await page.screenshot({
    path: path.join(artifactDirectory, "01-dashboard.png"),
    fullPage: true,
  });

  await page.locator(".hero .button--light").click();
  await page.getByRole("heading", { name: "عرّف مشروعك" }).waitFor();
  await page.getByRole("button", { name: /حفظ ومتابعة إلى النموذج/ }).click();
  await page.getByRole("heading", { name: "أضف النموذج الهندسي" }).waitFor();

  await uploadAndFinishAnalysis(
    page,
    "restaurant",
    "Restaurant",
    path.join(artifactDirectory, "02-model-upload.png"),
  );
  await page.getByRole("heading", { name: "نتائج الفحص" }).waitFor({
    timeout: 15_000,
  });
  const restaurantCanvas = await ensureUsableCanvas(page, "Restaurant");
  const findingMarkers = await exerciseFindingMarkers(page, "Restaurant");
  await page.screenshot({
    path: path.join(artifactDirectory, "03-workspace.png"),
    fullPage: true,
  });

  await page
    .getByRole("button", { name: /إظهار العنصر في النموذج/ })
    .click();
  await page.waitForTimeout(900);
  const focusedSelectionText = (
    await page.locator(".viewer__selection").innerText()
  ).trim();
  if (!focusedSelectionText) {
    throw new Error("Focused 3D result callout rendered without readable content.");
  }
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

  await page.setViewportSize({ width: 1440, height: 1000 });
  await openSectorFixture(page, "clinic", "Clinic");
  await page.getByText(/عيادة خارجية/).first().waitFor();
  const clinicCanvas = await ensureUsableCanvas(page, "Clinic");
  const clinicFindingMarkers = await exerciseFindingMarkers(page, "Clinic");
  await page.screenshot({
    path: path.join(artifactDirectory, "06-clinic-workspace.png"),
    fullPage: true,
  });

  const viewerControls = await exerciseViewerControls(page);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(artifactDirectory, "07-clinic-controls.png"),
    fullPage: true,
  });

  const additionalSectorCanvases = {};
  const additionalSectorMarkers = {};
  for (const [activityId, label, screenshotName] of [
    ["cafe", "مقهى", "08-cafe-workspace.png"],
    ["salon", "صالون تجميل", "09-salon-workspace.png"],
  ]) {
    await openSectorFixture(page, activityId, label);
    await page.getByText(new RegExp(label)).first().waitFor();
    await page
      .locator(`.viewer[data-activity="${activityId}"]`)
      .waitFor({ state: "visible" });
    additionalSectorCanvases[activityId] = await ensureUsableCanvas(
      page,
      label,
    );
    additionalSectorMarkers[activityId] = await exerciseFindingMarkers(
      page,
      label,
    );
    await page.screenshot({
      path: path.join(artifactDirectory, screenshotName),
      fullPage: true,
    });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
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
    path: path.join(artifactDirectory, "10-mobile-dashboard.png"),
    fullPage: true,
  });

  if (runtimeErrors.length) {
    throw new Error(`Browser runtime errors:\n${runtimeErrors.join("\n")}`);
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        screenshots: 11,
        restaurantCanvas,
        findingMarkers,
        clinicCanvas,
        clinicFindingMarkers,
        additionalSectorCanvases,
        additionalSectorMarkers,
        viewerControls,
        mobile: dimensions,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server.stdin?.end();
  server.kill();
}
