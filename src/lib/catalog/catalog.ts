import path from "node:path";

import { parse } from "smol-toml";

import {
  SourceManifestSchema,
  type ModuleSnapshot,
  type SnapshotFile,
  type SourceManifest,
} from "../sources/manifest";
import { pinnedUpstreamUrl } from "../sources/upstream-url";
import { CatalogDiagnostic } from "./diagnostic";
import {
  CpkgManifestSchema,
  PackageCatalogSchema,
  type CatalogDependency,
  type CatalogPackage,
  type PackageCatalog,
} from "./schema";
import { catalogSlug } from "./slugs";

export const APPROVED_EXTERNAL_DEPENDENCIES = new Set([
  "FreeRTOS",
  "VelocityProfile::SCurve",
  "stm32cubemx",
]);

export type CpkgDocument = {
  moduleId: string;
  filePath: string;
  contents: string;
};

type PackageDraft = Omit<CatalogPackage, "dependencies" | "reverseDependencies"> & {
  dependencyNames: string[];
};

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function documentKey(moduleId: string, filePath: string): string {
  return `${moduleId}/${filePath}`;
}

function parseManifest(document: CpkgDocument) {
  let parsed: unknown;
  try {
    parsed = parse(document.contents);
  } catch (error) {
    throw new CatalogDiagnostic(
      "CATALOG_TOML_INVALID",
      `Unable to parse cpkg manifest: ${document.moduleId}/${document.filePath}`,
      { module: document.moduleId, path: document.filePath },
      { cause: error },
    );
  }
  const result = CpkgManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new CatalogDiagnostic(
      "CATALOG_SCHEMA_INVALID",
      `cpkg manifest does not satisfy the supported schema: ${document.moduleId}/${document.filePath}`,
      { module: document.moduleId, path: document.filePath },
      { cause: result.error },
    );
  }
  return result.data;
}

function expectedManifestFiles(manifest: SourceManifest): Array<{
  module: ModuleSnapshot;
  file: SnapshotFile;
}> {
  return manifest.modules.flatMap((module) =>
    module.files.filter((file) => file.kind === "manifest").map((file) => ({ module, file })),
  );
}

