import { describe, expect, test } from "bun:test";

import {
  APPROVED_EXTERNAL_DEPENDENCIES,
  serializePackageCatalog,
} from "../../src/lib/catalog/catalog";
import { loadPackageCatalog } from "../../src/lib/catalog/loader";

describe("real snapshot catalog", () => {
  test("loads every persisted module catalog and resolves the dependency graph offline", async () => {
    const first = await loadPackageCatalog();
    const second = await loadPackageCatalog();

    expect(first.modules).toHaveLength(6);
    expect(first.packages).toHaveLength(42);
    expect(new Set(first.packages.map((entry) => entry.manifestPath)).size).toBe(42);
    expect(serializePackageCatalog(second)).toBe(serializePackageCatalog(first));

    const packageNames = new Set(first.packages.map((entry) => entry.pkgname));
    expect(packageNames.has("services::I2CUpdateManager")).toBe(true);
    expect(packageNames.has("protocol::UartRxSync")).toBe(true);
    expect(packageNames.has("libs::FixedMap")).toBe(true);

    for (const entry of first.packages) {
      expect(entry.revisionLabel).toBe(`${entry.version}+${entry.moduleShortSha}`);
      expect(entry.sourceUrl).toContain(`/tree/${entry.moduleSha}/`);
      for (const dependency of entry.dependencies) {
        if (dependency.kind === "internal") {
          expect(packageNames.has(dependency.name)).toBe(true);
        } else {
          expect(APPROVED_EXTERNAL_DEPENDENCIES.has(dependency.name)).toBe(true);
        }
      }
    }

    expect(first.modules.find((module) => module.id === "ArmController")?.packageSlugs).toEqual([]);
  });
});
