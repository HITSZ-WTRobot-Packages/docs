import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { serializeModulePackageCatalog } from "../../src/lib/catalog/catalog";
import {
  loadDocumentationBundle,
  serializeDocumentationBundle,
} from "../../src/lib/markdown/documentation";
import { loadDocumentationResource } from "../../src/lib/markdown/resources";
import {
  serializeSourceManifest,
  type SnapshotFileKind,
  type SourceManifest,
} from "../../src/lib/sources/manifest";

const temporaryRoots: string[] = [];
const SHA = "1234567890abcdef1234567890abcdef12345678";

type FixtureFile = {
  path: string;
  contents: string;
  kind: SnapshotFileKind;
};

const moduleReadme = `
# Overview

[Guide](./docs/guide.md#Details)
![Diagram](./assets/diagram.svg)
[Manual](./attachments/manual.pdf)
[Source](./include/demo.hpp#L1)
[External](https://example.com/reference)

<a href="javascript:alert(1)" onclick="alert(1)">Unsafe link</a>
<script>alert("unsafe")</script>
`;

async function createDocumentationFixture(readme = moduleReadme): Promise<string> {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "wtr-docs-documentation-"));
  temporaryRoots.push(repositoryRoot);
  const moduleRoot = path.join(repositoryRoot, "sources/modules/FixtureModule");
  const contentRoot = path.join(moduleRoot, "content");
  const files: FixtureFile[] = [
    { path: "README.md", contents: readme, kind: "readme" },
    {
      path: "docs/guide.md",
      contents:
        '# Details\n\n[Back](../README.md#Overview)\n<img src="../assets/diagram.svg" onerror="alert(1)">\n',
      kind: "markdown",
    },
    {
      path: "assets/diagram.svg",
      contents: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>\n',
      kind: "asset",
    },
    { path: "attachments/manual.pdf", contents: "%PDF-fixture\n", kind: "asset" },
  ];

  const snapshotFiles = [];
  let totalBytes = 0;
  for (const file of files) {
    const destination = path.join(contentRoot, ...file.path.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.contents, "utf8");
    const bytes = Buffer.byteLength(file.contents);
    totalBytes += bytes;
    snapshotFiles.push({
      path: file.path,
      bytes,
      sha256: createHash("sha256").update(file.contents).digest("hex"),
      kind: file.kind,
    });
  }

  const packageContents = serializeModulePackageCatalog({
    formatVersion: 1,
    moduleId: "FixtureModule",
    moduleSha: SHA,
    packages: [
      {
        name: "Demo",
        pkgname: "Fixture::Demo",
        version: "0.1.0",
        manifestPath: "packages/Demo/cpkg.toml",
        packagePath: "packages/Demo",
        dependencyNames: ["FreeRTOS"],
      },
    ],
  });
  const apiContents =
    '{\n  "formatVersion": 2,\n  "doxygenVersion": "1.16.1",\n  "references": []\n}\n';
  await writeFile(path.join(moduleRoot, "package-catalog.json"), packageContents, "utf8");
  await writeFile(path.join(moduleRoot, "api-catalog.json"), apiContents, "utf8");
  const artifacts = [
    {
      path: "api-catalog.json" as const,
      bytes: Buffer.byteLength(apiContents),
      sha256: createHash("sha256").update(apiContents).digest("hex"),
      kind: "api-catalog" as const,
    },
    {
      path: "package-catalog.json" as const,
      bytes: Buffer.byteLength(packageContents),
      sha256: createHash("sha256").update(packageContents).digest("hex"),
      kind: "package-catalog" as const,
    },
  ];
  totalBytes += artifacts.reduce((total, artifact) => total + artifact.bytes, 0);

  const manifest: SourceManifest = {
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
        totalBytes,
        files: snapshotFiles,
        artifacts,
        references: [{ path: "include/demo.hpp" }],
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

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject.");
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("README documentation generation", () => {
  test("rewrites pages and resources under a nested base while sanitizing HTML", async () => {
    const repositoryRoot = await createDocumentationFixture();
    const bundle = await loadDocumentationBundle({
      repositoryRoot,
      basePath: "/products/wtr/docs/",
    });

    expect(bundle.pages).toHaveLength(3);
    expect(bundle.resources).toHaveLength(2);
    const modulePage = bundle.pages.find((page) => page.kind === "module");
    const packagePage = bundle.pages.find((page) => page.kind === "package");
    const supplementalPage = bundle.pages.find((page) => page.kind === "supplemental");
    expect(modulePage?.html).toContain(
      'href="/products/wtr/docs/modules/fixturemodule/supplemental/docs/guide/#wtr-details"',
    );
    expect(modulePage?.html).toContain(
      'src="/products/wtr/docs/resources/fixturemodule/1234567890ab/assets/diagram.svg"',
    );
    expect(modulePage?.html).toContain(
      'href="/products/wtr/docs/resources/fixturemodule/1234567890ab/attachments/manual.pdf"',
    );
    expect(modulePage?.html).toContain('href="https://example.com/reference"');
    expect(modulePage?.html).toContain(
      `href="https://github.com/example/fixture/blob/${SHA}/include/demo.hpp#L1"`,
    );
    expect(modulePage?.html).not.toContain("javascript:");
    expect(modulePage?.html).not.toContain("onclick");
    expect(modulePage?.html).not.toContain("<script");
    expect(supplementalPage?.html).toContain(
      'href="/products/wtr/docs/modules/fixturemodule/#wtr-overview"',
    );
    expect(supplementalPage?.html).toContain('id="wtr-details"');
    expect(packagePage?.source).toMatchObject({
      kind: "generated",
      reason: "PACKAGE_README_MISSING",
    });
    expect(packagePage?.html).toContain("Fixture::Demo");
    expect(packagePage?.html).toContain("0.1.0+1234567890ab");
    expect(packagePage?.html).toContain("同步快照中没有此软件包的 README。");
    expect(packagePage?.html).toContain("依赖项");
    expect(serializeDocumentationBundle(JSON.parse(serializeDocumentationBundle(bundle)))).toBe(
      serializeDocumentationBundle(bundle),
    );
  });

  test("serves verified resources with stable media metadata", async () => {
    const repositoryRoot = await createDocumentationFixture();
    const bundle = await loadDocumentationBundle({ repositoryRoot, basePath: "/" });
    expect(bundle.resources[0]?.route.startsWith("/resources/")).toBe(true);

    const resource = await loadDocumentationResource(
      repositoryRoot,
      "FixtureModule",
      "assets/diagram.svg",
    );
    expect(resource.mediaType).toBe("image/svg+xml");
    expect(resource.contents.toString("utf8")).toContain("<svg");
    expect(resource.sha256).toHaveLength(64);
  });

  test("rejects broken and escaping local references with stable diagnostics", async () => {
    const missingRoot = await createDocumentationFixture(
      "# Broken\n\n[Missing](./docs/missing.md)\n",
    );
    expect(
      await captureRejection(
        loadDocumentationBundle({ repositoryRoot: missingRoot, basePath: "/" }),
      ),
    ).toMatchObject({ code: "DOCUMENT_REFERENCE_MISSING" });

    const escapingRoot = await createDocumentationFixture("# Broken\n\n[Escape](../outside.md)\n");
    expect(
      await captureRejection(
        loadDocumentationBundle({ repositoryRoot: escapingRoot, basePath: "/" }),
      ),
    ).toMatchObject({ code: "SNAPSHOT_REFERENCE_ESCAPE" });
  });
});
