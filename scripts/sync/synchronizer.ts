import { createHash, randomUUID } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { glob } from "tinyglobby";

import {
  buildModulePackageCatalog,
  buildPackageCatalogFromModules,
  serializeModulePackageCatalog,
  type CpkgDocument,
} from "../../src/lib/catalog/catalog";
import { loadModulePackageCatalog } from "../../src/lib/catalog/loader";
import type { ModulePackageCatalog, PackageCatalog } from "../../src/lib/catalog/schema";
import {
  assertDoxygenVersion,
  generateModuleApiCatalog,
  serializeApiCatalog,
} from "../../src/lib/doxygen/generator";
import { loadModuleApiCatalog } from "../../src/lib/doxygen/loader";
import { ApiCatalogSchema, type ApiCatalog } from "../../src/lib/doxygen/schema";
import {
  copySnapshotFiles,
  DEFAULT_SNAPSHOT_LIMITS,
  discoverSnapshotFiles,
  type SelectionResult,
  type SnapshotLimits,
} from "../../src/lib/sources/file-selection";
import {
  ModuleSnapshotSchema,
  normalizeSourceManifest,
  readSourceManifest,
  serializeSourceManifest,
  type ModuleSnapshot,
  type SnapshotArtifact,
  type SnapshotArtifactKind,
  type SourceManifest,
} from "../../src/lib/sources/manifest";
import { findModule, MODULES, type ModuleConfig } from "../../src/lib/sources/modules";
import { SyncDiagnostic, toSyncDiagnostic } from "../../src/lib/sources/diagnostic";
import { SimpleGitClient, type GitClient } from "./git-client";

export type SyncMode = "all" | "changed" | "module";

export type SyncRequest = {
  mode: SyncMode;
  module?: string | undefined;
  dryRun: boolean;
};

export type ModuleSyncStatus = "changed" | "unchanged" | "skipped" | "would-change";

export type ModuleSyncResult = {
  id: string;
  status: ModuleSyncStatus;
  sha: string;
  files: number;
  bytes: number;
  warnings: ModuleSnapshot["warnings"];
};

export type SyncResult = {
  mode: SyncMode;
  dryRun: boolean;
  modules: ModuleSyncResult[];
  changed: number;
  unchanged: number;
  skipped: number;
};

export type SynchronizerOptions = {
  repositoryRoot?: string;
  modules?: readonly ModuleConfig[];
  gitClient?: GitClient;
  limits?: SnapshotLimits;
  doxygenExecutable?: string;
};

type CandidateSnapshot = {
  module: ModuleConfig;
  cloneRoot: string;
  root: string;
  selection: SelectionResult;
  snapshot: ModuleSnapshot;
  packageCatalog: ModulePackageCatalog;
  apiCatalog?: ApiCatalog;
  changed: boolean;
};

const PRODUCER_INPUT_PATTERNS = [
  ".doxygen-version",
  "scripts/sync/**/*.ts",
  "src/lib/catalog/**/*.ts",
  "src/lib/doxygen/**/*.ts",
  "src/lib/markdown/**/*.ts",
  "src/lib/sources/**/*.ts",
];

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function moduleEquals(left: ModuleSnapshot | undefined, right: ModuleSnapshot): boolean {
  return left !== undefined && JSON.stringify(left) === JSON.stringify(right);
}

function toNativePath(root: string, relativePath: string): string {
  return path.join(root, ...relativePath.split("/"));
}

function artifactPath(kind: SnapshotArtifactKind): SnapshotArtifact["path"] {
  return `${kind}.json`;
}

function placeholderArtifact(kind: SnapshotArtifactKind): SnapshotArtifact {
  return { kind, path: artifactPath(kind), bytes: 0, sha256: "0".repeat(64) };
}

function replaceArtifact(snapshot: ModuleSnapshot, artifact: SnapshotArtifact): ModuleSnapshot {
  const artifacts = snapshot.artifacts.map((entry) =>
    entry.kind === artifact.kind ? artifact : entry,
  );
  return ModuleSnapshotSchema.parse({
    ...snapshot,
    artifacts,
    totalBytes:
      snapshot.files.reduce((total, file) => total + file.bytes, 0) +
      artifacts.reduce((total, entry) => total + entry.bytes, 0),
  });
}

