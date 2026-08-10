import path from "node:path";

import { readSourceManifest, type ModuleSnapshot } from "../sources/manifest";
import { readVerifiedModuleArtifact } from "../sources/reader";
import { DoxygenDiagnostic } from "./diagnostic";
import { ApiCatalogSchema, type ApiCatalog } from "./schema";
import { readDoxygenVersionLock } from "./version";

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function loadModuleApiCatalog(
  sourcesRoot: string,
  module: ModuleSnapshot,
): Promise<ApiCatalog> {
  const artifact = module.artifacts.find((entry) => entry.kind === "api-catalog");
  if (!artifact) {
    throw new DoxygenDiagnostic(
      "DOXYGEN_OUTPUT_MISSING",
      `Module API catalog is missing: ${module.id}`,
      { module: module.id },
    );
  }
  try {
    const contents = await readVerifiedModuleArtifact(sourcesRoot, module, artifact);
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(contents));
    const catalog = ApiCatalogSchema.parse(parsed);
    if (
      catalog.references.some(
        (reference) => reference.moduleId !== module.id || reference.moduleSha !== module.sha,
      )
    ) {
      throw new Error("Module API catalog revision metadata does not match its manifest.");
    }
    return catalog;
  } catch (error) {
    if (error instanceof DoxygenDiagnostic) throw error;
    throw new DoxygenDiagnostic(
      "DOXYGEN_XML_INVALID",
      `Module API catalog is invalid: ${module.id}/${artifact.path}`,
      { module: module.id, path: artifact.path },
      { cause: error },
    );
  }
}

export async function loadApiCatalog(
  options: { repositoryRoot?: string } = {},
): Promise<ApiCatalog> {
  const repositoryRoot = options.repositoryRoot ?? path.resolve(import.meta.dirname, "../../..");
  const sourcesRoot = path.join(repositoryRoot, "sources");
  const [manifest, expectedVersion] = await Promise.all([
    readSourceManifest(sourcesRoot),
    readDoxygenVersionLock(repositoryRoot),
  ]);
  const moduleCatalogs = await Promise.all(
    manifest.modules.map((module) => loadModuleApiCatalog(sourcesRoot, module)),
  );
  for (const catalog of moduleCatalogs) {
    if (catalog.doxygenVersion !== expectedVersion) {
      throw new DoxygenDiagnostic(
        "DOXYGEN_VERSION_MISMATCH",
        `Persisted API data uses Doxygen ${catalog.doxygenVersion}, but ${expectedVersion} is required.`,
        { expectedVersion, actualVersion: catalog.doxygenVersion },
      );
    }
  }
  return ApiCatalogSchema.parse({
    formatVersion: 1,
    doxygenVersion: expectedVersion,
    references: moduleCatalogs
      .flatMap((catalog) => catalog.references)
      .sort(
        (left, right) =>
          compareStrings(left.moduleId, right.moduleId) ||
          compareStrings(left.targetKind, right.targetKind) ||
          compareStrings(left.targetId, right.targetId),
      ),
  });
}
