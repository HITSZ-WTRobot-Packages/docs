import { describe, expect, test } from "bun:test";

import { buildPortalSidebar } from "../../src/lib/site/navigation";
import { loadPortalData } from "../../src/lib/site/portal-data";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectSidebarLinks(value: unknown): string[] {
  const links: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) links.push(...collectSidebarLinks(item));
  } else if (isRecord(value)) {
    if (typeof value.link === "string") links.push(value.link);
    if (Array.isArray(value.items)) links.push(...collectSidebarLinks(value.items));
  }
  return links;
}

function collectSidebarLabels(value: unknown): string[] {
  const labels: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) labels.push(...collectSidebarLabels(item));
  } else if (isRecord(value)) {
    if (typeof value.label === "string") labels.push(value.label);
    if (Array.isArray(value.items)) labels.push(...collectSidebarLabels(value.items));
  }
  return labels;
}

describe("portal build data", () => {
  test("joins every package to documentation and API data", async () => {
    const data = await loadPortalData();
    expect(data.catalog.modules).toHaveLength(6);
    expect(data.catalog.packages).toHaveLength(42);
    expect(data.api.references).toHaveLength(43);

    for (const entry of data.catalog.packages) {
      expect(
        data.documentation.pages.some(
          (page) => page.kind === "package" && page.packageSlug === entry.slug,
        ),
      ).toBe(true);
      expect(data.api.references.some((reference) => reference.packageSlug === entry.slug)).toBe(
        true,
      );
    }
    expect(data.documentation.pages.every((page) => !/<h1(?:\s|>)/u.test(page.html))).toBe(true);
  });

  test("builds unique site-relative links for Starlight navigation", async () => {
    const data = await loadPortalData();
    const sidebar = buildPortalSidebar(data.catalog);
    const links = collectSidebarLinks(sidebar);
    const labels = collectSidebarLabels(sidebar);
    expect(
      sidebar.map((item) => (isRecord(item) && typeof item.label === "string" ? item.label : null)),
    ).toEqual(["快速开始", "使用指南", "驱动包", "开发指南", "参考"]);
    expect(links).toHaveLength(14);
    expect(new Set(links).size).toBe(links.length);
    expect(links.every((link) => link.startsWith("/"))).toBe(true);
    expect(links.every((link) => !link.startsWith("/products/wtr/docs/"))).toBe(true);
    expect(links).toEqual(
      expect.arrayContaining([
        "/getting-started/",
        "/getting-started/installation/",
        "/getting-started/first-project/",
        "/user-guide/",
        "/development-guide/",
        ...data.catalog.modules.map((module) => `/modules/${module.slug}/`),
      ]),
    );
    expect(links.some((link) => link.startsWith("/packages/"))).toBe(false);
    expect(labels).not.toContain("模块概览");
  });
});
