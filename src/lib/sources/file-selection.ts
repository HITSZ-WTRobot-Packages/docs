import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { glob } from "tinyglobby";

import { discoverMarkdownReferences } from "../markdown/references";
import { SyncDiagnostic } from "./diagnostic";
import type { ModuleSnapshot, SnapshotFileKind } from "./manifest";
import type { ModuleConfig } from "./modules";
import {
  isMarkdownPath,
  isReadmePath,
  normalizeSnapshotPath,
  resolveMarkdownReference,
} from "./path-safety";

export type SnapshotLimits = {
  maxFileBytes: number;
  maxModuleBytes: number;
  maxFiles: number;
};

export const DEFAULT_SNAPSHOT_LIMITS: SnapshotLimits = {
  maxFileBytes: 8 * 1024 * 1024,
  maxModuleBytes: 50 * 1024 * 1024,
  maxFiles: 10_000,
};

export type SelectionResult = {
  paths: string[];
  warnings: ModuleSnapshot["warnings"];
};

const SOURCE_PATTERN = "**/*.{c,cc,cpp,cxx,h,hh,hpp,hxx,inl,ipp}";
const DISCOVERY_PATTERNS = [
  "**/cpkg.toml",
  "**/README*",
  "**/LICENSE*",
  "**/LICENCE*",
  "**/COPYING*",
  SOURCE_PATTERN,
];
const DISCOVERY_IGNORES = [
  "**/.git/**",
  "**/.venv/**",
  "**/build/**",
  "**/dist/**",
  "**/node_modules/**",
];

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isLicensePath(value: string): boolean {
  return /^(?:copying|licen[cs]e)(?:\..+)?$/iu.test(path.posix.basename(value));
}

function isSourcePath(value: string): boolean {
  return /\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx|inl|ipp)$/iu.test(value);
}

function classifyPath(value: string): SnapshotFileKind {
  if (path.posix.basename(value) === "cpkg.toml") {
    return "manifest";
  }
  if (isLicensePath(value)) {
    return "license";
  }
  if (isReadmePath(value)) {
    return "readme";
  }
  if (isMarkdownPath(value)) {
    return "markdown";
  }
  if (isSourcePath(value)) {
    return "source";
  }
  return "asset";
}

function toNativePath(root: string, relativePath: string): string {
  return path.join(root, ...relativePath.split("/"));
}

async function resolveExistingReference(
  cloneRoot: string,
  sourcePath: string,
  referencePath: string,
): Promise<string> {
  const nativePath = toNativePath(cloneRoot, referencePath);
  let stats;
  try {
    stats = await lstat(nativePath);
  } catch (error) {
    throw new SyncDiagnostic(
      "SNAPSHOT_REFERENCE_MISSING",
      `Markdown reference does not exist in the module: ${referencePath}`,
      { path: sourcePath, hint: `Fix or remove the upstream reference to ${referencePath}.` },
      { cause: error },
    );
  }
  if (stats.isSymbolicLink()) {
    throw new SyncDiagnostic(
      "SNAPSHOT_SYMLINK_FORBIDDEN",
      `Snapshot references may not select symlinks: ${referencePath}`,
      {
        path: sourcePath,
      },
    );
  }
  if (stats.isFile()) {
    return referencePath;
  }
  if (!stats.isDirectory()) {
    throw new SyncDiagnostic(
      "SNAPSHOT_REFERENCE_INVALID",
      `Markdown reference is not a regular file: ${referencePath}`,
      {
        path: sourcePath,
      },
    );
  }

  const candidates = await glob(`${referencePath}/README*`, {
    cwd: cloneRoot,
    onlyFiles: true,
    caseSensitiveMatch: false,
    followSymbolicLinks: false,
  });
  const readme = candidates
    .map((candidate) => normalizeSnapshotPath(candidate))
    .filter(isReadmePath)
    .sort(compareStrings)[0];
  if (!readme) {
    throw new SyncDiagnostic(
      "SNAPSHOT_REFERENCE_MISSING",
      `Markdown directory reference has no README target: ${referencePath}`,
      { path: sourcePath },
    );
  }
  return readme;
}

