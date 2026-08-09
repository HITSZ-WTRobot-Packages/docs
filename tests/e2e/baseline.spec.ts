import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("catalog shell is stable and accessible", async ({ page }, testInfo) => {
  await page.goto("./");

  await expect(page.getByRole("heading", { level: 1, name: "Package catalog" })).toBeVisible();
  await expect(page.getByRole("table", { name: /module/i })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath("catalog.png"),
    fullPage: true,
    animations: "disabled",
  });
});
