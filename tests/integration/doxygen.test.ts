import { chmod, cp, exists, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";
import { glob } from "tinyglobby";

import {
  buildModulePackageCatalog,
  buildPackageCatalogFromModules,
  type CpkgDocument,
} from "../../src/lib/catalog/catalog";
import { generateModuleApiCatalog, serializeApiCatalog } from "../../src/lib/doxygen/generator";
import type { ModuleSnapshot, SourceManifest } from "../../src/lib/sources/manifest";

const SHA = "abcdef1234567890abcdef1234567890abcdef12";
const temporaryRoots: string[] = [];

async function createDoxygenRepository() {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "wtr-docs-api-"));
  temporaryRoots.push(repositoryRoot);
  const fixtureRoot = path.resolve(import.meta.dirname, "../fixtures/doxygen");
  const moduleRoot = path.join(repositoryRoot, "upstream");
  await mkdir(moduleRoot, { recursive: true });
  await cp(fixtureRoot, moduleRoot, { recursive: true });
  await writeFile(
    path.join(repositoryRoot, ".doxygen-version"),
    await readFile(path.resolve(import.meta.dirname, "../../.doxygen-version"), "utf8"),
    "utf8",
  );

  const manifestPaths = await glob("**/cpkg.toml", { cwd: moduleRoot, onlyFiles: true });
  const sourcePaths = (
    await glob("**/*.{c,cpp,h,hpp}", { cwd: moduleRoot, onlyFiles: true })
  ).sort();
  const module: ModuleSnapshot = {
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
  };
  const documents: CpkgDocument[] = await Promise.all(
    manifestPaths.sort().map(async (filePath) => ({
      moduleId: module.id,
      filePath,
      contents: await readFile(path.join(moduleRoot, filePath), "utf8"),
    })),
  );
  const sourceManifest: SourceManifest = { formatVersion: 2, modules: [module] };
  const packageCatalog = buildPackageCatalogFromModules(sourceManifest, [
    buildModulePackageCatalog(module, documents),
  ]);
  return { repositoryRoot, moduleRoot, module, packageCatalog, sourcePaths };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Doxygen API generation", () => {
  test("normalizes C, C++, compiled, header-only, empty, and sparse package APIs", async () => {
    const fixture = await createDoxygenRepository();
    const options = {
      ...fixture,
      packageCatalog: fixture.packageCatalog,
    };
    const first = await generateModuleApiCatalog(options);
    const second = await generateModuleApiCatalog(options);

    expect(first.references).toHaveLength(5);
    expect(await exists(path.join(fixture.repositoryRoot, "html"))).toBe(false);
    expect(await exists(path.join(fixture.repositoryRoot, "latex"))).toBe(false);
    expect(serializeApiCatalog(second)).toBe(serializeApiCatalog(first));
    expect(first.formatVersion).toBe(3);
    expect(first.references.every((reference) => reference.sourceBranch === "main")).toBe(true);
    expect(
      first.references
        .flatMap((reference) => reference.symbols)
        .every((symbol) => !symbol.location || symbol.location.sourceUrl.includes("/blob/main/")),
    ).toBe(true);
    expect(
      first.references
        .filter((reference) => reference.status === "failed")
        .map((reference) => ({ name: reference.displayName, warnings: reference.warnings })),
    ).toEqual([]);

    const cReference = first.references.find(
      (reference) => reference.displayName === "Fixture::CExample",
    );
    const cppReference = first.references.find(
      (reference) => reference.displayName === "Fixture::CppExample",
    );
    const headerReference = first.references.find(
      (reference) => reference.displayName === "Fixture::HeaderOnly",
    );
    const emptyReference = first.references.find(
      (reference) => reference.displayName === "Fixture::Empty",
    );
    const sparseReference = first.references.find(
      (reference) => reference.displayName === "Fixture::Sparse",
    );

    expect(cReference?.inputPaths).toEqual(["packages/c/demo.c", "packages/c/demo.h"]);
    expect(cReference?.symbols.some((symbol) => symbol.name === "demo_add")).toBe(true);
    expect(
      cReference?.symbols.some(
        (symbol) => symbol.kind === "enum" && symbol.enumValues.length === 2,
      ),
    ).toBe(true);
    expect(
      cReference?.symbols.every(
        (symbol) => !symbol.location || symbol.location.path.startsWith("packages/c/"),
      ),
    ).toBe(true);

    expect(cppReference?.inputPaths).toEqual([
      "packages/cpp/widget.cpp",
      "packages/cpp/widget.hpp",
    ]);
    expect(cppReference?.symbols.some((symbol) => symbol.qualifiedName.includes("Widget"))).toBe(
      true,
    );
    const widget = cppReference?.symbols.find(
      (symbol) => symbol.qualifiedName === "fixture::Widget" && symbol.kind === "class",
    );
    const value = cppReference?.symbols.find(
      (symbol) => symbol.qualifiedName === "fixture::Widget::value",
    );
    const instances = cppReference?.symbols.find(
      (symbol) => symbol.qualifiedName === "fixture::Widget::instances",
    );
    expect(widget?.parentId).toBe(
      cppReference?.symbols.find((symbol) => symbol.qualifiedName === "fixture")?.id,
    );
    expect(value?.member).toEqual({
      access: "public",
      static: false,
      virtual: "virtual",
      const: true,
    });
    expect(instances?.member).toEqual({
      access: "public",
      static: true,
      virtual: "none",
      const: false,
    });
    expect(
      cppReference?.inheritanceRelations
        .filter((relation) => relation.derivedId === widget?.id)
        .map((relation) => ({
          base: relation.baseQualifiedName,
          access: relation.access,
          virtual: relation.virtual,
        })),
    ).toEqual([
      { base: "fixture::Identified", access: "protected", virtual: false },
      { base: "fixture::ValueProvider", access: "public", virtual: true },
    ]);
    expect(
      cppReference?.symbols.find(
        (symbol) => symbol.qualifiedName === "fixture::ValueProvider::value",
      )?.member?.virtual,
    ).toBe("pure");
    expect(headerReference?.symbols.some((symbol) => symbol.name === "square")).toBe(true);
    expect(
      emptyReference?.symbols
        .filter((symbol) => symbol.kind !== "file")
        .map((symbol) => ({ kind: symbol.kind, name: symbol.name, signature: symbol.signature })),
    ).toEqual([]);
    expect(emptyReference?.status).toBe("empty");
    expect(emptyReference?.warnings[0]?.code).toBe("API_SYMBOLS_MISSING");
    expect(sparseReference?.status).toBe("sparse");
    expect(sparseReference?.warnings[0]?.code).toBe("API_DOCUMENTATION_SPARSE");

    const revisionOnlyChange = await generateModuleApiCatalog({
      ...options,
      module: {
        ...fixture.module,
        sha: "0123456789abcdef0123456789abcdef01234567",
        shortSha: "0123456789ab",
      },
    });
    expect(serializeApiCatalog(revisionOnlyChange)).toBe(serializeApiCatalog(first));
  });

  test("treats a missing executable as a reproducibility gate", async () => {
    const fixture = await createDoxygenRepository();
    expect(
      generateModuleApiCatalog({
        ...fixture,
        executable: "missing-wtr-doxygen-executable",
      }),
    ).rejects.toMatchObject({ code: "DOXYGEN_TOOL_UNAVAILABLE" });
  });

  test("rejects a Doxygen version that differs from the repository lock", async () => {
    const fixture = await createDoxygenRepository();
    await writeFile(path.join(fixture.repositoryRoot, ".doxygen-version"), "0.0.0\n", "utf8");
    expect(generateModuleApiCatalog(fixture)).rejects.toMatchObject({
      code: "DOXYGEN_VERSION_MISMATCH",
      context: { expectedVersion: "0.0.0" },
    });
  });

  test("accepts the official release commit suffix", async () => {
    const fixture = await createDoxygenRepository();
    const executable = path.join(fixture.repositoryRoot, "fixture-doxygen");
    await writeFile(
      executable,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then\n  echo "1.16.1 (c2fe5c3e4986974eb2a97608b24086683502f07f)"\n  exit 0\nfi\nexit 7\n',
      "utf8",
    );
    await chmod(executable, 0o755);

    const catalog = await generateModuleApiCatalog({ ...fixture, executable });
    expect(catalog.doxygenVersion).toBe("1.16.1");
    expect(catalog.references.every((reference) => reference.status === "failed")).toBe(true);
  });

  test("isolates invocation failures to each package reference", async () => {
    const fixture = await createDoxygenRepository();
    const executable = path.join(fixture.repositoryRoot, "fixture-doxygen");
    await writeFile(
      executable,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then\n  echo 1.16.1\n  exit 0\nfi\nexit 7\n',
      "utf8",
    );
    await chmod(executable, 0o755);

    const catalog = await generateModuleApiCatalog({ ...fixture, executable });
    expect(catalog.references).toHaveLength(5);
    expect(catalog.references.every((reference) => reference.status === "failed")).toBe(true);
    expect(
      catalog.references.every(
        (reference) => reference.warnings[0]?.code === "DOXYGEN_PROCESS_FAILED",
      ),
    ).toBe(true);
  });
});
