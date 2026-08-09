import { describe, expect, test } from "bun:test";

import { buildApiTargets } from "../../src/lib/doxygen/ownership";
import type { PackageCatalog } from "../../src/lib/catalog/schema";
import type { SourceManifest } from "../../src/lib/sources/manifest";

const SHA = "1234567890abcdef1234567890abcdef12345678";

describe("Doxygen source ownership", () => {
  test("assigns each source to the deepest package and retains unclaimed module sources", () => {
    const sourceManifest: SourceManifest = {
      formatVersion: 1,
      modules: [
        {
          id: "Fixture",
          displayName: "Fixture",
          repository: "https://github.com/example/fixture.git",
          branch: "main",
          sha: SHA,
          shortSha: SHA.slice(0, 12),
          totalBytes: 3,
          files: [
            { path: "root.hpp", bytes: 1, sha256: "0".repeat(64), kind: "source" },
            { path: "packages/base/base.hpp", bytes: 1, sha256: "1".repeat(64), kind: "source" },
            {
              path: "packages/base/nested/nested.hpp",
              bytes: 1,
              sha256: "2".repeat(64),
              kind: "source",
            },
          ],
          licenseFiles: [],
          warnings: [],
        },
      ],
    };
    const packageTemplate = {
      name: "Base",
      version: "1.0.0",
      moduleId: "Fixture",
      moduleSlug: "fixture",
      moduleSha: SHA,
      moduleShortSha: SHA.slice(0, 12),
      sourceUrl: `https://github.com/example/fixture/tree/${SHA}/packages/base`,
      dependencies: [],
      reverseDependencies: [],
    };
    const catalog: PackageCatalog = {
      formatVersion: 1,
      modules: [
        {
          id: "Fixture",
          displayName: "Fixture",
          slug: "fixture",
          repository: "https://github.com/example/fixture.git",
          branch: "main",
          sha: SHA,
          shortSha: SHA.slice(0, 12),
          packageSlugs: ["fixture--base", "fixture--nested"],
          warnings: [],
        },
      ],
      packages: [
        {
          ...packageTemplate,
          pkgname: "Fixture::Base",
          revisionLabel: `1.0.0+${SHA.slice(0, 12)}`,
          slug: "fixture--base",
          manifestPath: "packages/base/cpkg.toml",
          packagePath: "packages/base",
        },
        {
          ...packageTemplate,
          name: "Nested",
          pkgname: "Fixture::Nested",
          revisionLabel: `1.0.0+${SHA.slice(0, 12)}`,
          slug: "fixture--nested",
          manifestPath: "packages/base/nested/cpkg.toml",
          packagePath: "packages/base/nested",
          sourceUrl: `https://github.com/example/fixture/tree/${SHA}/packages/base/nested`,
        },
      ],
    };

    const targets = buildApiTargets(sourceManifest, catalog);
    expect(targets.find((target) => target.targetId === "fixture--base")?.inputPaths).toEqual([
      "packages/base/base.hpp",
    ]);
    expect(targets.find((target) => target.targetId === "fixture--nested")?.inputPaths).toEqual([
      "packages/base/nested/nested.hpp",
    ]);
    expect(targets.find((target) => target.targetKind === "module")?.inputPaths).toEqual([
      "root.hpp",
    ]);
  });
});
