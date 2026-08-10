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

test("package workflow keeps primary context in main and package information in the sidebar", async ({
  page,
}, testInfo) => {
  await page.goto("packages/math--geometry/");
  await expect(page.getByRole("heading", { level: 1, name: "Math::Geometry" })).toBeVisible();
  await expectChineseDocument(page);

  const isDesktop = testInfo.project.name === "desktop-chromium";
  const main = page.locator("main");
  const packageInfo = page.locator(".wtr-package-info-sidebar");
  const packageInfoDisclosure = packageInfo.locator(":scope > details");
  const installPrompt = main.locator(".wtr-package-install-prompt");
  const installCommand = installPrompt.getByText("cpkg add Math::Geometry", { exact: true });
  const directDependencies = packageInfo.getByRole("heading", { level: 2, name: "直接依赖" });
  const apiReference = packageInfo.getByRole("link", { name: "API 参考" });
  await expect(packageInfo).toBeVisible();
  await expect(main.locator(".wtr-breadcrumbs")).toBeVisible();
  await expect(installPrompt).toBeVisible();
  await expect(installCommand).toBeVisible();
  await expect(packageInfo.getByText("cpkg add Math::Geometry", { exact: true })).toHaveCount(0);
  await expect(
    main.locator(
      ".wtr-page-actions, .wtr-package-summary, .wtr-dependency-columns, .wtr-dependency-graph",
    ),
  ).toHaveCount(0);

  const mainContentOrder = await page.evaluate(() => {
    const breadcrumbs = document.querySelector("main .wtr-breadcrumbs");
    const installPrompt = document.querySelector("main .wtr-package-install-prompt");
    const documentation = document.querySelector("main .wtr-documentation");
    if (!breadcrumbs || !installPrompt || !documentation) return null;
    return {
      breadcrumbsBeforeInstall: Boolean(
        breadcrumbs.compareDocumentPosition(installPrompt) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
      installBeforeDocumentation: Boolean(
        installPrompt.compareDocumentPosition(documentation) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    };
  });
  expect(mainContentOrder).toEqual({
    breadcrumbsBeforeInstall: true,
    installBeforeDocumentation: true,
  });
  await page.screenshot({
    path: testInfo.outputPath("package-main.png"),
    fullPage: false,
    animations: "disabled",
  });

  if (isDesktop) {
    await expect(page.locator("html")).toHaveAttribute("data-has-toc", "");
    await expect(packageInfo.getByRole("heading", { level: 2, name: "软件包信息" })).toBeVisible();
    await expect(directDependencies).toBeVisible();
    await expect(apiReference).toBeVisible();

    const columns = await page.evaluate(() => {
      const navigation = document.querySelector("#starlight__sidebar")?.getBoundingClientRect();
      const main = document.querySelector("main")?.getBoundingClientRect();
      const packageInfo = document
        .querySelector(".wtr-package-info-sidebar")
        ?.getBoundingClientRect();
      if (!navigation || !main || !packageInfo) return null;
      return {
        navigationRight: navigation.right,
        mainLeft: main.left,
        mainRight: main.right,
        packageInfoLeft: packageInfo.left,
      };
    });
    expect(columns).not.toBeNull();
    expect(columns?.navigationRight).toBeLessThanOrEqual(columns?.mainLeft ?? 0);
    expect(columns?.mainRight).toBeLessThanOrEqual(columns?.packageInfoLeft ?? 0);

    await page.emulateMedia({ media: "print" });
    await expect(packageInfo).toBeVisible();
    await expect(installCommand).toBeVisible();
    await expect(directDependencies).toBeVisible();
    await page.emulateMedia({ media: "screen" });
  } else {
    await expect(packageInfoDisclosure).not.toHaveAttribute("open", "");
    await expect(installCommand).toBeVisible();
    await expect(directDependencies).toBeHidden();
    await expect(apiReference).toBeHidden();

    const mobileOrder = await page.evaluate(() => {
      const packageInfoContainer = document
        .querySelector(".wtr-package-info-sidebar")
        ?.closest(".right-sidebar-container");
      const mainPane = document.querySelector(".main-pane");
      const packageInfo = packageInfoContainer?.getBoundingClientRect();
      const main = mainPane?.getBoundingClientRect();
      if (!packageInfoContainer || !mainPane || !packageInfo || !main) return null;
      return {
        packageInfoBottom: packageInfo.bottom,
        mainTop: main.top,
        packageInfoBeforeMain: Boolean(
          packageInfoContainer.compareDocumentPosition(mainPane) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      };
    });
    expect(mobileOrder).not.toBeNull();
    expect(mobileOrder?.packageInfoBeforeMain).toBe(true);
    expect(mobileOrder?.packageInfoBottom).toBeLessThanOrEqual(mobileOrder?.mainTop ?? 0);

    const packageInfoSummary = packageInfoDisclosure.getByText("软件包信息", { exact: true });
    await packageInfoSummary.focus();
    await page.keyboard.press("Enter");
    await expect(packageInfoDisclosure).toHaveAttribute("open", "");
    await expect(directDependencies).toBeVisible();
    await expect(apiReference).toBeVisible();
  }

  const explorer = packageInfo.getByText("依赖关系浏览器", { exact: true });
  await explorer.click();
  await expect(page.locator(".wtr-graph-canvas canvas").first()).toBeVisible();
  await expect(page.locator("[data-graph-status]")).toContainText("个软件包");
  const transitive = page.getByRole("button", { name: "传递" });
  await transitive.focus();
  await page.keyboard.press("Enter");
  await expect(transitive).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\?graph=transitive$/);
  await page.reload();
  await expect(installCommand).toBeVisible();
  if (!isDesktop) {
    await packageInfoDisclosure.getByText("软件包信息", { exact: true }).click();
  }
  await packageInfo.getByText("依赖关系浏览器", { exact: true }).click();
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
  await expect(page.locator(".wtr-package-info-sidebar")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-has-toc", "");
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
