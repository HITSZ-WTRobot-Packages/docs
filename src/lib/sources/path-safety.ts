import path from "node:path";

import { SyncDiagnostic } from "./diagnostic";

const EXTERNAL_REFERENCE_BASE = "https://snapshot.invalid/";

export function normalizeSnapshotPath(value: string, contextPath?: string): string {
  if (value.includes("\0") || value.includes("\\") || path.posix.isAbsolute(value)) {
    throw new SyncDiagnostic(
      "SNAPSHOT_PATH_INVALID",
      `Snapshot path is not a safe relative POSIX path: ${value}`,
      {
        path: contextPath ?? value,
      },
    );
  }

  const normalized = path.posix.normalize(value);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new SyncDiagnostic(
      "SNAPSHOT_PATH_ESCAPE",
      `Snapshot path escapes its module root: ${value}`,
      {
        path: contextPath ?? value,
      },
    );
  }
  return normalized;
}

export function resolveMarkdownReference(sourcePath: string, reference: string): string | null {
  const trimmed = reference.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }
  if (trimmed.includes("\\") || trimmed.includes("\0")) {
    throw new SyncDiagnostic(
      "SNAPSHOT_REFERENCE_INVALID",
      `Unsafe Markdown reference: ${reference}`,
      {
        path: sourcePath,
      },
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, EXTERNAL_REFERENCE_BASE);
  } catch (error) {
    throw new SyncDiagnostic(
      "SNAPSHOT_REFERENCE_INVALID",
      `Markdown reference is not a valid URL or relative path: ${reference}`,
      { path: sourcePath },
      { cause: error },
    );
  }
  if (parsed.origin !== new URL(EXTERNAL_REFERENCE_BASE).origin) {
    return null;
  }

  const rawPath = trimmed.split(/[?#]/u, 1)[0];
  if (!rawPath) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch (error) {
    throw new SyncDiagnostic(
      "SNAPSHOT_REFERENCE_INVALID",
      `Markdown reference contains invalid percent encoding: ${reference}`,
      { path: sourcePath },
      { cause: error },
    );
  }

  const candidate = decoded.startsWith("/")
    ? decoded.slice(1)
    : path.posix.join(path.posix.dirname(sourcePath), decoded);
  const normalized = path.posix.normalize(candidate);
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new SyncDiagnostic(
      "SNAPSHOT_REFERENCE_ESCAPE",
      `Markdown reference escapes the module root: ${reference}`,
      { path: sourcePath, hint: "Use a path contained by the upstream module repository." },
    );
  }
  return normalizeSnapshotPath(normalized, sourcePath);
}

export function isMarkdownPath(value: string): boolean {
  return /\.(?:md|markdown|mdx)$/iu.test(value);
}

export function isReadmePath(value: string): boolean {
  return /^readme(?:\..+)?$/iu.test(path.posix.basename(value));
}
