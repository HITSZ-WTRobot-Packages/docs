import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { serializeApiCatalog } from "../../src/lib/doxygen/generator";
import { loadModuleApiCatalog } from "../../src/lib/doxygen/loader";
import type { ModuleSnapshot } from "../../src/lib/sources/manifest";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const temporaryRoots: string[] = [];

async function createFixture(sourceBranch: string) {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "wtr-docs-api-loader-"));
  temporaryRoots.push(repositoryRoot);
  const sourcesRoot = path.join(repositoryRoot, "sources");
  const moduleRoot = path.join(sourcesRoot, "modules", "Fixture");
  await mkdir(moduleRoot, { recursive: true });
  const contents = serializeApiCatalog({
    formatVersion: 3,
    doxygenVersion: "1.16.1",
    references: [
      {
        targetKind: "module",
        targetId: "fixture",
        displayName: "Fixture",
        moduleId: "Fixture",
        packageSlug: null,
        sourceBranch,
        inputPaths: [],
        status: "empty",
        warnings: [],
        symbols: [],
        inheritanceRelations: [],
        symbolCount: 0,
        documentedSymbolCount: 0,
      },
    ],
  });
  await writeFile(path.join(moduleRoot, "api-catalog.json"), contents, "utf8");
  const apiArtifact = {
    path: "api-catalog.json" as const,
    bytes: Buffer.byteLength(contents),
    sha256: createHash("sha256").update(contents).digest("hex"),
    kind: "api-catalog" as const,
  };
  const module: ModuleSnapshot = {
    id: "Fixture",
    displayName: "Fixture",
    repository: "https://github.com/example/fixture.git",
    branch: "main",
    sha: SHA,
    shortSha: SHA.slice(0, 12),
    producerFingerprint: "f".repeat(64),
    totalBytes: apiArtifact.bytes,
    files: [],
    artifacts: [
      apiArtifact,
      {
        path: "package-catalog.json",
        bytes: 0,
        sha256: "0".repeat(64),
        kind: "package-catalog",
      },
    ],
    references: [],
    licenseFiles: [],
    warnings: [],
  };
  return { sourcesRoot, module };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("persisted Doxygen API loading", () => {
  test("accepts API source metadata for the configured branch", async () => {
    const fixture = await createFixture("main");
    const catalog = await loadModuleApiCatalog(fixture.sourcesRoot, fixture.module);
    expect(catalog.references[0]?.sourceBranch).toBe("main");
  });

  test("rejects API source metadata for another branch", async () => {
    const fixture = await createFixture("develop");
    expect(loadModuleApiCatalog(fixture.sourcesRoot, fixture.module)).rejects.toMatchObject({
      code: "DOXYGEN_XML_INVALID",
    });
  });
});
