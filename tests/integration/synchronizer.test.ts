import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";
import { simpleGit } from "simple-git";
import { glob } from "tinyglobby";

import { synchronize } from "../../scripts/sync/synchronizer";
import type { GitClient } from "../../scripts/sync/git-client";
import type { ModuleConfig } from "../../src/lib/sources/modules";

const fixtureRoot = path.resolve(import.meta.dirname, "../fixtures/sync-module");
const temporaryRoots: string[] = [];
const localRepositories = new Map<string, string>();

const fixtureGitClient: GitClient = {
  async resolveRevision(module) {
    const repository = localRepositories.get(module.repository);
    if (!repository) throw new Error(`Missing fixture repository: ${module.repository}`);
    return (await simpleGit(repository).revparse(["HEAD"])).trim();
  },
  async clone(module, destination) {
    const repository = localRepositories.get(module.repository);
    if (!repository) throw new Error(`Missing fixture repository: ${module.repository}`);
    await cp(repository, destination, { recursive: true });
    return (await simpleGit(destination).revparse(["HEAD"])).trim();
  },
};

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryRoots.push(directory);
  return directory;
}

async function createFixtureRepository(packageName = "Demo"): Promise<string> {
  const repository = await temporaryDirectory("wtr-docs-upstream-");
  await cp(fixtureRoot, repository, { recursive: true });
  if (packageName !== "Demo") {
    const manifestPath = path.join(repository, "packages/Demo/cpkg.toml");
    await writeFile(
      manifestPath,
      (await readFile(manifestPath, "utf8")).replace(
        'pkgname = "Demo"',
        `pkgname = "${packageName}"`,
      ),
      "utf8",
    );
  }
  const git = simpleGit(repository);
  await git.init(false, { "--initial-branch": "main" });
  await git.addConfig("user.name", "WTR Docs Tests");
  await git.addConfig("user.email", "docs-tests@example.invalid");
  await git.add(".");
  await git.commit("fixture: initial snapshot");
  return repository;
}

async function createProjectRoot(): Promise<string> {
  const repositoryRoot = await temporaryDirectory("wtr-docs-project-");
  await writeFile(
    path.join(repositoryRoot, ".doxygen-version"),
    await readFile(path.resolve(import.meta.dirname, "../../.doxygen-version"), "utf8"),
    "utf8",
  );
  return repositoryRoot;
}

