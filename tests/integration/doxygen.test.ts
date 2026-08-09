import { createHash } from "node:crypto";
import { chmod, cp, exists, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";
import { glob } from "tinyglobby";

import { loadApiCatalog, serializeApiCatalog } from "../../src/lib/doxygen/generator";
import { serializeSourceManifest, type SourceManifest } from "../../src/lib/sources/manifest";

const SHA = "abcdef1234567890abcdef1234567890abcdef12";
const temporaryRoots: string[] = [];

async function createDoxygenRepository(): Promise<string> {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "wtr-docs-api-"));
  temporaryRoots.push(repositoryRoot);
  const fixtureRoot = path.resolve(import.meta.dirname, "../fixtures/doxygen");
  const moduleRoot = path.join(repositoryRoot, "sources/modules/FixtureModule");
  await mkdir(moduleRoot, { recursive: true });
  await cp(fixtureRoot, moduleRoot, { recursive: true });
  await writeFile(
    path.join(repositoryRoot, ".doxygen-version"),
    await readFile(path.resolve(import.meta.dirname, "../../.doxygen-version"), "utf8"),
    "utf8",
  );

  const paths = await glob(["**/cpkg.toml", "**/*.{c,cpp,h,hpp}"], {
    cwd: moduleRoot,
    onlyFiles: true,
  });
  const files = [];
  let totalBytes = 0;
  for (const filePath of paths.sort()) {
    const contents = await readFile(path.join(moduleRoot, filePath));
    totalBytes += contents.byteLength;
    files.push({
      path: filePath,
      bytes: contents.byteLength,
      sha256: createHash("sha256").update(contents).digest("hex"),
      kind: filePath.endsWith("cpkg.toml") ? ("manifest" as const) : ("source" as const),
    });
  }
  const manifest: SourceManifest = {
    formatVersion: 1,
    modules: [
      {
        id: "FixtureModule",
        displayName: "Fixture Module",
        repository: "https://github.com/example/fixture.git",
        branch: "main",
        sha: SHA,
        shortSha: SHA.slice(0, 12),
        totalBytes,
        files,
        licenseFiles: [],
        warnings: [],
      },
    ],
  };
  await mkdir(path.join(repositoryRoot, "sources"), { recursive: true });
  await writeFile(
    path.join(repositoryRoot, "sources/manifest.json"),
    serializeSourceManifest(manifest),
    "utf8",
  );
  return repositoryRoot;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Doxygen API generation", () => {
  test("normalizes C, C++, compiled, header-only, empty, and sparse package APIs", async () => {
    const repositoryRoot = await createDoxygenRepository();
    const first = await loadApiCatalog({ repositoryRoot });
    const second = await loadApiCatalog({ repositoryRoot });

    expect(first.references).toHaveLength(5);
    expect(await exists(path.join(repositoryRoot, "html"))).toBe(false);
    expect(await exists(path.join(repositoryRoot, "latex"))).toBe(false);
    expect(serializeApiCatalog(second)).toBe(serializeApiCatalog(first));
    expect(first.references.every((reference) => reference.moduleSha === SHA)).toBe(true);
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
  });

  test("treats a missing executable as a reproducibility gate", async () => {
    const repositoryRoot = await createDoxygenRepository();
    expect(
      loadApiCatalog({ repositoryRoot, executable: "missing-wtr-doxygen-executable" }),
    ).rejects.toMatchObject({ code: "DOXYGEN_TOOL_UNAVAILABLE" });
  });

  test("rejects a Doxygen version that differs from the repository lock", async () => {
    const repositoryRoot = await createDoxygenRepository();
    await writeFile(path.join(repositoryRoot, ".doxygen-version"), "0.0.0\n", "utf8");
    expect(loadApiCatalog({ repositoryRoot })).rejects.toMatchObject({
      code: "DOXYGEN_VERSION_MISMATCH",
      context: { expectedVersion: "0.0.0" },
    });
  });

  test("isolates invocation failures to each package reference", async () => {
    const repositoryRoot = await createDoxygenRepository();
    const executable = path.join(repositoryRoot, "fixture-doxygen");
    await writeFile(
      executable,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then\n  echo 1.16.1\n  exit 0\nfi\nexit 7\n',
      "utf8",
    );
    await chmod(executable, 0o755);

    const catalog = await loadApiCatalog({ repositoryRoot, executable });
    expect(catalog.references).toHaveLength(5);
    expect(catalog.references.every((reference) => reference.status === "failed")).toBe(true);
    expect(
      catalog.references.every(
        (reference) => reference.warnings[0]?.code === "DOXYGEN_PROCESS_FAILED",
      ),
    ).toBe(true);
  });
});
