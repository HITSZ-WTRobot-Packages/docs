import { loadDocumentationBundle } from "../../src/lib/markdown/documentation";
import { readSiteConfig } from "../../src/lib/paths/site-config";

try {
  const config = readSiteConfig();
  const bundle = await loadDocumentationBundle({ basePath: config.basePath });
  const upstreamPages = bundle.pages.filter((page) => page.source.kind === "upstream").length;
  const fallbackPages = bundle.pages.length - upstreamPages;
  console.log(
    `Documentation: ${bundle.pages.length} pages (${upstreamPages} upstream, ${fallbackPages} generated fallbacks), ${bundle.resources.length} resources.`,
  );
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("README generation failed with an unknown error.");
  }
  process.exitCode = 1;
}
