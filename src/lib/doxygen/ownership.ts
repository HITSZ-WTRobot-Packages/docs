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
  projectNumber: string;
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

export function buildModuleApiTargets(
  module: ModuleSnapshot,
  packageCatalog: PackageCatalog,
  sourcePaths: readonly string[],
): ApiTarget[] {
  const modulePackages = packageCatalog.packages.filter((entry) => entry.moduleId === module.id);
  const targets: ApiTarget[] = modulePackages.map((entry) => ({
    targetKind: "package",
    targetId: entry.slug,
    displayName: entry.pkgname,
    module,
    packageSlug: entry.slug,
    projectNumber: entry.version,
    inputPaths: sourcePaths
      .filter((sourcePath) => selectOwner(modulePackages, sourcePath) === entry)
      .sort(compareStrings),
  }));
  const unowned = sourcePaths
    .filter((sourcePath) => !selectOwner(modulePackages, sourcePath))
    .sort(compareStrings);
  if (unowned.length > 0) {
    targets.push({
      targetKind: "module",
      targetId: catalogSlug(module.id),
      displayName: module.displayName,
      module,
      packageSlug: null,
      projectNumber: module.branch,
      inputPaths: unowned,
    });
  }
  return targets.sort(
    (left, right) =>
      compareStrings(left.targetKind, right.targetKind) ||
      compareStrings(left.targetId, right.targetId),
  );
}

export function buildApiTargets(
  sourceManifest: SourceManifest,
  packageCatalog: PackageCatalog,
  sourcePathsByModule: ReadonlyMap<string, readonly string[]>,
): ApiTarget[] {
  const targets: ApiTarget[] = [];
  for (const module of sourceManifest.modules) {
    const sourcePaths = sourcePathsByModule.get(module.id);
    if (!sourcePaths) {
      throw new DoxygenDiagnostic(
        "DOXYGEN_MODULE_MISSING",
        `Doxygen source input index is missing for module: ${module.id}`,
        { module: module.id },
      );
    }
    targets.push(...buildModuleApiTargets(module, packageCatalog, sourcePaths));
  }
  return targets.sort(
    (left, right) =>
      compareStrings(left.module.id, right.module.id) ||
      compareStrings(left.targetKind, right.targetKind) ||
      compareStrings(left.targetId, right.targetId),
  );
}

export function absoluteModuleInput(
  moduleRoot: string,
  target: ApiTarget,
  inputPath: string,
): string {
  const root = path.resolve(moduleRoot);
  const resolved = path.resolve(root, ...inputPath.split("/"));
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new DoxygenDiagnostic("DOXYGEN_INPUT_ESCAPE", "Doxygen input escapes its module root.", {
      module: target.module.id,
      package: target.displayName,
      path: inputPath,
    });
  }
  return resolved;
}
