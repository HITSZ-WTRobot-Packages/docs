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
  await expect(page.getByRole("heading", { level: 1, name: "Package catalog" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Modules" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Packages" })).toBeVisible();
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
    await expect(
      page.getByRole("heading", { level: 1, name: "Search documentation" }),
    ).toBeVisible();
  }
});

test("package workflow includes metadata, dependencies, and a rendered graph", async ({
  page,
}, testInfo) => {
  await page.goto("packages/math--geometry/");
  await expect(page.getByRole("heading", { level: 1, name: "Math::Geometry" })).toBeVisible();
  await expect(page.getByText("cpkg add Math::Geometry", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Direct dependencies" })).toBeVisible();
  await expect(page.getByRole("link", { name: "API reference" })).toBeVisible();

  const explorer = page.getByText("Dependency explorer", { exact: true });
  await explorer.click();
  await expect(page.locator(".wtr-graph-canvas canvas").first()).toBeVisible();
  await expect(page.locator("[data-graph-status]")).toContainText("packages shown");
  const transitive = page.getByRole("button", { name: "Transitive" });
  await transitive.focus();
  await page.keyboard.press("Enter");
  await expect(transitive).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\?graph=transitive$/);
  await page.reload();
  await page.getByText("Dependency explorer", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Transitive" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("[data-graph-status]")).toContainText("transitive mode");

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
  await expect(page.getByRole("heading", { level: 1, name: "Math::Geometry API" })).toBeVisible();
  await expect(page.getByText("math::Quaternion", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Sparse docs", { exact: true })).toBeVisible();
  await expectStableLayout(page);
  await expectAccessible(page);
  await page.screenshot({
    path: testInfo.outputPath("api.png"),
    fullPage: false,
    animations: "disabled",
  });

  await page.goto("quality/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Documentation quality" }),
  ).toBeVisible();
  await expect(page.getByRole("table", { name: "API targets" })).toBeVisible();
  await expectStableLayout(page);
  await expectAccessible(page);
});

test("upstream Chinese documentation remains readable and stable", async ({ page }, testInfo) => {
  await page.goto("packages/chassis--steering4/");
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
  const query = page.getByRole("searchbox", { name: "Search packages and APIs" });
  await expect(query).toHaveValue("Quaternion");
  await expect(page.getByLabel("Module")).toHaveValue("BasicComponents");
  await expect(page.getByLabel("Result type")).toHaveValue("api");
  await expect(page.locator("[data-search-status]")).toContainText(/result/i, { timeout: 15_000 });
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
  await expect(page.getByRole("heading", { level: 1, name: "404" })).toBeVisible();
  await expect(page.getByText(/Page not found/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
  await expectStableLayout(page);
  await expectAccessible(page);
});
