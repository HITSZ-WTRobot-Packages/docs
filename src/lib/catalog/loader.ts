import path from "node:path";

import { buildPackageCatalogFromModules } from "./catalog";
import { CatalogDiagnostic } from "./diagnostic";
import { ModulePackageCatalogSchema, type ModulePackageCatalog } from "./schema";
import { readSourceManifest, type ModuleSnapshot } from "../sources/manifest";
import { readVerifiedModuleArtifact } from "../sources/reader";

export async function loadModulePackageCatalog(
  sourcesRoot: string,
  module: ModuleSnapshot,
): Promise<ModulePackageCatalog> {
  const artifact = module.artifacts.find((entry) => entry.kind === "package-catalog");
  if (!artifact) {
    throw new CatalogDiagnostic(
      "CATALOG_DOCUMENT_MISSING",
      `Module package catalog is missing: ${module.id}`,
      { module: module.id },
    );
  }
  try {
    const contents = await readVerifiedModuleArtifact(sourcesRoot, module, artifact);
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(contents));
    const catalog = ModulePackageCatalogSchema.parse(parsed);
    if (catalog.moduleId !== module.id || catalog.moduleSha !== module.sha) {
      throw new Error("Module package catalog revision metadata does not match its manifest.");
    }
    return catalog;
  } catch (error) {
    if (error instanceof CatalogDiagnostic) throw error;
    throw new CatalogDiagnostic(
      "CATALOG_SCHEMA_INVALID",
      `Module package catalog is invalid: ${module.id}/${artifact.path}`,
      { module: module.id, path: artifact.path },
      { cause: error },
    );
  }
}

export async function loadPackageCatalog(
  repositoryRoot = path.resolve(import.meta.dirname, "../../.."),
) {
  const sourcesRoot = path.join(repositoryRoot, "sources");
  const manifest = await readSourceManifest(sourcesRoot);
  const moduleCatalogs = await Promise.all(
    manifest.modules.map((module) => loadModulePackageCatalog(sourcesRoot, module)),
  );
  return buildPackageCatalogFromModules(manifest, moduleCatalogs);
}
