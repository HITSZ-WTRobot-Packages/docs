import { describe, expect, test } from "bun:test";

import {
  buildPackageCatalog,
  serializePackageCatalog,
  type CpkgDocument,
} from "../../src/lib/catalog/catalog";
import type { SourceManifest } from "../../src/lib/sources/manifest";

const SHA = "1234567890abcdef1234567890abcdef12345678";

function sourceManifest(paths: readonly string[]): SourceManifest {
  return {
    formatVersion: 1,
    modules: [
      {
        id: "FixtureModule",
        displayName: "Fixture Module",
        repository: "https://github.com/example/fixture.git",
        branch: "main",
        sha: SHA,
        shortSha: SHA.slice(0, 12),
        totalBytes: paths.length,
        files: paths.map((filePath, index) => ({
          path: filePath,
          bytes: 1,
          sha256: index.toString(16).padStart(64, "0"),
          kind: "manifest" as const,
        })),
        licenseFiles: [],
        warnings: [],
      },
    ],
  };
}

function document(filePath: string, contents: string): CpkgDocument {
  return { moduleId: "FixtureModule", filePath, contents };
}

const alphaManifest = `
format_version = 1
name = "Alpha"
pkgname = "Demo::Alpha"
version = "1.2.3"
dependencies = ["Demo::Beta", "FreeRTOS"]
`;

const betaManifest = `
name = "Beta"
pkgname = "Demo::Beta"
version = "0.1.0"
`;

function captureError(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error("Expected operation to throw.");
}

describe("package catalog", () => {
  test("normalizes historical manifests and derives dependency indexes", () => {
    const alphaPath = "alpha/cpkg.toml";
    const betaPath = "beta/cpkg.toml";
    const paths = [alphaPath, betaPath];
    const catalog = buildPackageCatalog(sourceManifest(paths), [
      document(alphaPath, alphaManifest),
      document(betaPath, betaManifest),
    ]);

    expect(catalog.packages.map((entry) => entry.pkgname)).toEqual(["Demo::Alpha", "Demo::Beta"]);
    const alpha = catalog.packages[0];
    const beta = catalog.packages[1];
    expect(alpha?.revisionLabel).toBe(`1.2.3+${SHA.slice(0, 12)}`);
    expect(alpha?.dependencies).toEqual([
      { kind: "internal", name: "Demo::Beta", slug: "demo--beta", moduleId: "FixtureModule" },
      { kind: "external", name: "FreeRTOS" },
    ]);
    expect(beta?.reverseDependencies).toEqual([
      { name: "Demo::Alpha", slug: "demo--alpha", moduleId: "FixtureModule" },
    ]);
    expect(alpha?.sourceUrl).toBe(`https://github.com/example/fixture/tree/${SHA}/alpha`);
    expect(serializePackageCatalog(JSON.parse(serializePackageCatalog(catalog)))).toBe(
      serializePackageCatalog(catalog),
    );
  });

  test("rejects duplicate package names", () => {
    const alphaPath = "alpha/cpkg.toml";
    const duplicatePath = "duplicate/cpkg.toml";
    const paths = [alphaPath, duplicatePath];
    const error = captureError(() =>
      buildPackageCatalog(sourceManifest(paths), [
        document(alphaPath, alphaManifest.replace('"Demo::Beta", ', "")),
        document(duplicatePath, alphaManifest.replace('name = "Alpha"', 'name = "Other"')),
      ]),
    );

    expect(error).toMatchObject({ code: "CATALOG_PACKAGE_DUPLICATE" });
  });

  test("rejects unresolved dependencies", () => {
    const alphaPath = "alpha/cpkg.toml";
    const paths = [alphaPath];
    const error = captureError(() =>
      buildPackageCatalog(sourceManifest(paths), [
        document(
          alphaPath,
          alphaManifest.replace('["Demo::Beta", "FreeRTOS"]', '["Unknown::Package"]'),
        ),
      ]),
    );

    expect(error).toMatchObject({
      code: "CATALOG_DEPENDENCY_UNRESOLVED",
      context: { dependency: "Unknown::Package" },
    });
  });

  test("rejects schema errors and unsafe snapshot paths", () => {
    const alphaPath = "alpha/cpkg.toml";
    const paths = [alphaPath];
    const schemaError = captureError(() =>
      buildPackageCatalog(sourceManifest(paths), [
        document(alphaPath, alphaManifest.replace('version = "1.2.3"', 'version = "latest"')),
      ]),
    );
    expect(schemaError).toMatchObject({ code: "CATALOG_SCHEMA_INVALID" });

    const invalidSource = sourceManifest(paths);
    const module = invalidSource.modules[0];
    const file = module?.files[0];
    if (!file) {
      throw new Error("Invalid-path fixture is missing its source file.");
    }
    file.path = "../alpha/cpkg.toml";
    const pathError = captureError(() =>
      buildPackageCatalog(invalidSource, [document(alphaPath, alphaManifest)]),
    );
    expect(pathError).toMatchObject({ code: "CATALOG_SOURCE_INVALID" });
  });

  test("rejects slug collisions instead of creating ambiguous routes", () => {
    const firstPath = "first/cpkg.toml";
    const secondPath = "second/cpkg.toml";
    const paths = [firstPath, secondPath];
    const error = captureError(() =>
      buildPackageCatalog(sourceManifest(paths), [
        document(firstPath, 'name = "First"\npkgname = "Demo::foo_bar"\nversion = "0.1.0"\n'),
        document(secondPath, 'name = "Second"\npkgname = "Demo::foo-bar"\nversion = "0.1.0"\n'),
      ]),
    );

    expect(error).toMatchObject({ code: "CATALOG_SLUG_DUPLICATE" });
  });
});
