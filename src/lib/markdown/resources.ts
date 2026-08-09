import path from "node:path";

import { lookup } from "mrmime";

import { CatalogDiagnostic } from "../catalog/diagnostic";
import { readSourceManifest } from "../sources/manifest";
import { readVerifiedSnapshotFile } from "../sources/reader";

export async function loadDocumentationResource(
  repositoryRoot: string,
  moduleId: string,
  snapshotPath: string,
): Promise<{ contents: Buffer; mediaType: string; sha256: string }> {
  const sourcesRoot = path.join(repositoryRoot, "sources");
  const manifest = await readSourceManifest(sourcesRoot);
  const module = manifest.modules.find((entry) => entry.id === moduleId);
  const file = module?.files.find((entry) => entry.path === snapshotPath && entry.kind === "asset");
  if (!module || !file) {
    throw new CatalogDiagnostic(
      "DOCUMENT_RESOURCE_MISSING",
      `Documentation resource is not present in the snapshot: ${moduleId}/${snapshotPath}`,
      { module: moduleId, path: snapshotPath },
    );
  }
  return {
    contents: await readVerifiedSnapshotFile(sourcesRoot, module, file),
    mediaType: lookup(file.path) ?? "application/octet-stream",
    sha256: file.sha256,
  };
}
