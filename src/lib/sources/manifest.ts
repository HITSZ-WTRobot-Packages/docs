import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { SyncDiagnostic } from "./diagnostic";

function isSafeSnapshotPath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.includes("\0") &&
    !value.includes("\\") &&
    !path.posix.isAbsolute(value) &&
    path.posix.normalize(value) === value &&
    value !== ".." &&
    !value.startsWith("../")
  );
}

export const SnapshotFileKindSchema = z.enum([
  "manifest",
  "readme",
  "markdown",
  "asset",
  "source",
  "license",
]);

export type SnapshotFileKind = z.infer<typeof SnapshotFileKindSchema>;

export const SnapshotFileSchema = z
  .object({
    path: z.string().refine(isSafeSnapshotPath, "File path must be a safe relative POSIX path."),
    bytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    kind: SnapshotFileKindSchema,
  })
  .strict();

export type SnapshotFile = z.infer<typeof SnapshotFileSchema>;

export const SnapshotWarningSchema = z
  .object({
    code: z.enum(["LICENSE_MISSING", "PACKAGE_MANIFEST_MISSING", "README_MISSING"]),
    message: z.string().min(1),
  })
  .strict();

export const ModuleSnapshotSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z][A-Za-z0-9-]*$/),
    displayName: z.string().min(1),
    repository: z.url(),
    branch: z.string().min(1),
    sha: z.string().regex(/^[a-f0-9]{40}$/),
    shortSha: z.string().regex(/^[a-f0-9]{12}$/),
    totalBytes: z.number().int().nonnegative(),
    files: z.array(SnapshotFileSchema),
    licenseFiles: z.array(z.string().refine(isSafeSnapshotPath)),
    warnings: z.array(SnapshotWarningSchema),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.shortSha !== snapshot.sha.slice(0, 12)) {
      context.addIssue({
        code: "custom",
        path: ["shortSha"],
        message: "shortSha must be the first 12 characters of sha.",
      });
    }

    const paths = new Set<string>();
    for (const [index, file] of snapshot.files.entries()) {
      if (paths.has(file.path)) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message: `Duplicate snapshot file path: ${file.path}`,
        });
      }
      paths.add(file.path);
    }

    const computedBytes = snapshot.files.reduce((total, file) => total + file.bytes, 0);
    if (snapshot.totalBytes !== computedBytes) {
      context.addIssue({
        code: "custom",
        path: ["totalBytes"],
        message: `totalBytes must equal the file byte sum (${computedBytes}).`,
      });
    }

    const licensePaths = new Set(
      snapshot.files.filter((file) => file.kind === "license").map((file) => file.path),
    );
    const indexedLicenses = new Set<string>();
    for (const [index, licensePath] of snapshot.licenseFiles.entries()) {
      if (!licensePaths.has(licensePath)) {
        context.addIssue({
          code: "custom",
          path: ["licenseFiles", index],
          message: `License index does not reference a license file: ${licensePath}`,
        });
      }
      if (indexedLicenses.has(licensePath)) {
        context.addIssue({
          code: "custom",
          path: ["licenseFiles", index],
          message: `Duplicate license file path: ${licensePath}`,
        });
      }
      indexedLicenses.add(licensePath);
    }
    for (const licensePath of licensePaths) {
      if (!indexedLicenses.has(licensePath)) {
        context.addIssue({
          code: "custom",
          path: ["licenseFiles"],
          message: `License file is missing from the license index: ${licensePath}`,
        });
      }
    }
  });

export type ModuleSnapshot = z.infer<typeof ModuleSnapshotSchema>;

export const SourceManifestSchema = z
  .object({
    formatVersion: z.literal(1),
    modules: z.array(ModuleSnapshotSchema),
  })
  .strict()
  .superRefine((manifest, context) => {
    const moduleIds = new Set<string>();
    for (const [index, module] of manifest.modules.entries()) {
      if (moduleIds.has(module.id)) {
        context.addIssue({
          code: "custom",
          path: ["modules", index, "id"],
          message: `Duplicate module id: ${module.id}`,
        });
      }
      moduleIds.add(module.id);
    }
  });

export type SourceManifest = z.infer<typeof SourceManifestSchema>;

export const EMPTY_SOURCE_MANIFEST: SourceManifest = {
  formatVersion: 1,
  modules: [],
};

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeSourceManifest(manifest: SourceManifest): SourceManifest {
  return SourceManifestSchema.parse({
    formatVersion: 1,
    modules: manifest.modules
      .map((module) => ({
        ...module,
        files: [...module.files].sort((left, right) => compareStrings(left.path, right.path)),
        licenseFiles: [...module.licenseFiles].sort(compareStrings),
        warnings: [...module.warnings].sort((left, right) => compareStrings(left.code, right.code)),
      }))
      .sort((left, right) => compareStrings(left.id, right.id)),
  });
}

export function serializeSourceManifest(manifest: SourceManifest): string {
  return `${JSON.stringify(normalizeSourceManifest(manifest), null, 2)}\n`;
}

export async function readSourceManifest(sourcesRoot: string): Promise<SourceManifest> {
  const manifestPath = path.join(sourcesRoot, "manifest.json");
  let contents: string;
  try {
    contents = await readFile(manifestPath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return EMPTY_SOURCE_MANIFEST;
    }
    throw new SyncDiagnostic(
      "SNAPSHOT_MANIFEST_UNREADABLE",
      "Unable to read sources/manifest.json.",
      { path: "sources/manifest.json" },
      { cause: error },
    );
  }

  try {
    return normalizeSourceManifest(SourceManifestSchema.parse(JSON.parse(contents)));
  } catch (error) {
    throw new SyncDiagnostic(
      "SNAPSHOT_MANIFEST_INVALID",
      "sources/manifest.json does not satisfy the versioned snapshot schema.",
      {
        path: "sources/manifest.json",
        hint: "Repair the manifest or run synchronization to restore the committed snapshot.",
      },
      { cause: error },
    );
  }
}
