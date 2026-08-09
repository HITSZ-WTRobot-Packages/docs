import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, test } from "bun:test";
import { simpleGit } from "simple-git";
import { glob } from "tinyglobby";

import { synchronize } from "../../scripts/sync/synchronizer";
import type { ModuleConfig } from "../../src/lib/sources/modules";

const fixtureRoot = path.resolve(import.meta.dirname, "../fixtures/sync-module");
const temporaryRoots: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryRoots.push(directory);
  return directory;
}

async function createFixtureRepository(): Promise<string> {
  const repository = await temporaryDirectory("wtr-docs-upstream-");
  await cp(fixtureRoot, repository, { recursive: true });
  const git = simpleGit(repository);
  await git.init(false, { "--initial-branch": "main" });
  await git.addConfig("user.name", "WTR Docs Tests");
  await git.addConfig("user.email", "docs-tests@example.invalid");
  await git.add(".");
  await git.commit("fixture: initial snapshot");
  return repository;
}

function fixtureModule(id: string, repository: string): ModuleConfig {
  return {
    id,
    displayName: id,
    repository: pathToFileURL(repository).href,
    branch: "main",
  };
}

async function treeDigest(root: string): Promise<string> {
  const paths = (
    await glob("**/*", { cwd: root, onlyFiles: true, dot: true, followSymbolicLinks: false })
  ).sort();
  const digest = createHash("sha256");
  for (const relativePath of paths) {
    digest.update(relativePath);
    digest.update(await readFile(path.join(root, ...relativePath.split("/"))));
  }
  return digest.digest("hex");
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

describe("source synchronizer", () => {
  test("full sync selects the documented closure and is idempotent", async () => {
    const upstream = await createFixtureRepository();
    const repositoryRoot = await temporaryDirectory("wtr-docs-project-");
    const modules = [
      fixtureModule("FixtureModule", upstream),
      fixtureModule("SecondModule", upstream),
    ];

    const first = await synchronize({ mode: "all", dryRun: false }, { repositoryRoot, modules });
    expect(first.changed).toBe(2);

    const manifest = await Bun.file(path.join(repositoryRoot, "sources/manifest.json")).json();
    expect(manifest.modules).toHaveLength(2);
    const filePaths = manifest.modules[0].files.map((file: { path: string }) => file.path);
    expect(filePaths).toContain("README.md");
    expect(filePaths).toContain("docs/guide.md");
    expect(filePaths).toContain("assets/diagram.txt");
    expect(filePaths).toContain("assets/raw.svg");
    expect(filePaths).toContain("attachments/pinout.pdf");
    expect(filePaths).toContain("packages/Demo/cpkg.toml");
    expect(filePaths).toContain("include/demo.hpp");
    expect(filePaths).toContain("src/demo.cpp");
    expect(filePaths).toContain("LICENSE");
    expect(filePaths).not.toContain("ignored.txt");

    const sourcesRoot = path.join(repositoryRoot, "sources");
    const before = await treeDigest(sourcesRoot);
    const second = await synchronize({ mode: "all", dryRun: false }, { repositoryRoot, modules });
    expect(second.changed).toBe(0);
    expect(second.unchanged).toBe(2);
    expect(await treeDigest(sourcesRoot)).toBe(before);
  });

  test("supports one-module and changed-only synchronization", async () => {
    const upstream = await createFixtureRepository();
    const repositoryRoot = await temporaryDirectory("wtr-docs-project-");
    const modules = [
      fixtureModule("FixtureModule", upstream),
      fixtureModule("SecondModule", upstream),
    ];

    const one = await synchronize(
      { mode: "module", module: "fixturemodule", dryRun: false },
      { repositoryRoot, modules },
    );
    expect(one.modules.map((module) => module.id)).toEqual(["FixtureModule"]);

    const changed = await synchronize(
      { mode: "changed", dryRun: false },
      { repositoryRoot, modules },
    );
    expect(changed.skipped).toBe(1);
    expect(changed.changed).toBe(1);
    expect(changed.modules.find((module) => module.id === "FixtureModule")?.status).toBe("skipped");
    expect(changed.modules.find((module) => module.id === "SecondModule")?.status).toBe("changed");
  });

  test("dry-run validates candidates without writing repository files", async () => {
    const upstream = await createFixtureRepository();
    const repositoryRoot = await temporaryDirectory("wtr-docs-project-");

    const result = await synchronize(
      { mode: "all", dryRun: true },
      { repositoryRoot, modules: [fixtureModule("FixtureModule", upstream)] },
    );
    expect(result.modules[0]?.status).toBe("would-change");
    expect(await Bun.file(path.join(repositoryRoot, "sources/manifest.json")).exists()).toBe(false);
  });

  test("a failed update preserves the last successful snapshot", async () => {
    const upstream = await createFixtureRepository();
    const repositoryRoot = await temporaryDirectory("wtr-docs-project-");
    const modules = [fixtureModule("FixtureModule", upstream)];
    await synchronize({ mode: "all", dryRun: false }, { repositoryRoot, modules });

    const sourcesRoot = path.join(repositoryRoot, "sources");
    const before = await treeDigest(sourcesRoot);
    await writeFile(
      path.join(upstream, "README.md"),
      "# Invalid\n\n[escape](../secret.md)\n",
      "utf8",
    );
    const git = simpleGit(upstream);
    await git.add("README.md");
    await git.commit("fixture: add escaping reference");

    expect(
      await captureRejection(
        synchronize({ mode: "all", dryRun: false }, { repositoryRoot, modules }),
      ),
    ).toMatchObject({ code: "SNAPSHOT_REFERENCE_ESCAPE" });
    expect(await treeDigest(sourcesRoot)).toBe(before);
  });

  test("size validation fails before creating a snapshot", async () => {
    const upstream = await createFixtureRepository();
    const repositoryRoot = await temporaryDirectory("wtr-docs-project-");
    await mkdir(repositoryRoot, { recursive: true });

    expect(
      await captureRejection(
        synchronize(
          { mode: "all", dryRun: false },
          {
            repositoryRoot,
            modules: [fixtureModule("FixtureModule", upstream)],
            limits: { maxFileBytes: 8, maxModuleBytes: 128, maxFiles: 100 },
          },
        ),
      ),
    ).toMatchObject({ code: "SNAPSHOT_SIZE_LIMIT" });
    expect(await Bun.file(path.join(repositoryRoot, "sources/manifest.json")).exists()).toBe(false);
  });

  test("snapshots source-only modules with explicit documentation warnings", async () => {
    const upstream = await createFixtureRepository();
    await rm(path.join(upstream, "README.md"));
    await rm(path.join(upstream, "packages/Demo/cpkg.toml"));
    const git = simpleGit(upstream);
    await git.add(["--all"]);
    await git.commit("fixture: remove package metadata and README");

    const repositoryRoot = await temporaryDirectory("wtr-docs-project-");
    const result = await synchronize(
      { mode: "all", dryRun: false },
      { repositoryRoot, modules: [fixtureModule("SourceOnlyModule", upstream)] },
    );

    expect(result.modules[0]?.warnings.map((warning) => warning.code)).toEqual([
      "PACKAGE_MANIFEST_MISSING",
      "README_MISSING",
    ]);
    const manifest = await Bun.file(path.join(repositoryRoot, "sources/manifest.json")).json();
    expect(manifest.modules[0].files.map((file: { path: string }) => file.path)).toContain(
      "src/demo.cpp",
    );
  });
});
