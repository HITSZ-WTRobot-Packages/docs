import { z } from "zod";

import { SnapshotWarningSchema } from "../sources/manifest";

const packageSegment = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/u;
const packageName = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(?:::[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/u;
const packageVersion = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u;
const snapshotPath = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\).+$/u;

export const CpkgManifestSchema = z
  .object({
    format_version: z.literal(1).optional(),
    name: z.string().regex(packageSegment),
    pkgname: z.string().regex(packageName),
    version: z.string().regex(packageVersion),
    dependencies: z.array(z.string().regex(packageName)).default([]),
  })
  .strict()
  .superRefine((manifest, context) => {
    const dependencies = new Set<string>();
    for (const [index, dependency] of manifest.dependencies.entries()) {
      if (dependencies.has(dependency)) {
        context.addIssue({
          code: "custom",
          path: ["dependencies", index],
          message: `Duplicate dependency: ${dependency}`,
        });
      }
      dependencies.add(dependency);
    }
  });

export type CpkgManifest = z.infer<typeof CpkgManifestSchema>;

export const InternalDependencySchema = z
  .object({
    kind: z.literal("internal"),
    name: z.string().regex(packageName),
    slug: z.string().min(1),
    moduleId: z.string().min(1),
  })
  .strict();

export const ExternalDependencySchema = z
  .object({
    kind: z.literal("external"),
    name: z.string().regex(packageName),
  })
  .strict();

export const CatalogDependencySchema = z.discriminatedUnion("kind", [
  InternalDependencySchema,
  ExternalDependencySchema,
]);

export type CatalogDependency = z.infer<typeof CatalogDependencySchema>;

export const ReverseDependencySchema = z
  .object({
    name: z.string().regex(packageName),
    slug: z.string().min(1),
    moduleId: z.string().min(1),
  })
  .strict();

export const CatalogPackageSchema = z
  .object({
    name: z.string().regex(packageSegment),
    pkgname: z.string().regex(packageName),
    version: z.string().regex(packageVersion),
    revisionLabel: z.string().min(1),
    slug: z.string().min(1),
    moduleId: z.string().min(1),
    moduleSlug: z.string().min(1),
    moduleSha: z.string().regex(/^[a-f0-9]{40}$/u),
    moduleShortSha: z.string().regex(/^[a-f0-9]{12}$/u),
    manifestPath: z.string().regex(snapshotPath),
    packagePath: z.string().regex(snapshotPath),
    sourceUrl: z.url({ protocol: /^https?$/ }),
    dependencies: z.array(CatalogDependencySchema),
    reverseDependencies: z.array(ReverseDependencySchema),
  })
  .strict();

export type CatalogPackage = z.infer<typeof CatalogPackageSchema>;

export const CatalogModuleSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    slug: z.string().min(1),
    repository: z.url({ protocol: /^https?$/ }),
    branch: z.string().min(1),
    sha: z.string().regex(/^[a-f0-9]{40}$/u),
    shortSha: z.string().regex(/^[a-f0-9]{12}$/u),
    packageSlugs: z.array(z.string().min(1)),
    warnings: z.array(SnapshotWarningSchema),
  })
  .strict();

export const PackageCatalogSchema = z
  .object({
    formatVersion: z.literal(1),
    modules: z.array(CatalogModuleSchema),
    packages: z.array(CatalogPackageSchema),
  })
  .strict();

export type PackageCatalog = z.infer<typeof PackageCatalogSchema>;
