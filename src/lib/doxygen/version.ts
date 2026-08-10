import { readFile } from "node:fs/promises";
import path from "node:path";

import { DoxygenDiagnostic } from "./diagnostic";

export async function readDoxygenVersionLock(repositoryRoot: string): Promise<string> {
  const versionPath = path.join(repositoryRoot, ".doxygen-version");
  let version: string;
  try {
    version = (await readFile(versionPath, "utf8")).trim();
  } catch (error) {
    throw new DoxygenDiagnostic(
      "DOXYGEN_VERSION_LOCK_MISSING",
      "The repository Doxygen version lock is missing or unreadable.",
      { path: ".doxygen-version" },
      { cause: error },
    );
  }
  if (!/^\d+\.\d+\.\d+$/u.test(version)) {
    throw new DoxygenDiagnostic(
      "DOXYGEN_VERSION_LOCK_INVALID",
      "The repository Doxygen version lock must contain an exact semantic version.",
      { path: ".doxygen-version" },
    );
  }
  return version;
}

export function normalizeReportedDoxygenVersion(reportedVersion: string): string | undefined {
  return /^(\d+\.\d+\.\d+)(?: \([0-9a-f]{40}\))?$/u.exec(reportedVersion.trim())?.[1];
}
