import { describe, expect, test } from "bun:test";

import {
  serializeSourceManifest,
  SourceManifestSchema,
  type SourceManifest,
} from "../../src/lib/sources/manifest";

const SHA = "1234567890abcdef1234567890abcdef12345678";

function validManifest(): SourceManifest {
  return {
    formatVersion: 1,
    modules: [
      {
        id: "FixtureModule",
        displayName: "Fixture Module",
        repository: "https://example.invalid/FixtureModule.git",
        branch: "main",
        sha: SHA,
        shortSha: SHA.slice(0, 12),
        totalBytes: 8,
        files: [
          {
            path: "README.md",
            bytes: 5,
            sha256: "a".repeat(64),
            kind: "readme",
          },
          {
            path: "LICENSE",
            bytes: 3,
            sha256: "b".repeat(64),
            kind: "license",
          },
        ],
        licenseFiles: ["LICENSE"],
        warnings: [],
      },
    ],
  };
}

describe("source manifest", () => {
  test("serializes normalized arrays deterministically", () => {
    const manifest = validManifest();
    manifest.modules[0]?.files.reverse();

    const serialized = serializeSourceManifest(manifest);

    expect(serialized.endsWith("\n")).toBe(true);
    expect(serialized.indexOf('"path": "LICENSE"')).toBeLessThan(
      serialized.indexOf('"path": "README.md"'),
    );
    expect(serializeSourceManifest(JSON.parse(serialized))).toBe(serialized);
  });

  test("rejects unsafe and duplicate snapshot paths", () => {
    const manifest = validManifest();
    const module = manifest.modules[0];
    if (!module) {
      throw new Error("Fixture module is missing.");
    }
    const readme = module.files[0];
    const license = module.files[1];
    if (!readme || !license) {
      throw new Error("Fixture files are missing.");
    }
    module.files[0] = { ...readme, path: "../README.md" };
    module.files.push({ ...license });
    module.totalBytes += license.bytes;

    expect(SourceManifestSchema.safeParse(manifest).success).toBe(false);
  });

  test("rejects inconsistent derived fields and license indexes", () => {
    const manifest = validManifest();
    const module = manifest.modules[0];
    if (!module) {
      throw new Error("Fixture module is missing.");
    }
    module.shortSha = "0".repeat(12);
    module.totalBytes = 99;
    module.licenseFiles = ["README.md"];

    expect(SourceManifestSchema.safeParse(manifest).success).toBe(false);
  });

  test("rejects duplicate module identifiers", () => {
    const manifest = validManifest();
    const module = manifest.modules[0];
    if (!module) {
      throw new Error("Fixture module is missing.");
    }
    manifest.modules.push(structuredClone(module));

    expect(SourceManifestSchema.safeParse(manifest).success).toBe(false);
  });
});
