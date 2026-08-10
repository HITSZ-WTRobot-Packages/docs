import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { execa } from "execa";

import { installDoxygen, type DownloadArchive } from "../../src/lib/toolchain/doxygen-installer";

const VERSION = "1.16.1";

async function createFixtureRepository(): Promise<{
  repositoryRoot: string;
  archivePath: string;
  installRoot: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "wtr-doxygen-installer-"));
  const repositoryRoot = path.join(root, "repository");
  const payloadRoot = path.join(root, "payload");
  const releaseRoot = path.join(payloadRoot, `doxygen-${VERSION}`);
  const executable = path.join(releaseRoot, "bin", "doxygen");
  const archivePath = path.join(root, "doxygen.tar.gz");
  const installRoot = path.join(root, "install");

  await mkdir(path.dirname(executable), { recursive: true });
  await mkdir(repositoryRoot);
  await writeFile(executable, `#!/bin/sh\nprintf '%s\\n' '${VERSION}'\n`, "utf8");
  await chmod(executable, 0o755);
  await execa("tar", [
    "--create",
    "--gzip",
    "--file",
    archivePath,
    "--directory",
    payloadRoot,
    `doxygen-${VERSION}`,
  ]);

  const sha256 = createHash("sha256")
    .update(await readFile(archivePath))
    .digest("hex");
  await writeFile(path.join(repositoryRoot, ".doxygen-version"), `${VERSION}\n`, "utf8");
  await writeFile(
    path.join(repositoryRoot, ".doxygen-release.json"),
    `${JSON.stringify({ version: VERSION, url: "https://example.invalid/doxygen.tar.gz", sha256 }, null, 2)}\n`,
    "utf8",
  );

  return {
    repositoryRoot,
    archivePath,
    installRoot,
    cleanup: async () => await rm(root, { recursive: true, force: true }),
  };
}

function localDownload(archivePath: string, calls: { count: number }): DownloadArchive {
  return async (_url, destination) => {
    calls.count += 1;
    await copyFile(archivePath, destination);
  };
}

describe("Doxygen toolchain installer", () => {
  test("installs a verified archive and reuses a valid cache entry", async () => {
    const fixture = await createFixtureRepository();
    const calls = { count: 0 };
    try {
      const first = await installDoxygen({
        repositoryRoot: fixture.repositoryRoot,
        installRoot: fixture.installRoot,
        downloadArchive: localDownload(fixture.archivePath, calls),
      });
      const second = await installDoxygen({
        repositoryRoot: fixture.repositoryRoot,
        installRoot: fixture.installRoot,
        downloadArchive: localDownload(fixture.archivePath, calls),
      });

      expect(first).toMatchObject({ version: VERSION, cacheHit: false });
      expect(second).toMatchObject({ version: VERSION, cacheHit: true });
      expect(calls.count).toBe(1);
      expect((await execa(second.executable, ["--version"])).stdout).toBe(VERSION);
    } finally {
      await fixture.cleanup();
    }
  });

  test("replaces a cached executable with the wrong version", async () => {
    const fixture = await createFixtureRepository();
    const cachedExecutable = path.join(fixture.installRoot, `doxygen-${VERSION}`, "bin", "doxygen");
    const calls = { count: 0 };
    try {
      await mkdir(path.dirname(cachedExecutable), { recursive: true });
      await writeFile(cachedExecutable, "#!/bin/sh\necho 0.0.0\n", "utf8");
      await chmod(cachedExecutable, 0o755);

      const result = await installDoxygen({
        repositoryRoot: fixture.repositoryRoot,
        installRoot: fixture.installRoot,
        downloadArchive: localDownload(fixture.archivePath, calls),
      });

      expect(result.cacheHit).toBe(false);
      expect(calls.count).toBe(1);
      expect((await execa(result.executable, ["--version"])).stdout).toBe(VERSION);
    } finally {
      await fixture.cleanup();
    }
  });

  test("rejects an archive that does not match the pinned checksum", async () => {
    const fixture = await createFixtureRepository();
    try {
      const releasePath = path.join(fixture.repositoryRoot, ".doxygen-release.json");
      const release = JSON.parse(await readFile(releasePath, "utf8")) as Record<string, unknown>;
      release.sha256 = "0".repeat(64);
      await writeFile(releasePath, `${JSON.stringify(release)}\n`, "utf8");

      expect(
        installDoxygen({
          repositoryRoot: fixture.repositoryRoot,
          installRoot: fixture.installRoot,
          downloadArchive: localDownload(fixture.archivePath, { count: 0 }),
        }),
      ).rejects.toMatchObject({ code: "DOXYGEN_CHECKSUM_MISMATCH" });
      expect(await readdir(fixture.installRoot)).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  test("reports download failures and removes temporary installation state", async () => {
    const fixture = await createFixtureRepository();
    try {
      expect(
        installDoxygen({
          repositoryRoot: fixture.repositoryRoot,
          installRoot: fixture.installRoot,
          downloadArchive: async () => {
            throw new Error("fixture download failure");
          },
        }),
      ).rejects.toMatchObject({ code: "DOXYGEN_DOWNLOAD_FAILED" });
      expect(await readdir(fixture.installRoot)).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  test("rejects drift between the version lock and release metadata", async () => {
    const fixture = await createFixtureRepository();
    try {
      await writeFile(path.join(fixture.repositoryRoot, ".doxygen-version"), "1.15.0\n", "utf8");

      expect(
        installDoxygen({
          repositoryRoot: fixture.repositoryRoot,
          installRoot: fixture.installRoot,
        }),
      ).rejects.toMatchObject({
        code: "DOXYGEN_RELEASE_VERSION_MISMATCH",
      });
    } finally {
      await fixture.cleanup();
    }
  });
});
