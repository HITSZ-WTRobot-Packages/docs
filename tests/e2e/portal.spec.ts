import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectAccessible(page: Page) {
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
}

async function expectChineseDocument(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator("main")).toHaveAttribute("lang", "zh-CN");
}

async function expectStableLayout(page: Page) {
  const layout = await page.evaluate(() => {
    const horizontalOverflow =
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const clippedText = [...document.querySelectorAll<HTMLElement>("h1, h2, h3, a, button, code")]
      .filter((element) => {
        if (!element.offsetParent || element.closest(".table-scroll, pre")) return false;
        const style = getComputedStyle(element);
        return (
          style.overflowX !== "auto" &&
          style.overflowX !== "scroll" &&
          element.scrollWidth > element.clientWidth + 2
        );
      })
      .map((element) => element.textContent?.trim().slice(0, 80));
    return { horizontalOverflow, clippedText };
  });
  expect(layout.horizontalOverflow).toBe(false);
  expect(layout.clippedText).toEqual([]);
}

test("catalog exposes every module and a stable package table", async ({ page }, testInfo) => {
  await page.goto("./");
  await expectChineseDocument(page);
  await expect(page.getByText("HITSZ-WTRobot-Packages", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/哈尔滨工业大学（深圳）南工问天（HITSZ WTRobot）/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "软件包目录" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "模块" })).toBeVisible();
  await expect(page.getByRole("table", { name: "软件包" })).toBeVisible();
  await expect(page.getByRole("link", { name: "BasicComponents" }).first()).toBeVisible();
  const sidebarSearch = page.locator('#starlight__sidebar a[href*="search"]');
  const expectedSearchPath = new URL("search/", page.url()).pathname;
  await expect(sidebarSearch).toHaveAttribute("href", expectedSearchPath);
  await expectStableLayout(page);
  await expectAccessible(page);
  await page.screenshot({
    path: testInfo.outputPath("catalog.png"),
    fullPage: true,
    animations: "disabled",
  });
  if (testInfo.project.name === "desktop-chromium") {
    await sidebarSearch.click();
    await expect(page.getByRole("heading", { level: 1, name: "搜索文档" })).toBeVisible();
  }
});

test("package workflow includes metadata, dependencies, and a rendered graph", async ({
  page,
}, testInfo) => {
  await page.goto("packages/math--geometry/");
  await expect(page.getByRole("heading", { level: 1, name: "Math::Geometry" })).toBeVisible();
  await expect(page.getByText("cpkg add Math::Geometry", { exact: true })).toBeVisible();
  await expectChineseDocument(page);
  await expect(page.getByRole("heading", { level: 2, name: "直接依赖" })).toBeVisible();
  await expect(page.getByRole("link", { name: "API 参考" })).toBeVisible();

  const explorer = page.getByText("依赖关系浏览器", { exact: true });
  await explorer.click();
  await expect(page.locator(".wtr-graph-canvas canvas").first()).toBeVisible();
  await expect(page.locator("[data-graph-status]")).toContainText("个软件包");
  const transitive = page.getByRole("button", { name: "传递" });
  await transitive.focus();
  await page.keyboard.press("Enter");
  await expect(transitive).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\?graph=transitive$/);
  await page.reload();
  await page.getByText("依赖关系浏览器", { exact: true }).click();
  await expect(page.getByRole("button", { name: "传递" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-graph-status]")).toContainText("传递模式");

  const nonBlankCanvas = await page.locator(".wtr-graph-canvas canvas").evaluateAll((canvases) =>
    canvases.some((canvas) => {
      if (!(canvas instanceof HTMLCanvasElement)) return false;
      const context = canvas.getContext("2d");
      if (!context || canvas.width === 0 || canvas.height === 0) return false;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 3; index < pixels.length; index += 64) {
        const alpha = pixels[index];
        if (alpha !== undefined && alpha > 0) return true;
      }
      return false;
    }),
  );
  expect(nonBlankCanvas).toBe(true);
  await expectStableLayout(page);
  await expectAccessible(page);
  await page.screenshot({
    path: testInfo.outputPath("package-graph.png"),
    fullPage: false,
    animations: "disabled",
  });
});

test("API and quality routes expose revision-pinned status", async ({ page }, testInfo) => {
  await page.goto("packages/math--geometry/api/");
  await expectChineseDocument(page);
  await expect(page.getByRole("heading", { level: 1, name: "Math::Geometry API" })).toBeVisible();
  await expect(page.getByText("math::Quaternion", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("文档稀疏", { exact: true })).toBeVisible();
  await expectStableLayout(page);
  await expectAccessible(page);
  await page.screenshot({
    path: testInfo.outputPath("api.png"),
    fullPage: false,
    animations: "disabled",
  });

  await page.goto("quality/");
  await expect(page.getByRole("heading", { level: 1, name: "文档质量" })).toBeVisible();
  await expect(page.getByRole("table", { name: "API 目标" })).toBeVisible();
  await expectStableLayout(page);
  await expectAccessible(page);
});

test("upstream Chinese documentation remains readable and stable", async ({ page }, testInfo) => {
  await page.goto("packages/chassis--steering4/");
  await expectChineseDocument(page);
  await expect(page.getByRole("heading", { level: 1, name: "Chassis::Steering4" })).toBeVisible();
  const chineseSection = page.getByRole("heading", { level: 3, name: "适用场景" });
  await expect(chineseSection).toBeVisible();
  await expect(page.getByText("四个轮组都同时具备驱动轴和舵向轴。")).toBeVisible();
  await expectStableLayout(page);
  await expectAccessible(page);
  await chineseSection.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("chinese-readme.png"),
    fullPage: false,
    animations: "disabled",
  });
});

test("Pagefind search finds API symbols and restores URL filters", async ({ page }, testInfo) => {
  await page.goto("search/?q=Quaternion&module=BasicComponents&resultType=api");
  const query = page.getByRole("searchbox", { name: "搜索软件包和 API" });
  await expect(query).toHaveValue("Quaternion");
  await expect(page.getByLabel("模块")).toHaveValue("BasicComponents");
  await expect(page.getByLabel("结果类型")).toHaveValue("api");
  await expect(page.locator("[data-search-status]")).toContainText("条结果", {
    timeout: 15_000,
  });
  await expect(page.locator("[data-search-results] a").first()).toBeVisible();
  await expect(page.locator("[data-search-results]")).toContainText("Geometry");
  await expectStableLayout(page);
  await expectAccessible(page);
  await page.screenshot({
    path: testInfo.outputPath("search.png"),
    fullPage: false,
    animations: "disabled",
  });
});

test("unknown routes render the documentation 404 page", async ({ page }) => {
  const response = await page.goto("missing-documentation-route/");
  expect(response?.status()).toBe(404);
  await expectChineseDocument(page);
  await expect(page.getByRole("heading", { level: 1, name: "404" })).toBeVisible();
  await expect(page.getByText(/页面未找到/)).toBeVisible();
  await expect(page.getByRole("button", { name: "搜索" })).toBeVisible();
  await expectStableLayout(page);
  await expectAccessible(page);
});
