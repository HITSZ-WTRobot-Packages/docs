import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { SyncDiagnostic } from "./diagnostic";
import { MODULE_ID_PATTERN, ModuleConfigSchema } from "./modules";

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

const SafeSnapshotPathSchema = z
  .string()
  .refine(isSafeSnapshotPath, "File path must be a safe relative POSIX path.");
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const SnapshotFileKindSchema = z.enum(["readme", "markdown", "asset", "license"]);
export type SnapshotFileKind = z.infer<typeof SnapshotFileKindSchema>;

export const SnapshotFileSchema = z
  .object({
    path: SafeSnapshotPathSchema,
    bytes: z.number().int().nonnegative(),
    sha256: Sha256Schema,
    kind: SnapshotFileKindSchema,
  })
  .strict();
export type SnapshotFile = z.infer<typeof SnapshotFileSchema>;

export const SnapshotArtifactKindSchema = z.enum(["package-catalog", "api-catalog"]);
export type SnapshotArtifactKind = z.infer<typeof SnapshotArtifactKindSchema>;

export const SnapshotArtifactSchema = z
  .object({
    path: z.enum(["package-catalog.json", "api-catalog.json"]),
    bytes: z.number().int().nonnegative(),
    sha256: Sha256Schema,
    kind: SnapshotArtifactKindSchema,
  })
  .strict()
  .superRefine((artifact, context) => {
    const expectedPath = `${artifact.kind}.json`;
    if (artifact.path !== expectedPath) {
      context.addIssue({
        code: "custom",
        path: ["path"],
        message: `${artifact.kind} artifacts must use ${expectedPath}.`,
      });
    }
  });
export type SnapshotArtifact = z.infer<typeof SnapshotArtifactSchema>;

export const SnapshotReferenceSchema = z.object({ path: SafeSnapshotPathSchema }).strict();
export type SnapshotReference = z.infer<typeof SnapshotReferenceSchema>;

export const SnapshotWarningSchema = z
  .object({
    code: z.enum(["LICENSE_MISSING", "PACKAGE_MANIFEST_MISSING", "README_MISSING"]),
    message: z.string().min(1),
  })
  .strict();

