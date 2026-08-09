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
    const links = collectSidebarLinks(buildPortalSidebar(data.catalog));
    expect(links.length).toBe(51);
    expect(new Set(links).size).toBe(links.length);
    expect(links.every((link) => link.startsWith("/"))).toBe(true);
    expect(links.every((link) => !link.startsWith("/products/wtr/docs/"))).toBe(true);
  });
});
