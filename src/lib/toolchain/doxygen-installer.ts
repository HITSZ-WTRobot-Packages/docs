import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { execa } from "execa";
import { z } from "zod";

import { ToolchainDiagnostic } from "./diagnostic";

const DOWNLOAD_TIMEOUT_MS = 120_000;
const PROCESS_TIMEOUT_MS = 120_000;
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;

const SemanticVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/u);
const DoxygenReleaseSchema = z.strictObject({
  version: SemanticVersionSchema,
  url: z.url({ protocol: /^https$/u }),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
});

export type DoxygenRelease = z.infer<typeof DoxygenReleaseSchema>;

export type DownloadArchive = (url: URL, destination: string) => Promise<void>;

export type InstallDoxygenOptions = {
  repositoryRoot: string;
  installRoot: string;
  downloadArchive?: DownloadArchive;
};

export type DoxygenInstallation = {
  version: string;
  binDirectory: string;
  executable: string;
  cacheHit: boolean;
};

async function readRelease(repositoryRoot: string): Promise<DoxygenRelease> {
  const releasePath = path.join(repositoryRoot, ".doxygen-release.json");
  try {
    return DoxygenReleaseSchema.parse(JSON.parse(await readFile(releasePath, "utf8")));
  } catch (error) {
    throw new ToolchainDiagnostic(
      "DOXYGEN_RELEASE_INVALID",
      "The pinned Doxygen release description is missing or invalid.",
      { path: ".doxygen-release.json" },
      { cause: error },
    );
  }
}

async function readVersionLock(repositoryRoot: string): Promise<string> {
  const versionPath = path.join(repositoryRoot, ".doxygen-version");
  try {
    return SemanticVersionSchema.parse((await readFile(versionPath, "utf8")).trim());
  } catch (error) {
    throw new ToolchainDiagnostic(
      "DOXYGEN_VERSION_LOCK_INVALID",
      "The repository Doxygen version lock is missing or invalid.",
      { path: ".doxygen-version" },
      { cause: error },
    );
  }
}

async function executableHasVersion(executable: string, version: string): Promise<boolean> {
  try {
    const result = await execa(executable, ["--version"], { timeout: PROCESS_TIMEOUT_MS });
    return result.stdout.trim() === version;
  } catch {
    return false;
  }
}

async function downloadArchive(url: URL, destination: string): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Download returned HTTP ${response.status}.`);
  }

  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ARCHIVE_BYTES) {
    throw new Error("Doxygen archive exceeds the configured size limit.");
  }

  const contents = Buffer.from(await response.arrayBuffer());
  if (contents.byteLength === 0 || contents.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("Doxygen archive is empty or exceeds the configured size limit.");
  }
  await writeFile(destination, contents);
}

async function verifyArchive(pathname: string, expectedSha256: string): Promise<void> {
  const digest = createHash("sha256")
    .update(await readFile(pathname))
    .digest("hex");
  if (digest !== expectedSha256) {
    throw new ToolchainDiagnostic(
      "DOXYGEN_CHECKSUM_MISMATCH",
      "The downloaded Doxygen archive does not match the pinned SHA-256.",
      { hint: "Clear the toolchain cache and retry the deployment." },
    );
  }
}

export async function installDoxygen(options: InstallDoxygenOptions): Promise<DoxygenInstallation> {
  const repositoryRoot = path.resolve(options.repositoryRoot);
  const installRoot = path.resolve(options.installRoot);
  const [release, lockedVersion] = await Promise.all([
    readRelease(repositoryRoot),
    readVersionLock(repositoryRoot),
  ]);

  if (release.version !== lockedVersion) {
    throw new ToolchainDiagnostic(
      "DOXYGEN_RELEASE_VERSION_MISMATCH",
      `The Doxygen release description pins ${release.version}, but .doxygen-version requires ${lockedVersion}.`,
      { hint: "Update the version lock and release description together." },
    );
  }

  const installDirectory = path.join(installRoot, `doxygen-${release.version}`);
  const executable = path.join(installDirectory, "bin", "doxygen");
  if (await executableHasVersion(executable, release.version)) {
    return {
      version: release.version,
      binDirectory: path.dirname(executable),
      executable,
      cacheHit: true,
    };
  }

  await mkdir(installRoot, { recursive: true });
  await rm(installDirectory, { recursive: true, force: true });
  const temporaryRoot = await mkdtemp(path.join(installRoot, `.doxygen-${release.version}-`));

  try {
    const archivePath = path.join(temporaryRoot, "doxygen.tar.gz");
    const extractionRoot = path.join(temporaryRoot, "extracted");
    await mkdir(extractionRoot);

    try {
      await (options.downloadArchive ?? downloadArchive)(new URL(release.url), archivePath);
    } catch (error) {
      if (error instanceof ToolchainDiagnostic) throw error;
      throw new ToolchainDiagnostic(
        "DOXYGEN_DOWNLOAD_FAILED",
        `Could not download the pinned Doxygen ${release.version} archive.`,
        { hint: "Check deployment network access to the pinned GitHub Release and retry." },
        { cause: error },
      );
    }

    await verifyArchive(archivePath, release.sha256);
    try {
      await execa(
        "tar",
        ["--extract", "--gzip", "--file", archivePath, "--directory", extractionRoot],
        { timeout: PROCESS_TIMEOUT_MS },
      );
    } catch (error) {
      throw new ToolchainDiagnostic(
        "DOXYGEN_ARCHIVE_INVALID",
        "The pinned Doxygen archive could not be extracted.",
        {},
        { cause: error },
      );
    }

    const extractedDirectory = path.join(extractionRoot, `doxygen-${release.version}`);
    const extractedExecutable = path.join(extractedDirectory, "bin", "doxygen");
    if (!(await executableHasVersion(extractedExecutable, release.version))) {
      throw new ToolchainDiagnostic(
        "DOXYGEN_INSTALL_INVALID",
        `The extracted Doxygen executable does not report version ${release.version}.`,
      );
    }

    await rename(extractedDirectory, installDirectory);
    return {
      version: release.version,
      binDirectory: path.dirname(executable),
      executable,
      cacheHit: false,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
