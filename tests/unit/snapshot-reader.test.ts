import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import type { ModuleSnapshot, SnapshotFile } from "../../src/lib/sources/manifest";
import { readVerifiedSnapshotText } from "../../src/lib/sources/reader";

const temporaryRoots: string[] = [];
const SHA = "1234567890abcdef1234567890abcdef12345678";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "wtr-docs-reader-"));
  temporaryRoots.push(root);
  const sourcesRoot = path.join(root, "sources");
  const moduleRoot = path.join(sourcesRoot, "modules", "FixtureModule", "content");
  await mkdir(moduleRoot, { recursive: true });
  const contents = "verified\n";
  await writeFile(path.join(moduleRoot, "README.md"), contents, "utf8");
  const file: SnapshotFile = {
    path: "README.md",
    bytes: Buffer.byteLength(contents),
    sha256: createHash("sha256").update(contents).digest("hex"),
    kind: "readme",
  };
  const module: ModuleSnapshot = {
    id: "FixtureModule",
    displayName: "Fixture Module",
    repository: "https://example.invalid/FixtureModule.git",
    branch: "main",
    sha: SHA,
    shortSha: SHA.slice(0, 12),
    producerFingerprint: "f".repeat(64),
    totalBytes: file.bytes,
    files: [file],
    artifacts: [
      { path: "api-catalog.json", bytes: 0, sha256: "a".repeat(64), kind: "api-catalog" },
      {
        path: "package-catalog.json",
        bytes: 0,
        sha256: "b".repeat(64),
        kind: "package-catalog",
      },
    ],
    references: [],
    licenseFiles: [],
    warnings: [],
  };
  return { sourcesRoot, module, file, contents };
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
  await Promise.all(
    temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("snapshot reader", () => {
  test("returns UTF-8 only after checksum verification", async () => {
    const input = await fixture();
    expect(await readVerifiedSnapshotText(input.sourcesRoot, input.module, input.file)).toBe(
      input.contents,
    );
  });

  test("rejects files that no longer match the manifest", async () => {
    const input = await fixture();
    await writeFile(
      path.join(input.sourcesRoot, "modules", input.module.id, "content", input.file.path),
      "tampered\n",
      "utf8",
    );

    expect(
      await captureRejection(readVerifiedSnapshotText(input.sourcesRoot, input.module, input.file)),
    ).toMatchObject({ code: "SNAPSHOT_CHECKSUM_MISMATCH" });
  });
});