function fixtureModule(id: string, repository: string): ModuleConfig {
  const config = {
    id,
    displayName: id,
    repository: `https://example.invalid/${id}.git`,
    branch: "main",
  };
  localRepositories.set(config.repository, repository);
  return config;
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
  localRepositories.clear();
  await Promise.all(
    temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("source synchronizer", () => {
  test("discovers the first module and uses the manifest for later synchronization", async () => {
    const upstream = await createFixtureRepository();
    const repositoryRoot = await createProjectRoot();
    const discovery = fixtureModule("DiscoveredModule", upstream);

    const first = await synchronize(
      {
        mode: "module",
        module: discovery.id,
        discovery,
        dryRun: false,
      },
      { repositoryRoot, gitClient: fixtureGitClient },
    );
    expect(first.modules.map((module) => module.id)).toEqual(["DiscoveredModule"]);

    const manifest = await Bun.file(path.join(repositoryRoot, "sources/manifest.json")).json();
    expect(manifest.modules.map((module: { id: string }) => module.id)).toEqual([
      "DiscoveredModule",
    ]);

    const changed = await synchronize(
      { mode: "changed", dryRun: false },
      { repositoryRoot, gitClient: fixtureGitClient },
    );
    expect(changed.changed).toBe(0);
    expect(changed.skipped).toBe(1);

    const updatedBranch = {
      ...discovery,
      id: discovery.id.toLocaleLowerCase("en-US"),
      displayName: discovery.displayName.toLocaleLowerCase("en-US"),
      branch: "stable",
    };
    const branchUpdate = await synchronize(
      {
        mode: "module",
        module: updatedBranch.id,
        discovery: updatedBranch,
        dryRun: false,
      },
      { repositoryRoot, gitClient: fixtureGitClient },
    );
    expect(branchUpdate.changed).toBe(1);
    const updatedManifest = await Bun.file(
      path.join(repositoryRoot, "sources/manifest.json"),
    ).json();
    expect(updatedManifest.modules[0].id).toBe("DiscoveredModule");
    expect(updatedManifest.modules[0].branch).toBe("stable");
  });

  test("validates discovery conflicts before touching the persisted index", async () => {
    const upstream = await createFixtureRepository();
    const otherUpstream = await createFixtureRepository("OtherDemo");
    const repositoryRoot = await createProjectRoot();
    const discovery = fixtureModule("DiscoveredModule", upstream);
    await synchronize(
      { mode: "module", module: discovery.id, discovery, dryRun: false },
      { repositoryRoot, gitClient: fixtureGitClient },
    );
    const sourcesRoot = path.join(repositoryRoot, "sources");
    const before = await treeDigest(sourcesRoot);
    const conflictingRepository = fixtureModule("OtherRepository", otherUpstream);
    const conflict = {
      ...conflictingRepository,
      id: "DiscoveredModule",
      displayName: "DiscoveredModule",
    };

    expect(
      await captureRejection(
        synchronize(
          { mode: "module", module: conflict.id, discovery: conflict, dryRun: false },
          { repositoryRoot, gitClient: fixtureGitClient },
        ),
      ),
    ).toMatchObject({ code: "SYNC_MODULE_CONFLICT" });
    expect(await treeDigest(sourcesRoot)).toBe(before);

    expect(
      await captureRejection(
        synchronize(
          { mode: "changed", discovery, dryRun: false },
          { repositoryRoot, gitClient: fixtureGitClient },
        ),
      ),
    ).toMatchObject({ code: "SYNC_DISCOVERY_INVALID" });
    expect(await treeDigest(sourcesRoot)).toBe(before);
  });

  test("full sync selects the documented closure and is idempotent", async () => {
    const upstream = await createFixtureRepository();
    const secondUpstream = await createFixtureRepository("SecondDemo");
    const repositoryRoot = await createProjectRoot();
    const modules = [
      fixtureModule("FixtureModule", upstream),
      fixtureModule("SecondModule", secondUpstream),
    ];

    const first = await synchronize(
      { mode: "all", dryRun: false },
      { repositoryRoot, modules, gitClient: fixtureGitClient },
    );
    expect(first.changed).toBe(2);

    const manifest = await Bun.file(path.join(repositoryRoot, "sources/manifest.json")).json();
    expect(manifest.modules).toHaveLength(2);
    const filePaths = manifest.modules[0].files.map((file: { path: string }) => file.path);
    expect(filePaths).toContain("README.md");
    expect(filePaths).toContain("docs/guide.md");
    expect(filePaths).toContain("assets/diagram.txt");
    expect(filePaths).toContain("assets/raw.svg");
    expect(filePaths).toContain("attachments/pinout.pdf");
    expect(filePaths).not.toContain("packages/Demo/cpkg.toml");
    expect(filePaths).not.toContain("include/demo.hpp");
    expect(filePaths).not.toContain("src/demo.cpp");
    expect(filePaths).toContain("LICENSE");
    expect(filePaths).not.toContain("ignored.txt");
    expect(
      manifest.modules[0].artifacts.map((artifact: { kind: string }) => artifact.kind),
    ).toEqual(["api-catalog", "package-catalog"]);
    expect(
      await glob("modules/**/*.{c,cc,cpp,cxx,h,hh,hpp,hxx,inl,ipp}", {
        cwd: path.join(repositoryRoot, "sources"),
        onlyFiles: true,
      }),
    ).toEqual([]);

    const sourcesRoot = path.join(repositoryRoot, "sources");
    const before = await treeDigest(sourcesRoot);
    const beforeManifest = await readFile(path.join(sourcesRoot, "manifest.json"), "utf8");
    const second = await synchronize(
      { mode: "all", dryRun: false },
      { repositoryRoot, modules, gitClient: fixtureGitClient },
    );
    expect(await readFile(path.join(sourcesRoot, "manifest.json"), "utf8")).toBe(beforeManifest);
    expect(second.changed).toBe(0);
    expect(second.unchanged).toBe(2);
    expect(await treeDigest(sourcesRoot)).toBe(before);
  });

  test("supports one-module and changed-only synchronization", async () => {
    const upstream = await createFixtureRepository();
    const secondUpstream = await createFixtureRepository("SecondDemo");
    const repositoryRoot = await createProjectRoot();
    const modules = [
      fixtureModule("FixtureModule", upstream),
      fixtureModule("SecondModule", secondUpstream),
    ];

    const one = await synchronize(
      { mode: "module", module: "fixturemodule", dryRun: false },
      { repositoryRoot, modules, gitClient: fixtureGitClient },
    );
    expect(one.modules.map((module) => module.id)).toEqual(["FixtureModule"]);

    const changed = await synchronize(
      { mode: "changed", dryRun: false },
      { repositoryRoot, modules, gitClient: fixtureGitClient },
    );
    expect(changed.skipped).toBe(1);
    expect(changed.changed).toBe(1);
    expect(changed.modules.find((module) => module.id === "FixtureModule")?.status).toBe("skipped");
    expect(changed.modules.find((module) => module.id === "SecondModule")?.status).toBe("changed");
  });

  test("changed-only regeneration includes the producer fingerprint", async () => {
    const upstream = await createFixtureRepository();
    const repositoryRoot = await createProjectRoot();
    const modules = [fixtureModule("FixtureModule", upstream)];
    await synchronize(
      { mode: "all", dryRun: false },
      { repositoryRoot, modules, gitClient: fixtureGitClient },
    );
    const manifestPath = path.join(repositoryRoot, "sources/manifest.json");
    const before = await Bun.file(manifestPath).json();

    await mkdir(path.join(repositoryRoot, "scripts/sync"), { recursive: true });
    await writeFile(path.join(repositoryRoot, "scripts/sync/producer-marker.ts"), "export {};\n");
    const regenerated = await synchronize(
      { mode: "changed", dryRun: false },
      { repositoryRoot, modules, gitClient: fixtureGitClient },
    );
    const after = await Bun.file(manifestPath).json();

    expect(regenerated.changed).toBe(1);
    expect(regenerated.skipped).toBe(0);
    expect(after.modules[0].sha).toBe(before.modules[0].sha);
    expect(after.modules[0].producerFingerprint).not.toBe(before.modules[0].producerFingerprint);
  });

  test("dry-run validates candidates without writing repository files", async () => {
    const upstream = await createFixtureRepository();
    const repositoryRoot = await createProjectRoot();

    const discovery = fixtureModule("FixtureModule", upstream);
    const result = await synchronize(
      { mode: "module", module: discovery.id, discovery, dryRun: true },
      { repositoryRoot, gitClient: fixtureGitClient },
    );
    expect(result.modules[0]?.status).toBe("would-change");
    expect(await Bun.file(path.join(repositoryRoot, "sources/manifest.json")).exists()).toBe(false);
  });

  test("a failed update preserves the last successful snapshot", async () => {
    const upstream = await createFixtureRepository();
    const repositoryRoot = await createProjectRoot();
    const modules = [fixtureModule("FixtureModule", upstream)];
    await synchronize(
      { mode: "all", dryRun: false },
      { repositoryRoot, modules, gitClient: fixtureGitClient },
    );

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
        synchronize(
          { mode: "all", dryRun: false },
          { repositoryRoot, modules, gitClient: fixtureGitClient },
        ),
      ),
    ).toMatchObject({ code: "SNAPSHOT_REFERENCE_ESCAPE" });
    expect(await treeDigest(sourcesRoot)).toBe(before);
  });

  test("size validation fails before creating a snapshot", async () => {
    const upstream = await createFixtureRepository();
    const repositoryRoot = await createProjectRoot();
    await mkdir(repositoryRoot, { recursive: true });
    const discovery = fixtureModule("FixtureModule", upstream);

    expect(
      await captureRejection(
        synchronize(
          {
            mode: "module",
            module: discovery.id,
            discovery,
            dryRun: false,
          },
          {
            repositoryRoot,
            gitClient: fixtureGitClient,
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
    await rm(path.join(upstream, "LICENSE"));
    const git = simpleGit(upstream);
    await git.add(["--all"]);
    await git.commit("fixture: remove package metadata and README");

    const repositoryRoot = await createProjectRoot();
    const result = await synchronize(
      { mode: "all", dryRun: false },
      {
        repositoryRoot,
        modules: [fixtureModule("SourceOnlyModule", upstream)],
        gitClient: fixtureGitClient,
      },
    );

    expect(result.modules[0]?.warnings.map((warning) => warning.code)).toEqual([
      "LICENSE_MISSING",
      "PACKAGE_MANIFEST_MISSING",
      "README_MISSING",
    ]);
    const manifest = await Bun.file(path.join(repositoryRoot, "sources/manifest.json")).json();
    expect(manifest.modules[0].files.map((file: { path: string }) => file.path)).not.toContain(
      "src/demo.cpp",
    );
    const api = await Bun.file(
      path.join(repositoryRoot, "sources/modules/SourceOnlyModule/api-catalog.json"),
    ).json();
    expect(api.references[0].inputPaths).toContain("src/demo.cpp");
  });
});
