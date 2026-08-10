import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { glob } from "tinyglobby";

import { discoverMarkdownReferences } from "../markdown/references";
import { SyncDiagnostic } from "./diagnostic";
import type { ModuleSnapshot, SnapshotFile, SnapshotFileKind } from "./manifest";
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
  contentPaths: string[];
  packageManifestPaths: string[];
  sourcePaths: string[];
  references: string[];
  warnings: ModuleSnapshot["warnings"];
};

export type SnapshotContent = {
  files: SnapshotFile[];
  licenseFiles: string[];
  totalBytes: number;
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

export function isSourcePath(value: string): boolean {
  return /\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx|inl|ipp)$/iu.test(value);
}

function classifyContentPath(value: string): SnapshotFileKind {
  if (isLicensePath(value)) return "license";
  if (isReadmePath(value)) return "readme";
  if (isMarkdownPath(value)) return "markdown";
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
      { path: sourcePath },
    );
  }
  if (stats.isFile()) return referencePath;
  if (!stats.isDirectory()) {
    throw new SyncDiagnostic(
      "SNAPSHOT_REFERENCE_INVALID",
      `Markdown reference is not a regular file: ${referencePath}`,
      { path: sourcePath },
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

  const contentPaths = new Set<string>();
  const packageManifestPaths = new Set<string>();
  const sourcePaths = new Set<string>();
  const references = new Set<string>();
  const markdownQueue: string[] = [];
  const parsedMarkdown = new Set<string>();

  for (const discoveredPath of discovered) {
    const relativePath = normalizeSnapshotPath(discoveredPath);
    const basename = path.posix.basename(relativePath);
    if (basename === "cpkg.toml") {
      packageManifestPaths.add(relativePath);
    } else if (isSourcePath(relativePath)) {
      sourcePaths.add(relativePath);
    } else if (isReadmePath(relativePath) || isLicensePath(relativePath)) {
      contentPaths.add(relativePath);
      if (isReadmePath(relativePath)) markdownQueue.push(relativePath);
    }
  }

  while (markdownQueue.length > 0) {
    const markdownPath = markdownQueue.shift();
    if (!markdownPath || parsedMarkdown.has(markdownPath)) continue;
    parsedMarkdown.add(markdownPath);

    let markdown: string;
    try {
      markdown = await readFile(toNativePath(cloneRoot, markdownPath), "utf8");
    } catch (error) {
      throw new SyncDiagnostic(
        "SNAPSHOT_MARKDOWN_INVALID",
        `Unable to read Markdown as UTF-8: ${markdownPath}`,
        { path: markdownPath },
        { cause: error },
      );
    }

    for (const reference of discoverMarkdownReferences(markdown)) {
      const resolved = resolveMarkdownReference(markdownPath, reference);
      if (!resolved) continue;
      const referencePath = await resolveExistingReference(cloneRoot, markdownPath, resolved);
      if (isSourcePath(referencePath) || path.posix.basename(referencePath) === "cpkg.toml") {
        references.add(referencePath);
        continue;
      }
      contentPaths.add(referencePath);
      if (
        (isReadmePath(referencePath) || isMarkdownPath(referencePath)) &&
        !parsedMarkdown.has(referencePath)
      ) {
        markdownQueue.push(referencePath);
      }
    }
  }

  const warnings: ModuleSnapshot["warnings"] = [];
  if (packageManifestPaths.size === 0) {
    warnings.push({
      code: "PACKAGE_MANIFEST_MISSING",
      message: "No cpkg.toml package manifest was found in the synchronized module.",
    });
  }
  if (![...contentPaths].some(isReadmePath)) {
    warnings.push({
      code: "README_MISSING",
      message: "No upstream README was found in the synchronized module.",
    });
  }
  if (![...contentPaths].some(isLicensePath)) {
    warnings.push({
      code: "LICENSE_MISSING",
      message: "No upstream license file was found in the synchronized module.",
    });
  }
  warnings.sort((left, right) => compareStrings(left.code, right.code));
  return {
    contentPaths: [...contentPaths].sort(compareStrings),
    packageManifestPaths: [...packageManifestPaths].sort(compareStrings),
    sourcePaths: [...sourcePaths].sort(compareStrings),
    references: [...references].sort(compareStrings),
    warnings,
  };
}

export async function copySnapshotFiles(options: {
  cloneRoot: string;
  candidateRoot: string;
  selection: SelectionResult;
  limits?: SnapshotLimits;
}): Promise<SnapshotContent> {
  const limits = options.limits ?? DEFAULT_SNAPSHOT_LIMITS;
  const allInputPaths = [
    ...new Set([
      ...options.selection.contentPaths,
      ...options.selection.packageManifestPaths,
      ...options.selection.sourcePaths,
      ...options.selection.references,
    ]),
  ].sort(compareStrings);
  if (allInputPaths.length > limits.maxFiles) {
    throw new SyncDiagnostic(
      "SNAPSHOT_SIZE_LIMIT",
      `Module selects ${allInputPaths.length} files, exceeding the limit of ${limits.maxFiles}.`,
    );
  }

  for (const relativePath of allInputPaths) {
    const stats = await lstat(toNativePath(options.cloneRoot, relativePath));
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new SyncDiagnostic(
        "SNAPSHOT_SYMLINK_FORBIDDEN",
        `Snapshot input is not a regular file: ${relativePath}`,
        { path: relativePath },
      );
    }
    if (stats.size > limits.maxFileBytes) {
      throw new SyncDiagnostic(
        "SNAPSHOT_SIZE_LIMIT",
        `Snapshot file exceeds ${limits.maxFileBytes} bytes: ${relativePath}`,
        { path: relativePath },
      );
    }
  }

  const files: SnapshotFile[] = [];
  let totalBytes = 0;
  for (const relativePath of options.selection.contentPaths) {
    const sourcePath = toNativePath(options.cloneRoot, relativePath);
    const contents = await readFile(sourcePath);
    totalBytes += contents.byteLength;
    if (totalBytes > limits.maxModuleBytes) {
      throw new SyncDiagnostic(
        "SNAPSHOT_SIZE_LIMIT",
        `Module snapshot exceeds ${limits.maxModuleBytes} bytes.`,
      );
    }

    const destinationPath = toNativePath(path.join(options.candidateRoot, "content"), relativePath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
    files.push({
      path: relativePath,
      bytes: contents.byteLength,
      sha256: createHash("sha256").update(contents).digest("hex"),
      kind: classifyContentPath(relativePath),
    });
  }

  return {
    files,
    licenseFiles: files.filter((file) => file.kind === "license").map((file) => file.path),
    totalBytes,
  };
}
