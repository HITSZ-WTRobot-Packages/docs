import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import { SyncDiagnostic } from "./diagnostic";
import type { ModuleSnapshot, SnapshotFile } from "./manifest";

function snapshotFilePath(sourcesRoot: string, moduleId: string, relativePath: string): string {
  const moduleRoot = path.resolve(sourcesRoot, "modules", moduleId);
  const target = path.resolve(moduleRoot, ...relativePath.split("/"));
  if (!target.startsWith(`${moduleRoot}${path.sep}`)) {
    throw new SyncDiagnostic("SNAPSHOT_PATH_ESCAPE", "Snapshot file escapes its module root.", {
      module: moduleId,
      path: relativePath,
    });
  }
  return target;
}

export async function readVerifiedSnapshotFile(
  sourcesRoot: string,
  module: ModuleSnapshot,
  file: SnapshotFile,
): Promise<Buffer> {
  const target = snapshotFilePath(sourcesRoot, module.id, file.path);
  let stats;
  try {
    stats = await lstat(target);
  } catch (error) {
    throw new SyncDiagnostic(
      "SNAPSHOT_FILE_MISSING",
      `Snapshot file is missing: ${module.id}/${file.path}`,
      { module: module.id, path: file.path },
      { cause: error },
    );
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new SyncDiagnostic(
      "SNAPSHOT_FILE_INVALID",
      `Snapshot input is not a regular file: ${module.id}/${file.path}`,
      { module: module.id, path: file.path },
    );
  }

  const contents = await readFile(target);
  const sha256 = createHash("sha256").update(contents).digest("hex");
  if (contents.byteLength !== file.bytes || sha256 !== file.sha256) {
    throw new SyncDiagnostic(
      "SNAPSHOT_CHECKSUM_MISMATCH",
      `Snapshot file does not match its manifest: ${module.id}/${file.path}`,
      {
        module: module.id,
        path: file.path,
        hint: "Run the synchronizer to restore the committed snapshot from upstream.",
      },
    );
  }
  return contents;
}

export async function readVerifiedSnapshotText(
  sourcesRoot: string,
  module: ModuleSnapshot,
  file: SnapshotFile,
): Promise<string> {
  const contents = await readVerifiedSnapshotFile(sourcesRoot, module, file);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(contents);
  } catch (error) {
    throw new SyncDiagnostic(
      "SNAPSHOT_TEXT_INVALID",
      `Snapshot file is not valid UTF-8: ${module.id}/${file.path}`,
      { module: module.id, path: file.path },
      { cause: error },
    );
  }
}
