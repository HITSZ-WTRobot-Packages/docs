import path from "node:path";

import { readSourceManifest } from "../sources/manifest";
import { readVerifiedSnapshotText } from "../sources/reader";
import { buildPackageCatalog, type CpkgDocument } from "./catalog";

export async function loadPackageCatalog(
  repositoryRoot = path.resolve(import.meta.dirname, "../../.."),
) {
  const sourcesRoot = path.join(repositoryRoot, "sources");
  const manifest = await readSourceManifest(sourcesRoot);
  const documents: CpkgDocument[] = [];
  for (const module of manifest.modules) {
    for (const file of module.files.filter((entry) => entry.kind === "manifest")) {
      documents.push({
        moduleId: module.id,
        filePath: file.path,
        contents: await readVerifiedSnapshotText(sourcesRoot, module, file),
      });
    }
  }
  return buildPackageCatalog(manifest, documents);
}
