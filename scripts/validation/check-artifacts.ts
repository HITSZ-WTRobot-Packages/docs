import { access, readFile } from "node:fs/promises";
import path from "node:path";

import type { Element, Root } from "hast";
import rehypeParse from "rehype-parse";
import { glob } from "tinyglobby";
import { unified } from "unified";
import { visit } from "unist-util-visit";

import { readSiteConfig } from "../../src/lib/paths/site-config";

const outputRoot = path.resolve("dist");

function canonicalUrl(tree: Root): string | undefined {
  let canonical: string | undefined;
  visit(tree, "element", (node: Element) => {
    if (
      node.tagName === "link" &&
      node.properties.rel?.includes("canonical") &&
      typeof node.properties.href === "string"
    ) {
      canonical = node.properties.href;
    }
  });
  return canonical;
}

async function requireFile(relativePath: string): Promise<void> {
  await access(path.join(outputRoot, relativePath));
}

async function main(): Promise<void> {
  const config = readSiteConfig();
  const required = [
    "404.html",
    "favicon.svg",
    "index.html",
    "quality/index.html",
    "robots.txt",
    "search/index.html",
    "sitemap-index.xml",
    "pagefind/pagefind.js",
  ];
  await Promise.all(required.map(requireFile));

  const htmlFiles = await glob("**/*.html", { cwd: outputRoot, onlyFiles: true });
  if (htmlFiles.length < 90) {
    throw new Error(`Expected at least 90 HTML pages, found ${htmlFiles.length}.`);
  }
  const duplicateBase =
    config.basePath === "/" ? undefined : `${config.basePath}${config.basePath.slice(1)}`;
  for (const relativePath of htmlFiles) {
    const html = await readFile(path.join(outputRoot, relativePath), "utf8");
    const tree = unified().use(rehypeParse).parse(html) as Root;
    const canonical = canonicalUrl(tree);
    if (!canonical) throw new Error(`Missing canonical URL: ${relativePath}`);
    const url = new URL(canonical);
    if (url.origin !== config.siteUrl.origin || !url.pathname.startsWith(config.basePath)) {
      throw new Error(`Canonical URL is outside the configured site: ${canonical}`);
    }
    if (duplicateBase && html.includes(duplicateBase)) {
      throw new Error(`Duplicated BASE_PATH found in ${relativePath}: ${duplicateBase}`);
    }
  }

  const robots = await readFile(path.join(outputRoot, "robots.txt"), "utf8");
  const sitemapUrl = new URL(`${config.basePath}sitemap-index.xml`, config.siteUrl).href;
  if (!robots.includes(`Allow: ${config.basePath}`) || !robots.includes(`Sitemap: ${sitemapUrl}`)) {
    throw new Error("robots.txt does not match the configured site and base path.");
  }
  const sitemap = await readFile(path.join(outputRoot, "sitemap-index.xml"), "utf8");
  if (!sitemap.includes(config.siteUrl.origin + config.basePath)) {
    throw new Error("Sitemap does not contain the configured site and base path.");
  }
  console.log(`Artifact check passed for ${htmlFiles.length} HTML pages at ${config.basePath}.`);
}

await main();
