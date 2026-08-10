import path from "node:path";

import { parse } from "smol-toml";
import { z } from "zod";

import {
  SourceManifestSchema,
  type ModuleSnapshot,
  type SourceManifest,
} from "../sources/manifest";
import { pinnedUpstreamUrl } from "../sources/upstream-url";
import { CatalogDiagnostic } from "./diagnostic";
import {
  CpkgManifestSchema,
  ModulePackageCatalogSchema,
  PackageCatalogSchema,
  type CatalogDependency,
  type CatalogPackage,
  type ModulePackageCatalog,
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

export function buildModulePackageCatalog(
  moduleInput: ModuleSnapshot,
  documentsInput: readonly CpkgDocument[],
): ModulePackageCatalog {
  const moduleResult = z
    .object({
      id: z.string().min(1),
      sha: z.string().regex(/^[a-f0-9]{40}$/u),
    })
    .safeParse(moduleInput);
  if (!moduleResult.success) {
    throw new CatalogDiagnostic(
      "CATALOG_SOURCE_INVALID",
      "The module snapshot does not satisfy the catalog input contract.",
      { module: moduleInput.id },
      { cause: moduleResult.error },
    );
  }
  const module = moduleInput;
  const paths = new Set<string>();
  const packageNames = new Set<string>();
  const packages = documentsInput.map((document) => {
    if (document.moduleId !== module.id) {
      throw new CatalogDiagnostic(
        "CATALOG_DOCUMENT_SET_INVALID",
        `cpkg document belongs to another module: ${document.moduleId}/${document.filePath}`,
        { module: document.moduleId, path: document.filePath },
      );
    }
    if (path.posix.basename(document.filePath) !== "cpkg.toml") {
      throw new CatalogDiagnostic(
        "CATALOG_PATH_INVALID",
        `Package manifest is not named cpkg.toml: ${module.id}/${document.filePath}`,
        { module: module.id, path: document.filePath },
      );
    }
    if (paths.has(document.filePath)) {
      throw new CatalogDiagnostic(
        "CATALOG_DOCUMENT_DUPLICATE",
        `Duplicate cpkg document: ${module.id}/${document.filePath}`,
        { module: module.id, path: document.filePath },
      );
    }
    paths.add(document.filePath);
    const cpkg = parseManifest(document);
    if (packageNames.has(cpkg.pkgname)) {
      throw new CatalogDiagnostic(
        "CATALOG_PACKAGE_DUPLICATE",
        `Duplicate package name: ${cpkg.pkgname}`,
        { module: module.id, package: cpkg.pkgname, path: document.filePath },
      );
    }
    packageNames.add(cpkg.pkgname);
    return {
      name: cpkg.name,
      pkgname: cpkg.pkgname,
      version: cpkg.version,
      manifestPath: document.filePath,
      packagePath: path.posix.dirname(document.filePath),
      dependencyNames: [...cpkg.dependencies].sort(compareStrings),
    };
  });
  return ModulePackageCatalogSchema.parse({
    formatVersion: 1,
    moduleId: module.id,
    moduleSha: module.sha,
    packages: packages.sort((left, right) => compareStrings(left.pkgname, right.pkgname)),
  });
}

export function buildPackageCatalogFromModules(
  sourceManifestInput: SourceManifest,
  moduleCatalogsInput: readonly ModulePackageCatalog[],
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
  const moduleById = new Map(sourceManifest.modules.map((module) => [module.id, module]));
  const catalogs = new Map<string, ModulePackageCatalog>();
  for (const input of moduleCatalogsInput) {
    const catalog = ModulePackageCatalogSchema.parse(input);
    const module = moduleById.get(catalog.moduleId);
    if (!module || module.sha !== catalog.moduleSha || catalogs.has(catalog.moduleId)) {
      throw new CatalogDiagnostic(
        "CATALOG_DOCUMENT_SET_INVALID",
        `Module package catalog does not match the source manifest: ${catalog.moduleId}`,
        { module: catalog.moduleId },
      );
    }
    catalogs.set(catalog.moduleId, catalog);
  }
  if (catalogs.size !== sourceManifest.modules.length) {
    throw new CatalogDiagnostic(
      "CATALOG_DOCUMENT_SET_INVALID",
      `Expected ${sourceManifest.modules.length} module package catalogs but received ${catalogs.size}.`,
    );
  }

  const drafts: PackageDraft[] = [];
  const packageNames = new Set<string>();
  const packageSlugs = new Set<string>();
  for (const module of sourceManifest.modules) {
    const catalog = catalogs.get(module.id);
    if (!catalog) continue;
    for (const entry of catalog.packages) {
      const slug = catalogSlug(entry.pkgname);
      if (packageNames.has(entry.pkgname)) {
        throw new CatalogDiagnostic(
          "CATALOG_PACKAGE_DUPLICATE",
          `Duplicate package name: ${entry.pkgname}`,
          { module: module.id, package: entry.pkgname, path: entry.manifestPath },
        );
      }
      if (packageSlugs.has(slug)) {
        throw new CatalogDiagnostic("CATALOG_SLUG_DUPLICATE", `Duplicate package slug: ${slug}`, {
          module: module.id,
          package: entry.pkgname,
          path: entry.manifestPath,
        });
      }
      packageNames.add(entry.pkgname);
      packageSlugs.add(slug);
      drafts.push({
        name: entry.name,
        pkgname: entry.pkgname,
        version: entry.version,
        revisionLabel: `${entry.version}+${module.shortSha}`,
        slug,
        moduleId: module.id,
        moduleSlug: catalogSlug(module.id),
        moduleSha: module.sha,
        moduleShortSha: module.shortSha,
        manifestPath: entry.manifestPath,
        packagePath: entry.packagePath,
        sourceUrl: pinnedUpstreamUrl(module, "tree", entry.packagePath),
        dependencyNames: entry.dependencyNames,
      });
    }
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
    .map(({ draft, dependencies }) => ({
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
    }))
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

export function buildPackageCatalog(
  sourceManifest: SourceManifest,
  documents: readonly CpkgDocument[],
): PackageCatalog {
  const documentsByModule = new Map<string, CpkgDocument[]>();
  for (const document of documents) {
    const entries = documentsByModule.get(document.moduleId) ?? [];
    entries.push(document);
    documentsByModule.set(document.moduleId, entries);
  }
  const moduleCatalogs = sourceManifest.modules.map((module) =>
    buildModulePackageCatalog(module, documentsByModule.get(module.id) ?? []),
  );
  return buildPackageCatalogFromModules(sourceManifest, moduleCatalogs);
}

export function serializeModulePackageCatalog(catalog: ModulePackageCatalog): string {
  return `${JSON.stringify(ModulePackageCatalogSchema.parse(catalog), null, 2)}\n`;
}

export function serializePackageCatalog(catalog: PackageCatalog): string {
  return `${JSON.stringify(PackageCatalogSchema.parse(catalog), null, 2)}\n`;
}