async function writeArtifact(options: {
  candidateRoot: string;
  kind: SnapshotArtifactKind;
  contents: string;
  limits: SnapshotLimits;
}): Promise<SnapshotArtifact> {
  const bytes = Buffer.byteLength(options.contents);
  if (bytes > options.limits.maxFileBytes) {
    throw new SyncDiagnostic(
      "SNAPSHOT_SIZE_LIMIT",
      `${options.kind} artifact exceeds ${options.limits.maxFileBytes} bytes.`,
    );
  }
  const artifact: SnapshotArtifact = {
    kind: options.kind,
    path: artifactPath(options.kind),
    bytes,
    sha256: createHash("sha256").update(options.contents).digest("hex"),
  };
  await writeFile(path.join(options.candidateRoot, artifact.path), options.contents, "utf8");
  return artifact;
}

async function producerFingerprint(
  repositoryRoot: string,
  doxygenVersion: string,
): Promise<string> {
  const paths = (
    await glob(PRODUCER_INPUT_PATTERNS, {
      cwd: repositoryRoot,
      onlyFiles: true,
      dot: true,
      followSymbolicLinks: false,
    })
  ).sort(compareStrings);
  const digest = createHash("sha256").update(`doxygen:${doxygenVersion}\0`);
  for (const relativePath of paths) {
    digest
      .update(relativePath)
      .update("\0")
      .update(await readFile(path.join(repositoryRoot, relativePath)));
  }
  return digest.digest("hex");
}

async function currentSnapshotMatches(
  sourcesRoot: string,
  snapshot: ModuleSnapshot,
): Promise<boolean> {
  const moduleRoot = path.join(sourcesRoot, "modules", snapshot.id);
  try {
    if (!(await lstat(moduleRoot)).isDirectory()) return false;
  } catch {
    return false;
  }

  const currentPaths = (
    await glob("**/*", {
      cwd: moduleRoot,
      onlyFiles: true,
      dot: true,
      followSymbolicLinks: false,
    })
  ).sort(compareStrings);
  const expected = [
    ...snapshot.files.map((file) => ({ ...file, storedPath: `content/${file.path}` })),
    ...snapshot.artifacts.map((artifact) => ({ ...artifact, storedPath: artifact.path })),
  ].sort((left, right) => compareStrings(left.storedPath, right.storedPath));
  if (JSON.stringify(currentPaths) !== JSON.stringify(expected.map((entry) => entry.storedPath))) {
    return false;
  }

  for (const file of expected) {
    const nativePath = toNativePath(moduleRoot, file.storedPath);
    const stats = await lstat(nativePath);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size !== file.bytes) return false;
    const digest = createHash("sha256")
      .update(await readFile(nativePath))
      .digest("hex");
    if (digest !== file.sha256) return false;
  }
  return true;
}

function mergeManifest(
  existing: SourceManifest,
  candidates: readonly CandidateSnapshot[],
  request: SyncRequest,
): SourceManifest {
  if (request.mode === "all") {
    return normalizeSourceManifest({
      formatVersion: 2,
      modules: candidates.map((candidate) => candidate.snapshot),
    });
  }
  const replacements = new Map(
    candidates.map((candidate) => [candidate.module.id, candidate.snapshot]),
  );
  return normalizeSourceManifest({
    formatVersion: 2,
    modules: existing.modules
      .filter((module) => !replacements.has(module.id))
      .concat([...replacements.values()]),
  });
}