export function buildPackageCatalog(
  sourceManifestInput: SourceManifest,
  documentsInput: readonly CpkgDocument[],
): PackageCatalog {
  const sourceResult = SourceManifestSchema.safeParse(sourceManifestInput);
  if (!sourceResult.success) {
    throw new CatalogDiagnostic(
      "CATALOG_SOURCE_INVALID",
      "The source manifest does not satisfy the catalog input contract.",
      { path: "sources/manifest.json" },
      { cause: sourceResult.error },
    );
  }
  const sourceManifest = sourceResult.data;
  const expectedFiles = expectedManifestFiles(sourceManifest);
  const documents = new Map<string, CpkgDocument>();
  for (const document of documentsInput) {
    const key = documentKey(document.moduleId, document.filePath);
    if (documents.has(key)) {
      throw new CatalogDiagnostic("CATALOG_DOCUMENT_DUPLICATE", `Duplicate cpkg document: ${key}`, {
        module: document.moduleId,
        path: document.filePath,
      });
    }
    documents.set(key, document);
  }
  if (documents.size !== expectedFiles.length) {
    throw new CatalogDiagnostic(
      "CATALOG_DOCUMENT_SET_INVALID",
      `Expected ${expectedFiles.length} cpkg documents but received ${documents.size}.`,
    );
  }

  const drafts: PackageDraft[] = [];
  const packageNames = new Set<string>();
  const packageSlugs = new Set<string>();
  for (const { module, file } of expectedFiles) {
    if (path.posix.basename(file.path) !== "cpkg.toml") {
      throw new CatalogDiagnostic(
        "CATALOG_PATH_INVALID",
        `Manifest-kind snapshot file is not named cpkg.toml: ${module.id}/${file.path}`,
        { module: module.id, path: file.path },
      );
    }
    const document = documents.get(documentKey(module.id, file.path));
    if (!document) {
      throw new CatalogDiagnostic(
        "CATALOG_DOCUMENT_MISSING",
        `Missing cpkg document: ${module.id}/${file.path}`,
        { module: module.id, path: file.path },
      );
    }
    const cpkg = parseManifest(document);
    const slug = catalogSlug(cpkg.pkgname);
    if (packageNames.has(cpkg.pkgname)) {
      throw new CatalogDiagnostic(
        "CATALOG_PACKAGE_DUPLICATE",
        `Duplicate package name: ${cpkg.pkgname}`,
        { module: module.id, package: cpkg.pkgname, path: file.path },
      );
    }
    if (packageSlugs.has(slug)) {
      throw new CatalogDiagnostic("CATALOG_SLUG_DUPLICATE", `Duplicate package slug: ${slug}`, {
        module: module.id,
        package: cpkg.pkgname,
        path: file.path,
      });
    }
    packageNames.add(cpkg.pkgname);
    packageSlugs.add(slug);

    const packagePath = path.posix.dirname(file.path);
    drafts.push({
      name: cpkg.name,
      pkgname: cpkg.pkgname,
      version: cpkg.version,
      revisionLabel: `${cpkg.version}+${module.shortSha}`,
      slug,
      moduleId: module.id,
      moduleSlug: catalogSlug(module.id),
      moduleSha: module.sha,
      moduleShortSha: module.shortSha,
      manifestPath: file.path,
      packagePath,
      sourceUrl: pinnedUpstreamUrl(module, "tree", packagePath),
      dependencyNames: [...cpkg.dependencies].sort(compareStrings),
    });
  }

  const draftByName = new Map(drafts.map((draft) => [draft.pkgname, draft]));
  const reverse = new Map<string, PackageDraft[]>();
  const packages = drafts.map((draft) => {
    const dependencies: CatalogDependency[] = draft.dependencyNames.map((name) => {
      const internal = draftByName.get(name);
      if (internal) {
        const dependents = reverse.get(name) ?? [];
        dependents.push(draft);
        reverse.set(name, dependents);
        return {
          kind: "internal" as const,
          name,
          slug: internal.slug,
          moduleId: internal.moduleId,
        };
      }
      if (APPROVED_EXTERNAL_DEPENDENCIES.has(name)) {
        return { kind: "external" as const, name };
      }
      throw new CatalogDiagnostic(
        "CATALOG_DEPENDENCY_UNRESOLVED",
        `Unresolved package dependency: ${draft.pkgname} -> ${name}`,
        { module: draft.moduleId, package: draft.pkgname, dependency: name },
      );
    });
    return { draft, dependencies };
  });

  const normalizedPackages = packages
    .map(({ draft, dependencies }) => {
      return {
        name: draft.name,
        pkgname: draft.pkgname,
        version: draft.version,
        revisionLabel: draft.revisionLabel,
        slug: draft.slug,
        moduleId: draft.moduleId,
        moduleSlug: draft.moduleSlug,
        moduleSha: draft.moduleSha,
        moduleShortSha: draft.moduleShortSha,
        manifestPath: draft.manifestPath,
        packagePath: draft.packagePath,
        sourceUrl: draft.sourceUrl,
        dependencies,
        reverseDependencies: (reverse.get(draft.pkgname) ?? [])
          .map((dependent) => ({
            name: dependent.pkgname,
            slug: dependent.slug,
            moduleId: dependent.moduleId,
          }))
          .sort((left, right) => compareStrings(left.name, right.name)),
      };
    })
    .sort((left, right) => compareStrings(left.pkgname, right.pkgname));

  const packageSlugsByModule = new Map<string, string[]>();
  for (const entry of normalizedPackages) {
    const slugs = packageSlugsByModule.get(entry.moduleId) ?? [];
    slugs.push(entry.slug);
    packageSlugsByModule.set(entry.moduleId, slugs);
  }
  return PackageCatalogSchema.parse({
    formatVersion: 1,
    modules: sourceManifest.modules
      .map((module) => ({
        id: module.id,
        displayName: module.displayName,
        slug: catalogSlug(module.id),
        repository: module.repository,
        branch: module.branch,
        sha: module.sha,
        shortSha: module.shortSha,
        packageSlugs: (packageSlugsByModule.get(module.id) ?? []).sort(compareStrings),
        warnings: module.warnings,
      }))
      .sort((left, right) => compareStrings(left.id, right.id)),
    packages: normalizedPackages,
  });
}

export function serializePackageCatalog(catalog: PackageCatalog): string {
  return `${JSON.stringify(PackageCatalogSchema.parse(catalog), null, 2)}\n`;
}
