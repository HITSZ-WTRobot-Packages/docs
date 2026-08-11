import { describe, expect, test } from "bun:test";
import { glob } from "tinyglobby";

import { loadPackageCatalog } from "../../src/lib/catalog/loader";
import { loadApiCatalog } from "../../src/lib/doxygen/loader";

describe("real snapshot Doxygen API", () => {
  test("covers every package and unclaimed source on its configured branch", async () => {
    const [apiCatalog, packageCatalog] = await Promise.all([
      loadApiCatalog(),
      loadPackageCatalog(),
    ]);

    expect(apiCatalog.formatVersion).toBe(3);
    expect(apiCatalog.references).toHaveLength(43);
    expect(apiCatalog.references.some((reference) => reference.status === "failed")).toBe(false);
    const inheritanceRelations = apiCatalog.references.flatMap(
      (reference) => reference.inheritanceRelations,
    );
    expect(inheritanceRelations.some((relation) => relation.baseId !== null)).toBe(true);
    expect(inheritanceRelations.some((relation) => relation.baseId === null)).toBe(true);
    const members = apiCatalog.references.flatMap((reference) =>
      reference.symbols.flatMap((symbol) => (symbol.member ? [symbol.member] : [])),
    );
    expect(members.some((member) => member.virtual !== "none")).toBe(true);
    expect(members.some((member) => member.static)).toBe(true);
    expect(members.some((member) => member.const)).toBe(true);
    const packageReferences = new Map(
      apiCatalog.references
        .filter((reference) => reference.targetKind === "package")
        .map((reference) => [reference.packageSlug, reference]),
    );
    expect(packageReferences.size).toBe(packageCatalog.packages.length);
    for (const entry of packageCatalog.packages) {
      const reference = packageReferences.get(entry.slug);
      expect(reference?.moduleId).toBe(entry.moduleId);
      const module = packageCatalog.modules.find((candidate) => candidate.id === entry.moduleId);
      expect(reference?.sourceBranch).toBe(module?.branch);
    }

    const ownedSources = apiCatalog.references.flatMap((reference) =>
      reference.inputPaths.map((inputPath) => `${reference.moduleId}:${inputPath}`),
    );
    expect(ownedSources.length).toBeGreaterThan(0);
    expect(new Set(ownedSources).size).toBe(ownedSources.length);
    expect(
      await glob(
        [
          "modules/**/*.{c,cc,cpp,cxx,h,hh,hpp,hxx,inl,ipp}",
          "modules/**/cpkg.toml",
          "modules/**/*.xml",
        ],
        {
          cwd: "sources",
          onlyFiles: true,
        },
      ),
    ).toEqual([]);
    expect(
      apiCatalog.references.some(
        (reference) => reference.targetKind === "module" && reference.moduleId === "ArmController",
      ),
    ).toBe(true);
  });
});