export const ModuleSnapshotSchema = z
  .object({
    id: z.string().regex(MODULE_ID_PATTERN),
    displayName: z.string().min(1),
    repository: z.url({ protocol: /^https?$/ }),
    branch: ModuleConfigSchema.shape.branch,
    sha: z.string().regex(/^[a-f0-9]{40}$/u),
    shortSha: z.string().regex(/^[a-f0-9]{12}$/u),
    producerFingerprint: Sha256Schema,
    totalBytes: z.number().int().nonnegative(),
    files: z.array(SnapshotFileSchema),
    artifacts: z.array(SnapshotArtifactSchema),
    references: z.array(SnapshotReferenceSchema),
    licenseFiles: z.array(SafeSnapshotPathSchema),
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

    const artifactKinds = new Set<SnapshotArtifactKind>();
    for (const [index, artifact] of snapshot.artifacts.entries()) {
      if (artifactKinds.has(artifact.kind)) {
        context.addIssue({
          code: "custom",
          path: ["artifacts", index, "kind"],
          message: `Duplicate snapshot artifact kind: ${artifact.kind}`,
        });
      }
      artifactKinds.add(artifact.kind);
    }
    for (const kind of SnapshotArtifactKindSchema.options) {
      if (!artifactKinds.has(kind)) {
        context.addIssue({
          code: "custom",
          path: ["artifacts"],
          message: `Module snapshot is missing its ${kind} artifact.`,
        });
      }
    }

    const referencePaths = new Set<string>();
    for (const [index, reference] of snapshot.references.entries()) {
      if (paths.has(reference.path)) {
        context.addIssue({
          code: "custom",
          path: ["references", index, "path"],
          message: `Uncached reference is also stored as content: ${reference.path}`,
        });
      }
      if (referencePaths.has(reference.path)) {
        context.addIssue({
          code: "custom",
          path: ["references", index, "path"],
          message: `Duplicate uncached reference path: ${reference.path}`,
        });
      }
      referencePaths.add(reference.path);
    }

    const computedBytes = [...snapshot.files, ...snapshot.artifacts].reduce(
      (total, file) => total + file.bytes,
      0,
    );
    if (snapshot.totalBytes !== computedBytes) {
      context.addIssue({
        code: "custom",
        path: ["totalBytes"],
        message: `totalBytes must equal the content and artifact byte sum (${computedBytes}).`,
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
    formatVersion: z.literal(2),
    modules: z.array(ModuleSnapshotSchema),
  })
  .strict()
  .superRefine((manifest, context) => {
    const moduleIds = new Set<string>();
    const repositories = new Set<string>();
    for (const [index, module] of manifest.modules.entries()) {
      const moduleId = module.id.toLocaleLowerCase("en-US");
      if (moduleIds.has(moduleId)) {
        context.addIssue({
          code: "custom",
          path: ["modules", index, "id"],
          message: `Duplicate module id: ${module.id}`,
        });
      }
      moduleIds.add(moduleId);

      const repository = module.repository.toLocaleLowerCase("en-US");
      if (repositories.has(repository)) {
        context.addIssue({
          code: "custom",
          path: ["modules", index, "repository"],
          message: `Duplicate module repository: ${module.repository}`,
        });
      }
      repositories.add(repository);
    }
  });
export type SourceManifest = z.infer<typeof SourceManifestSchema>;

export const EMPTY_SOURCE_MANIFEST: SourceManifest = { formatVersion: 2, modules: [] };

const LegacySourceManifestSchema = z.object({
  formatVersion: z.literal(1),
  modules: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      repository: z.string(),
      branch: z.string(),
      sha: z.string(),
      shortSha: z.string(),
      files: z.array(
        z.object({
          path: z.string(),
          bytes: z.number(),
          sha256: z.string(),
          kind: z.string(),
        }),
      ),
      licenseFiles: z.array(z.string()),
      warnings: z.array(SnapshotWarningSchema),
    }),
  ),
});

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeSourceManifest(manifest: SourceManifest): SourceManifest {
  return SourceManifestSchema.parse({
    formatVersion: 2,
    modules: manifest.modules
      .map((module) => ({
        ...module,
        files: [...module.files].sort((left, right) => compareStrings(left.path, right.path)),
        artifacts: [...module.artifacts].sort((left, right) =>
          compareStrings(left.kind, right.kind),
        ),
        references: [...module.references].sort((left, right) =>
          compareStrings(left.path, right.path),
        ),
        licenseFiles: [...module.licenseFiles].sort(compareStrings),
        warnings: [...module.warnings].sort((left, right) => compareStrings(left.code, right.code)),
      }))
      .sort((left, right) => compareStrings(left.id, right.id)),
  });
}

export function serializeSourceManifest(manifest: SourceManifest): string {
  return `${JSON.stringify(normalizeSourceManifest(manifest), null, 2)}\n`;
}

function legacyManifestForMigration(input: unknown): SourceManifest | undefined {
  const result = LegacySourceManifestSchema.safeParse(input);
  if (!result.success) return undefined;
  return {
    formatVersion: 2,
    modules: result.data.modules.map((module) => ({
      id: module.id,
      displayName: module.displayName,
      repository: module.repository,
      branch: module.branch,
      sha: module.sha,
      shortSha: module.shortSha,
      producerFingerprint: "0".repeat(64),
      totalBytes: 0,
      files: [],
      artifacts: [],
      references: [],
      licenseFiles: [],
      warnings: module.warnings,
    })),
  };
}

export async function readSourceManifest(
  sourcesRoot: string,
  options: { allowLegacyMigration?: boolean } = {},
): Promise<SourceManifest> {
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
    const parsed: unknown = JSON.parse(contents);
    const current = SourceManifestSchema.safeParse(parsed);
    if (current.success) return normalizeSourceManifest(current.data);
    if (options.allowLegacyMigration) {
      const legacy = legacyManifestForMigration(parsed);
      if (legacy) return legacy;
    }
    throw current.error;
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
