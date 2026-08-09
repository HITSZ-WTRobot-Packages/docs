import path from "node:path";

import type { PackageCatalog } from "../catalog/schema";
import { loadPackageCatalog } from "../catalog/loader";
import type { ApiCatalog } from "../doxygen/schema";
import { loadApiCatalog } from "../doxygen/generator";
import type { DocumentationBundle } from "../markdown/documentation-schema";
import { loadDocumentationBundle } from "../markdown/documentation";
import { readSiteConfig, type SiteConfig } from "../paths/site-config";

export type PortalData = {
  config: SiteConfig;
  catalog: PackageCatalog;
  documentation: DocumentationBundle;
  api: ApiCatalog;
};

let defaultPortalData: Promise<PortalData> | undefined;

async function createPortalData(repositoryRoot: string, config: SiteConfig): Promise<PortalData> {
  const [catalog, documentation, api] = await Promise.all([
    loadPackageCatalog(repositoryRoot),
    loadDocumentationBundle({ repositoryRoot, basePath: config.basePath }),
    loadApiCatalog({ repositoryRoot }),
  ]);
  return { config, catalog, documentation, api };
}

export function loadPortalData(): Promise<PortalData> {
  defaultPortalData ??= createPortalData(
    path.resolve(import.meta.dirname, "../../.."),
    readSiteConfig(),
  );
  return defaultPortalData;
}
