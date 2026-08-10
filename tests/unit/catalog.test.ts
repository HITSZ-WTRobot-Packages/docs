import { describe, expect, test } from "bun:test";

import {
  buildPackageCatalog,
  serializePackageCatalog,
  type CpkgDocument,
} from "../../src/lib/catalog/catalog";
import type { SourceManifest } from "../../src/lib/sources/manifest";

const SHA = "1234567890abcdef1234567890abcdef12345678";

function sourceManifest(): SourceManifest {
  return {
    formatVersion: 2,
    modules: [
      {
        id: "FixtureModule",
        displayName: "Fixture Module",
        repository: "https://github.com/example/fixture.git",
        branch: "main",
        sha: SHA,
        shortSha: SHA.slice(0, 12),
        producerFingerprint: "f".repeat(64),
        totalBytes: 0,
        files: [],
        artifacts: [
          { path: "api-catalog.json", bytes: 0, sha256: "a".repeat(64), kind: "api-catalog" },
          {
            path: "package-catalog.json",
            bytes: 0,
            sha256: "b".repeat(64),
            kind: "package-catalog",
          },
        ],
        references: [],
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
    const catalog = buildPackageCatalog(sourceManifest(), [
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
    const error = captureError(() =>
      buildPackageCatalog(sourceManifest(), [
        document(alphaPath, alphaManifest.replace('"Demo::Beta", ', "")),
        document(duplicatePath, alphaManifest.replace('name = "Alpha"', 'name = "Other"')),
      ]),
    );

    expect(error).toMatchObject({ code: "CATALOG_PACKAGE_DUPLICATE" });
  });

  test("rejects unresolved dependencies", () => {
    const alphaPath = "alpha/cpkg.toml";
    const error = captureError(() =>
      buildPackageCatalog(sourceManifest(), [
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
    const schemaError = captureError(() =>
      buildPackageCatalog(sourceManifest(), [
        document(alphaPath, alphaManifest.replace('version = "1.2.3"', 'version = "latest"')),
      ]),
    );
    expect(schemaError).toMatchObject({ code: "CATALOG_SCHEMA_INVALID" });

    const pathError = captureError(() =>
      buildPackageCatalog(sourceManifest(), [document("../alpha/cpkg.toml", alphaManifest)]),
    );
    expect(pathError).toBeDefined();
  });

  test("rejects slug collisions instead of creating ambiguous routes", () => {
    const firstPath = "first/cpkg.toml";
    const secondPath = "second/cpkg.toml";
    const error = captureError(() =>
      buildPackageCatalog(sourceManifest(), [
        document(firstPath, 'name = "First"\npkgname = "Demo::foo_bar"\nversion = "0.1.0"\n'),
        document(secondPath, 'name = "Second"\npkgname = "Demo::foo-bar"\nversion = "0.1.0"\n'),
      ]),
    );

    expect(error).toMatchObject({ code: "CATALOG_SLUG_DUPLICATE" });
  });
});
