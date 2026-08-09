import { describe, expect, test } from "bun:test";

import { loadPackageCatalog } from "../../src/lib/catalog/loader";
import { loadApiCatalog } from "../../src/lib/doxygen/generator";
import { readSourceManifest } from "../../src/lib/sources/manifest";

describe("real snapshot Doxygen API", () => {
  test("covers every package and unclaimed source at its pinned revision", async () => {
    const [apiCatalog, packageCatalog, sourceManifest] = await Promise.all([
      loadApiCatalog(),
      loadPackageCatalog(),
      readSourceManifest("sources"),
    ]);

    expect(apiCatalog.references).toHaveLength(43);
    expect(apiCatalog.references.some((reference) => reference.status === "failed")).toBe(false);
    const packageReferences = new Map(
      apiCatalog.references
        .filter((reference) => reference.targetKind === "package")
        .map((reference) => [reference.packageSlug, reference]),
    );
    expect(packageReferences.size).toBe(packageCatalog.packages.length);
    for (const entry of packageCatalog.packages) {
      const reference = packageReferences.get(entry.slug);
      expect(reference?.moduleId).toBe(entry.moduleId);
      expect(reference?.moduleSha).toBe(entry.moduleSha);
      expect(reference?.revisionLabel).toBe(entry.revisionLabel);
    }

    const expectedSources = sourceManifest.modules.reduce(
      (count, module) => count + module.files.filter((file) => file.kind === "source").length,
      0,
    );
    const ownedSources = apiCatalog.references.flatMap((reference) =>
      reference.inputPaths.map((inputPath) => `${reference.moduleId}:${inputPath}`),
    );
    expect(ownedSources).toHaveLength(expectedSources);
    expect(new Set(ownedSources).size).toBe(expectedSources);
    expect(
      apiCatalog.references.some(
        (reference) => reference.targetKind === "module" && reference.moduleId === "ArmController",
      ),
    ).toBe(true);
  });
});
