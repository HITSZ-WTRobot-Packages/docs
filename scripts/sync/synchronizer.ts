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
  copySnapshotFiles,
  discoverSnapshotFiles,
  type SnapshotLimits,
} from "../../src/lib/sources/file-selection";
import {
  type ModuleSnapshot,
  normalizeSourceManifest,
  readSourceManifest,
  serializeSourceManifest,
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
};

type CandidateSnapshot = {
  module: ModuleConfig;
  root: string;
  snapshot: ModuleSnapshot;
  changed: boolean;
};

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function moduleEquals(left: ModuleSnapshot | undefined, right: ModuleSnapshot): boolean {
  return left !== undefined && JSON.stringify(left) === JSON.stringify(right);
}

function toNativePath(root: string, relativePath: string): string {
  return path.join(root, ...relativePath.split("/"));
}

async function currentSnapshotMatches(
  sourcesRoot: string,
  snapshot: ModuleSnapshot,
): Promise<boolean> {
  const moduleRoot = path.join(sourcesRoot, "modules", snapshot.id);
  try {
    if (!(await lstat(moduleRoot)).isDirectory()) {
      return false;
    }
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
  const expectedPaths = snapshot.files.map((file) => file.path).sort(compareStrings);
  if (JSON.stringify(currentPaths) !== JSON.stringify(expectedPaths)) {
    return false;
  }

  for (const file of snapshot.files) {
    const nativePath = toNativePath(moduleRoot, file.path);
    const stats = await lstat(nativePath);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size !== file.bytes) {
      return false;
    }
    const digest = createHash("sha256")
      .update(await readFile(nativePath))
      .digest("hex");
    if (digest !== file.sha256) {
      return false;
    }
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
      formatVersion: 1,
      modules: candidates.map((candidate) => candidate.snapshot),
    });
  }

  const replacements = new Map(
    candidates.map((candidate) => [candidate.module.id, candidate.snapshot]),
  );
  const modules = existing.modules
    .filter((module) => !replacements.has(module.id))
    .concat([...replacements.values()]);
  return normalizeSourceManifest({ formatVersion: 1, modules });
}

async function commitCandidates(
  sourcesRoot: string,
  candidates: readonly CandidateSnapshot[],
  manifest: SourceManifest,
): Promise<void> {
  const changedCandidates = candidates.filter((candidate) => candidate.changed);
  if (changedCandidates.length === 0) {
    return;
  }

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
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }
        }
        swapped.push({ target, backup, hadPrevious });
        await rename(path.join(stagedRoot, candidate.module.id), target);
      }

      try {
        await lstat(manifestPath);
        hadManifest = true;
        await rename(manifestPath, backupManifestPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
      await rename(stagedManifestPath, manifestPath);
      manifestInstalled = true;
    } catch (error) {
      if (manifestInstalled) {
        await rm(manifestPath, { force: true });
      }
      if (hadManifest) {
        await rename(backupManifestPath, manifestPath);
      }
      for (const swap of swapped.reverse()) {
        await rm(swap.target, { recursive: true, force: true });
        if (swap.hadPrevious) {
          await rename(swap.backup, swap.target);
        }
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
  if (request.mode !== "module") {
    return modules;
  }
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
  const existingManifest = await readSourceManifest(sourcesRoot);
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
        if (existing?.sha === remoteSha && (await currentSnapshotMatches(sourcesRoot, existing))) {
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
      const sha = await gitClient.clone(module, cloneRoot);
      const selection = await discoverSnapshotFiles(cloneRoot);
      const snapshot = await copySnapshotFiles({
        cloneRoot,
        candidateRoot,
        module,
        sha,
        selection,
        ...(options.limits ? { limits: options.limits } : {}),
      });
      const changed =
        !moduleEquals(existing, snapshot) || !(await currentSnapshotMatches(sourcesRoot, snapshot));
      candidates.push({ module, root: candidateRoot, snapshot, changed });
      results.push({
        id: module.id,
        status: changed ? (request.dryRun ? "would-change" : "changed") : "unchanged",
        sha,
        files: snapshot.files.length,
        bytes: snapshot.totalBytes,
        warnings: snapshot.warnings,
      });
    }

    const nextManifest = mergeManifest(existingManifest, candidates, request);
    if (!request.dryRun) {
      await commitCandidates(sourcesRoot, candidates, nextManifest);
    }
  } catch (error) {
    throw toSyncDiagnostic(
      error,
      "SYNC_FAILED",
      "Source synchronization failed before a valid snapshot could be committed.",
    );
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }

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
