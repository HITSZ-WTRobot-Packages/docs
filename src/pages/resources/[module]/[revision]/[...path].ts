import path from "node:path";

import type { APIRoute, GetStaticPaths } from "astro";

import { catalogSlug } from "../../../../lib/catalog/slugs";
import { loadDocumentationResource } from "../../../../lib/markdown/resources";
import { readSourceManifest } from "../../../../lib/sources/manifest";

type ResourceProps = {
  moduleId: string;
  snapshotPath: string;
};

const repositoryRoot = path.resolve(import.meta.dirname, "../../../../..");

export const getStaticPaths: GetStaticPaths = async () => {
  const manifest = await readSourceManifest(`${repositoryRoot}/sources`);
  return manifest.modules.flatMap((module) =>
    module.files
      .filter((file) => file.kind === "asset")
      .map((file) => ({
        params: {
          module: catalogSlug(module.id),
          revision: module.shortSha,
          path: file.path,
        },
        props: { moduleId: module.id, snapshotPath: file.path } satisfies ResourceProps,
      })),
  );
};

export const GET: APIRoute<ResourceProps> = async ({ props }) => {
  const resource = await loadDocumentationResource(
    repositoryRoot,
    props.moduleId,
    props.snapshotPath,
  );
  return new Response(new Uint8Array(resource.contents), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(resource.contents.byteLength),
      "Content-Type": resource.mediaType,
      ETag: `"sha256-${resource.sha256}"`,
    },
  });
};