async function commitCandidates(
  sourcesRoot: string,
  candidates: readonly CandidateSnapshot[],
  manifest: SourceManifest,
): Promise<void> {
  const changedCandidates = candidates.filter((candidate) => candidate.changed);
  if (changedCandidates.length === 0) return;

  const transactionParent = path.join(sourcesRoot, ".sync-tmp");
  const transactionRoot = path.join(transactionParent, randomUUID());
  const stagedRoot = path.join(transactionRoot, "candidates");
  const backupRoot = path.join(transactionRoot, "backups");
  const modulesRoot = path.join(sourcesRoot, "modules");
  const manifestPath = path.join(sourcesRoot, "manifest.json");
  const stagedManifestPath = path.join(transactionRoot, "manifest.json");
  const backupManifestPath = path.join(transactionRoot, "manifest.backup.json");

  await mkdir(stagedRoot, { recursive: true });
  await mkdir(backupRoot, { recursive: true });
  await mkdir(modulesRoot, { recursive: true });

  try {
    for (const candidate of changedCandidates) {
      await cp(candidate.root, path.join(stagedRoot, candidate.module.id), {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
    }
    await writeFile(stagedManifestPath, serializeSourceManifest(manifest), "utf8");

    const swapped: Array<{ target: string; backup: string; hadPrevious: boolean }> = [];
    let manifestInstalled = false;
    let hadManifest = false;
    try {
      for (const candidate of changedCandidates) {
        const target = path.join(modulesRoot, candidate.module.id);
        const backup = path.join(backupRoot, candidate.module.id);
        let hadPrevious = false;
        try {
          await lstat(target);
          hadPrevious = true;
          await rename(target, backup);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        swapped.push({ target, backup, hadPrevious });
        await rename(path.join(stagedRoot, candidate.module.id), target);
      }

      try {
        await lstat(manifestPath);
        hadManifest = true;
        await rename(manifestPath, backupManifestPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await rename(stagedManifestPath, manifestPath);
      manifestInstalled = true;
    } catch (error) {
      if (manifestInstalled) await rm(manifestPath, { force: true });
      if (hadManifest) await rename(backupManifestPath, manifestPath);
      for (const swap of swapped.reverse()) {
        await rm(swap.target, { recursive: true, force: true });
        if (swap.hadPrevious) await rename(swap.backup, swap.target);
      }
      throw error;
    }
  } finally {
    await rm(transactionRoot, { recursive: true, force: true });
    try {
      await rmdir(transactionParent);
    } catch {
      // Another synchronization or leftover transaction still owns the parent.
    }
  }
}

function selectModules(
  request: SyncRequest,
  modules: readonly ModuleConfig[],
): readonly ModuleConfig[] {
  if (request.mode !== "module") return modules;
  if (!request.module) {
    throw new SyncDiagnostic("CLI_INVALID_ARGUMENT", "Module mode requires --module <name>.");
  }
  const selected = findModule(modules, request.module);
  if (!selected) {
    throw new SyncDiagnostic("CLI_UNKNOWN_MODULE", `Unknown module: ${request.module}`, {
      hint: `Choose one of: ${modules.map((module) => module.id).join(", ")}`,
    });
  }
  return [selected];
}

async function readPackageDocuments(
  cloneRoot: string,
  moduleId: string,
  selection: SelectionResult,
): Promise<CpkgDocument[]> {
  return Promise.all(
    selection.packageManifestPaths.map(async (filePath) => ({
      moduleId,
      filePath,
      contents: await readFile(toNativePath(cloneRoot, filePath), "utf8"),
    })),
  );
}

async function collectModulePackageCatalogs(
  sourcesRoot: string,
  manifest: SourceManifest,
  candidates: readonly CandidateSnapshot[],
): Promise<ModulePackageCatalog[]> {
  const byId = new Map(candidates.map((candidate) => [candidate.module.id, candidate]));
  return Promise.all(
    manifest.modules.map(async (module) => {
      const candidate = byId.get(module.id);
      return candidate?.packageCatalog ?? loadModulePackageCatalog(sourcesRoot, module);
    }),
  );
}

async function collectModuleApiCatalogs(
  sourcesRoot: string,
  manifest: SourceManifest,
  candidates: readonly CandidateSnapshot[],
): Promise<ApiCatalog[]> {
  const byId = new Map(candidates.map((candidate) => [candidate.module.id, candidate]));
  return Promise.all(
    manifest.modules.map(async (module) => {
      const candidate = byId.get(module.id);
      return candidate?.apiCatalog ?? loadModuleApiCatalog(sourcesRoot, module);
    }),
  );
}

function validateApiCatalogs(
  manifest: SourceManifest,
  packageCatalog: PackageCatalog,
  moduleCatalogs: readonly ApiCatalog[],
  doxygenVersion: string,
): void {
  const references = ApiCatalogSchema.parse({
    formatVersion: 1,
    doxygenVersion,
    references: moduleCatalogs.flatMap((catalog) => {
      if (catalog.doxygenVersion !== doxygenVersion) {
        throw new SyncDiagnostic(
          "DOXYGEN_VERSION_MISMATCH",
          `Module API data uses Doxygen ${catalog.doxygenVersion}; expected ${doxygenVersion}.`,
        );
      }
      return catalog.references;
    }),
  }).references;
  const moduleById = new Map(manifest.modules.map((module) => [module.id, module]));
  const targetKeys = new Set<string>();
  for (const reference of references) {
    const module = moduleById.get(reference.moduleId);
    const key = `${reference.targetKind}:${reference.targetId}`;
    if (!module || module.sha !== reference.moduleSha || targetKeys.has(key)) {
      throw new SyncDiagnostic(
        "DOXYGEN_OUTPUT_INVALID",
        `API reference does not match the synchronized module graph: ${key}.`,
        { module: reference.moduleId },
      );
    }
    targetKeys.add(key);
  }
  for (const entry of packageCatalog.packages) {
    if (!targetKeys.has(`package:${entry.slug}`)) {
      throw new SyncDiagnostic(
        "DOXYGEN_OUTPUT_INVALID",
        `Package API reference is missing: ${entry.pkgname}.`,
        { module: entry.moduleId },
      );
    }
  }
}

export async function synchronize(
  request: SyncRequest,
  options: SynchronizerOptions = {},
): Promise<SyncResult> {
  const repositoryRoot = path.resolve(
    options.repositoryRoot ?? path.join(import.meta.dirname, "../.."),
  );
  const sourcesRoot = path.join(repositoryRoot, "sources");
  const modules = options.modules ?? MODULES;
  const gitClient = options.gitClient ?? new SimpleGitClient();
  const limits = options.limits ?? DEFAULT_SNAPSHOT_LIMITS;
  const executable = options.doxygenExecutable ?? "doxygen";
  const [existingManifest, doxygenVersion] = await Promise.all([
    readSourceManifest(sourcesRoot, { allowLegacyMigration: true }),
    assertDoxygenVersion(repositoryRoot, executable),
  ]);
  const fingerprint = await producerFingerprint(repositoryRoot, doxygenVersion);
  const existingById = new Map(existingManifest.modules.map((module) => [module.id, module]));
  const selectedModules = selectModules(request, modules);
  const runRoot = await mkdtemp(path.join(tmpdir(), "wtr-docs-sync-"));
  const candidates: CandidateSnapshot[] = [];
  const results: ModuleSyncResult[] = [];

  try {
    for (const module of selectedModules) {
      const existing = existingById.get(module.id);
      if (request.mode === "changed") {
        const remoteSha = await gitClient.resolveRevision(module);
        if (
          existing?.sha === remoteSha &&
          existing.producerFingerprint === fingerprint &&
          (await currentSnapshotMatches(sourcesRoot, existing))
        ) {
          results.push({
            id: module.id,
            status: "skipped",
            sha: remoteSha,
            files: existing.files.length,
            bytes: existing.totalBytes,
            warnings: existing.warnings,
          });
          continue;
        }
      }

      const cloneRoot = path.join(runRoot, "clones", module.id);
      const candidateRoot = path.join(runRoot, "candidates", module.id);
      await mkdir(path.dirname(cloneRoot), { recursive: true });
      await mkdir(candidateRoot, { recursive: true });
      const sha = await gitClient.clone(module, cloneRoot);
      const selection = await discoverSnapshotFiles(cloneRoot);
      const content = await copySnapshotFiles({
        cloneRoot,
        candidateRoot,
        selection,
        limits,
      });
      let snapshot: ModuleSnapshot = {
        id: module.id,
        displayName: module.displayName,
        repository: module.repository,
        branch: module.branch,
        sha,
        shortSha: sha.slice(0, 12),
        producerFingerprint: fingerprint,
        totalBytes: content.totalBytes,
        files: content.files,
        artifacts: [placeholderArtifact("api-catalog"), placeholderArtifact("package-catalog")],
        references: selection.references.map((referencePath) => ({ path: referencePath })),
        licenseFiles: content.licenseFiles,
        warnings: selection.warnings,
      };
      const packageCatalog = buildModulePackageCatalog(
        snapshot,
        await readPackageDocuments(cloneRoot, module.id, selection),
      );
      const packageArtifact = await writeArtifact({
        candidateRoot,
        kind: "package-catalog",
        contents: serializeModulePackageCatalog(packageCatalog),
        limits,
      });
      snapshot = replaceArtifact(snapshot, packageArtifact);
      candidates.push({
        module,
        cloneRoot,
        root: candidateRoot,
        selection,
        snapshot,
        packageCatalog,
        changed: false,
      });
    }

    const packageManifest = mergeManifest(existingManifest, candidates, request);
    const modulePackageCatalogs = await collectModulePackageCatalogs(
      sourcesRoot,
      packageManifest,
      candidates,
    );
    const packageCatalog = buildPackageCatalogFromModules(packageManifest, modulePackageCatalogs);

    for (const candidate of candidates) {
      const apiCatalog = await generateModuleApiCatalog({
        repositoryRoot,
        moduleRoot: candidate.cloneRoot,
        module: candidate.snapshot,
        packageCatalog,
        sourcePaths: candidate.selection.sourcePaths,
        executable,
        doxygenVersion,
      });
      const apiArtifact = await writeArtifact({
        candidateRoot: candidate.root,
        kind: "api-catalog",
        contents: serializeApiCatalog(apiCatalog),
        limits,
      });
      candidate.snapshot = replaceArtifact(candidate.snapshot, apiArtifact);
      if (candidate.snapshot.totalBytes > limits.maxModuleBytes) {
        throw new SyncDiagnostic(
          "SNAPSHOT_SIZE_LIMIT",
          `Module snapshot exceeds ${limits.maxModuleBytes} bytes after generated artifacts.`,
          { module: candidate.module.id },
        );
      }
      candidate.apiCatalog = apiCatalog;
      const existing = existingById.get(candidate.module.id);
      candidate.changed =
        !moduleEquals(existing, candidate.snapshot) ||
        !(await currentSnapshotMatches(sourcesRoot, candidate.snapshot));
      results.push({
        id: candidate.module.id,
        status: candidate.changed ? (request.dryRun ? "would-change" : "changed") : "unchanged",
        sha: candidate.snapshot.sha,
        files: candidate.snapshot.files.length,
        bytes: candidate.snapshot.totalBytes,
        warnings: candidate.snapshot.warnings,
      });
    }

    const nextManifest = mergeManifest(existingManifest, candidates, request);
    const moduleApiCatalogs = await collectModuleApiCatalogs(sourcesRoot, nextManifest, candidates);
    validateApiCatalogs(nextManifest, packageCatalog, moduleApiCatalogs, doxygenVersion);
    if (!request.dryRun) await commitCandidates(sourcesRoot, candidates, nextManifest);
  } catch (error) {
    throw toSyncDiagnostic(
      error,
      "SYNC_FAILED",
      "Source synchronization failed before a valid snapshot could be committed.",
    );
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }

  results.sort((left, right) => compareStrings(left.id, right.id));
  return {
    mode: request.mode,
    dryRun: request.dryRun,
    modules: results,
    changed: results.filter(
      (result) => result.status === "changed" || result.status === "would-change",
    ).length,
    unchanged: results.filter((result) => result.status === "unchanged").length,
    skipped: results.filter((result) => result.status === "skipped").length,
  };
}