export async function discoverSnapshotFiles(cloneRoot: string): Promise<SelectionResult> {
  const discovered = await glob(DISCOVERY_PATTERNS, {
    cwd: cloneRoot,
    onlyFiles: true,
    dot: false,
    caseSensitiveMatch: false,
    followSymbolicLinks: false,
    ignore: DISCOVERY_IGNORES,
  });

  const selected = new Map<string, boolean>();
  const markdownQueue: string[] = [];
  const parsedMarkdown = new Set<string>();

  for (const discoveredPath of discovered) {
    const relativePath = normalizeSnapshotPath(discoveredPath);
    const basename = path.posix.basename(relativePath);
    if (
      basename === "cpkg.toml" ||
      isReadmePath(relativePath) ||
      isLicensePath(relativePath) ||
      isSourcePath(relativePath)
    ) {
      selected.set(relativePath, false);
      if (isReadmePath(relativePath) || isMarkdownPath(relativePath)) {
        markdownQueue.push(relativePath);
      }
    }
  }

  while (markdownQueue.length > 0) {
    const markdownPath = markdownQueue.shift();
    if (!markdownPath || parsedMarkdown.has(markdownPath)) {
      continue;
    }
    parsedMarkdown.add(markdownPath);

    let markdown: string;
    try {
      markdown = await readFile(toNativePath(cloneRoot, markdownPath), "utf8");
    } catch (error) {
      throw new SyncDiagnostic(
        "SNAPSHOT_MARKDOWN_INVALID",
        `Unable to read Markdown as UTF-8: ${markdownPath}`,
        {
          path: markdownPath,
        },
        { cause: error },
      );
    }

    for (const reference of discoverMarkdownReferences(markdown)) {
      const resolved = resolveMarkdownReference(markdownPath, reference);
      if (!resolved) {
        continue;
      }
      const referencePath = await resolveExistingReference(cloneRoot, markdownPath, resolved);
      if (!selected.has(referencePath)) {
        selected.set(referencePath, true);
      }
      if (
        (isReadmePath(referencePath) || isMarkdownPath(referencePath)) &&
        !parsedMarkdown.has(referencePath)
      ) {
        markdownQueue.push(referencePath);
      }
    }
  }

  const paths = [...selected.keys()].sort(compareStrings);
  const warnings: ModuleSnapshot["warnings"] = [];
  if (!paths.some((selectedPath) => path.posix.basename(selectedPath) === "cpkg.toml")) {
    warnings.push({
      code: "PACKAGE_MANIFEST_MISSING",
      message: "No cpkg.toml package manifest was found in the synchronized module.",
    });
  }
  if (!paths.some(isReadmePath)) {
    warnings.push({
      code: "README_MISSING",
      message: "No upstream README was found in the synchronized module.",
    });
  }
  if (!paths.some(isLicensePath)) {
    warnings.push({
      code: "LICENSE_MISSING",
      message: "No upstream license file was found in the synchronized module.",
    });
  }
  return { paths, warnings };
}

export async function copySnapshotFiles(options: {
  cloneRoot: string;
  candidateRoot: string;
  module: ModuleConfig;
  sha: string;
  selection: SelectionResult;
  limits?: SnapshotLimits;
}): Promise<ModuleSnapshot> {
  const limits = options.limits ?? DEFAULT_SNAPSHOT_LIMITS;
  if (options.selection.paths.length > limits.maxFiles) {
    throw new SyncDiagnostic(
      "SNAPSHOT_SIZE_LIMIT",
      `Module selects ${options.selection.paths.length} files, exceeding the limit of ${limits.maxFiles}.`,
      { module: options.module.id },
    );
  }

  const files: ModuleSnapshot["files"] = [];
  let totalBytes = 0;
  for (const relativePath of options.selection.paths) {
    const sourcePath = toNativePath(options.cloneRoot, relativePath);
    const stats = await lstat(sourcePath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new SyncDiagnostic(
        "SNAPSHOT_SYMLINK_FORBIDDEN",
        `Snapshot input is not a regular file: ${relativePath}`,
        {
          module: options.module.id,
          path: relativePath,
        },
      );
    }
    if (stats.size > limits.maxFileBytes) {
      throw new SyncDiagnostic(
        "SNAPSHOT_SIZE_LIMIT",
        `Snapshot file exceeds ${limits.maxFileBytes} bytes: ${relativePath}`,
        { module: options.module.id, path: relativePath },
      );
    }
    totalBytes += stats.size;
    if (totalBytes > limits.maxModuleBytes) {
      throw new SyncDiagnostic(
        "SNAPSHOT_SIZE_LIMIT",
        `Module snapshot exceeds ${limits.maxModuleBytes} bytes.`,
        { module: options.module.id },
      );
    }

    const destinationPath = toNativePath(options.candidateRoot, relativePath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
    const contents = await readFile(sourcePath);
    files.push({
      path: relativePath,
      bytes: stats.size,
      sha256: createHash("sha256").update(contents).digest("hex"),
      kind: classifyPath(relativePath),
    });
  }

  const licenseFiles = files.filter((file) => file.kind === "license").map((file) => file.path);
  return {
    id: options.module.id,
    displayName: options.module.displayName,
    repository: options.module.repository,
    branch: options.module.branch,
    sha: options.sha,
    shortSha: options.sha.slice(0, 12),
    totalBytes,
    files,
    licenseFiles,
    warnings: options.selection.warnings,
  };
}
