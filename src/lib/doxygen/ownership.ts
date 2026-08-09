import path from "node:path";

import type { CatalogPackage, PackageCatalog } from "../catalog/schema";
import { catalogSlug } from "../catalog/slugs";
import type { ModuleSnapshot, SourceManifest } from "../sources/manifest";
import { DoxygenDiagnostic } from "./diagnostic";

export type ApiTarget = {
  targetKind: "package" | "module";
  targetId: string;
  displayName: string;
  module: ModuleSnapshot;
  packageSlug: string | null;
  revisionLabel: string;
  inputPaths: string[];
};

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pathContains(packagePath: string, sourcePath: string): boolean {
  return (
    packagePath === "." || sourcePath === packagePath || sourcePath.startsWith(`${packagePath}/`)
  );
}

function selectOwner(packages: readonly CatalogPackage[], sourcePath: string) {
  return packages
    .filter((entry) => pathContains(entry.packagePath, sourcePath))
    .sort(
      (left, right) =>
        right.packagePath.length - left.packagePath.length ||
        compareStrings(left.pkgname, right.pkgname),
    )[0];
}

export function buildApiTargets(
  sourceManifest: SourceManifest,
  packageCatalog: PackageCatalog,
): ApiTarget[] {
  const moduleById = new Map(sourceManifest.modules.map((module) => [module.id, module]));
  const packagesByModule = new Map<string, CatalogPackage[]>();
  for (const entry of packageCatalog.packages) {
    const entries = packagesByModule.get(entry.moduleId) ?? [];
    entries.push(entry);
    packagesByModule.set(entry.moduleId, entries);
  }

  const targets: ApiTarget[] = [];
  for (const entry of packageCatalog.packages) {
    const module = moduleById.get(entry.moduleId);
    if (!module) {
      throw new DoxygenDiagnostic(
        "DOXYGEN_MODULE_MISSING",
        `Catalog package references an unknown snapshot module: ${entry.pkgname}`,
        { module: entry.moduleId, package: entry.pkgname },
      );
    }
    const modulePackages = packagesByModule.get(module.id) ?? [];
    const inputPaths = module.files
      .filter((file) => file.kind === "source" && selectOwner(modulePackages, file.path) === entry)
      .map((file) => file.path)
      .sort(compareStrings);
    targets.push({
      targetKind: "package",
      targetId: entry.slug,
      displayName: entry.pkgname,
      module,
      packageSlug: entry.slug,
      revisionLabel: entry.revisionLabel,
      inputPaths,
    });
  }

  for (const module of sourceManifest.modules) {
    const modulePackages = packagesByModule.get(module.id) ?? [];
    const inputPaths = module.files
      .filter((file) => file.kind === "source" && !selectOwner(modulePackages, file.path))
      .map((file) => file.path)
      .sort(compareStrings);
    if (inputPaths.length > 0) {
      targets.push({
        targetKind: "module",
        targetId: catalogSlug(module.id),
        displayName: module.displayName,
        module,
        packageSlug: null,
        revisionLabel: module.shortSha,
        inputPaths,
      });
    }
  }

  return targets.sort(
    (left, right) =>
      compareStrings(left.module.id, right.module.id) ||
      compareStrings(left.targetKind, right.targetKind) ||
      compareStrings(left.targetId, right.targetId),
  );
}

export function absoluteSnapshotInput(
  sourcesRoot: string,
  target: ApiTarget,
  inputPath: string,
): string {
  const moduleRoot = path.resolve(sourcesRoot, "modules", target.module.id);
  const resolved = path.resolve(moduleRoot, ...inputPath.split("/"));
  if (!resolved.startsWith(`${moduleRoot}${path.sep}`)) {
    throw new DoxygenDiagnostic("DOXYGEN_INPUT_ESCAPE", "Doxygen input escapes its module root.", {
      module: target.module.id,
      package: target.displayName,
      path: inputPath,
    });
  }
  return resolved;
}
