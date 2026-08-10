import { access, lstat, readFile } from "node:fs/promises";
import path from "node:path";

import type { Element, Root, Text } from "hast";
import rehypeParse from "rehype-parse";
import { glob } from "tinyglobby";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { z } from "zod";

import { readSiteConfig } from "../../src/lib/paths/site-config";
import { loadPortalData } from "../../src/lib/site/portal-data";
import { apiStatusLabel } from "../../src/lib/site/view-models";
import {
  artifactPathIssue,
  credentialSignals,
  pageArtifactPath,
  resourceArtifactPath,
} from "./release-contract";

const outputRoot = path.resolve("dist");
const textArtifactExtensions = new Set([".css", ".html", ".js", ".json", ".svg", ".txt", ".xml"]);

const PagefindEntrySchema = z.looseObject({
  version: z.string().min(1),
  languages: z.record(
    z.string(),
    z.looseObject({
      page_count: z.number().int().nonnegative(),
    }),
  ),
});

type ParsedHtml = {
  contents: string;
  tree: Root;
  text: string;
};

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

function documentLanguage(tree: Root): string | undefined {
  let language: string | undefined;
  visit(tree, "element", (node: Element) => {
    if (node.tagName === "html" && typeof node.properties.lang === "string") {
      language = node.properties.lang;
    }
  });
  return language;
}

async function requireFile(relativePath: string): Promise<void> {
  await access(path.join(outputRoot, relativePath));
}

function documentText(tree: Root): string {
  const values: string[] = [];
  visit(tree, "text", (node: Text) => values.push(node.value));
  return values.join(" ").replace(/\s+/gu, " ").trim();
}

function requireText(page: ParsedHtml, expected: string, relativePath: string): void {
  if (!page.text.includes(expected)) {
    throw new Error(`${relativePath} does not contain required release metadata: ${expected}`);
  }
}

async function inspectArtifactTree(): Promise<string[]> {
  const entries = await glob("**/*", {
    cwd: outputRoot,
    dot: true,
    followSymbolicLinks: false,
    onlyFiles: false,
  });
  const files: string[] = [];
  for (const relativePath of entries) {
    const issue = artifactPathIssue(relativePath);
    if (issue) throw new Error(`Unsafe deployment artifact path ${relativePath}: ${issue}.`);
    const status = await lstat(path.join(outputRoot, relativePath));
    if (status.isSymbolicLink()) {
      throw new Error(`Deployment artifact contains a symbolic link: ${relativePath}`);
    }
    if (status.isFile()) files.push(relativePath);
  }

  for (const relativePath of files) {
    if (!textArtifactExtensions.has(path.extname(relativePath).toLowerCase())) continue;
    const contents = await readFile(path.join(outputRoot, relativePath), "utf8");
    const signals = credentialSignals(contents);
    if (signals.length > 0) {
      throw new Error(
        `Deployment artifact ${relativePath} contains credential signal(s): ${signals.join(", ")}.`,
      );
    }
  }
  return files;
}

async function main(): Promise<void> {
  const config = readSiteConfig();
  const data = await loadPortalData();
  const required = [
    "404.html",
    "favicon.svg",
    "index.html",
    "quality/index.html",
    "robots.txt",
    "search/index.html",
    "sitemap-index.xml",
    "pagefind/pagefind-entry.json",
    "pagefind/pagefind.js",
    "pagefind/pagefind-worker.js",
  ];
  await Promise.all(required.map(requireFile));

  const artifactFiles = await inspectArtifactTree();
  const htmlFiles = artifactFiles.filter((relativePath) => relativePath.endsWith(".html"));
  if (htmlFiles.length < 90) {
    throw new Error(`Expected at least 90 HTML pages, found ${htmlFiles.length}.`);
  }
  const parsedHtml = new Map<string, ParsedHtml>();
  const duplicateBase =
    config.basePath === "/" ? undefined : `${config.basePath}${config.basePath.slice(1)}`;
  for (const relativePath of htmlFiles) {
    const contents = await readFile(path.join(outputRoot, relativePath), "utf8");
    const tree = unified().use(rehypeParse).parse(contents) as Root;
    parsedHtml.set(relativePath, { contents, tree, text: documentText(tree) });
    if (documentLanguage(tree) !== "zh-CN") {
      throw new Error(`Document language is not zh-CN: ${relativePath}`);
    }
    const canonical = canonicalUrl(tree);
    if (!canonical) throw new Error(`Missing canonical URL: ${relativePath}`);
    const url = new URL(canonical);
    if (url.origin !== config.siteUrl.origin || !url.pathname.startsWith(config.basePath)) {
      throw new Error(`Canonical URL is outside the configured site: ${canonical}`);
    }
    if (duplicateBase && contents.includes(duplicateBase)) {
      throw new Error(`Duplicated BASE_PATH found in ${relativePath}: ${duplicateBase}`);
    }
  }

  const catalogPage = parsedHtml.get("index.html");
  if (!catalogPage) throw new Error("Missing catalog route: index.html");
  requireText(catalogPage, "HITSZ-WTRobot-Packages", "index.html");
  requireText(catalogPage, "哈尔滨工业大学（深圳）南工问天", "index.html");
  requireText(catalogPage, "HITSZ WTRobot", "index.html");

  for (const documentation of data.documentation.pages) {
    const relativePath = pageArtifactPath(documentation.route, config.basePath);
    if (!parsedHtml.has(relativePath)) {
      throw new Error(`Missing generated documentation route: ${documentation.route}`);
    }
  }

  for (const module of data.catalog.modules) {
    const relativePath = `modules/${module.slug}/index.html`;
    const page = parsedHtml.get(relativePath);
    if (!page) throw new Error(`Missing module route: ${module.id}`);
    requireText(page, module.displayName, relativePath);
    requireText(page, module.shortSha, relativePath);
  }

  for (const packageEntry of data.catalog.packages) {
    const documentation = data.documentation.pages.find(
      (page) => page.kind === "package" && page.packageSlug === packageEntry.slug,
    );
    const api = data.api.references.find(
      (reference) =>
        reference.targetKind === "package" && reference.packageSlug === packageEntry.slug,
    );
    if (!documentation || !api) {
      throw new Error(`Package release data is incomplete: ${packageEntry.pkgname}`);
    }
    if (
      api.moduleSha !== packageEntry.moduleSha ||
      api.revisionLabel !== packageEntry.revisionLabel
    ) {
      throw new Error(`Package revision metadata is inconsistent: ${packageEntry.pkgname}`);
    }

    const packagePath = `packages/${packageEntry.slug}/index.html`;
    const packagePage = parsedHtml.get(packagePath);
    if (!packagePage) throw new Error(`Missing stable package route: ${packageEntry.pkgname}`);
    for (const expected of [
      packageEntry.pkgname,
      packageEntry.revisionLabel,
      `cpkg add ${packageEntry.pkgname}`,
      apiStatusLabel(api.status),
      ...packageEntry.dependencies.map((dependency) => dependency.name),
      ...packageEntry.reverseDependencies.map((dependency) => dependency.name),
    ]) {
      requireText(packagePage, expected, packagePath);
    }
    if (documentation.source.kind === "generated") {
      requireText(packagePage, "生成式降级内容", packagePath);
    }

    const apiPath = `packages/${packageEntry.slug}/api/index.html`;
    const apiPage = parsedHtml.get(apiPath);
    if (!apiPage) throw new Error(`Missing stable package API route: ${packageEntry.pkgname}`);
    requireText(apiPage, `${packageEntry.pkgname} API`, apiPath);
    requireText(apiPage, packageEntry.revisionLabel, apiPath);
    requireText(apiPage, apiStatusLabel(api.status), apiPath);
  }

  for (const reference of data.api.references.filter((entry) => entry.targetKind === "module")) {
    const module = data.catalog.modules.find((entry) => entry.id === reference.moduleId);
    if (!module)
      throw new Error(`Module API reference has no catalog module: ${reference.moduleId}`);
    const relativePath = `modules/${module.slug}/api/index.html`;
    const page = parsedHtml.get(relativePath);
    if (!page) throw new Error(`Missing module API route: ${reference.moduleId}`);
    requireText(page, apiStatusLabel(reference.status), relativePath);
  }

  const expectedResources = new Set(
    data.documentation.resources.map((resource) =>
      resourceArtifactPath(resource.route, config.basePath),
    ),
  );
  const actualResources = artifactFiles.filter((relativePath) =>
    relativePath.startsWith("resources/"),
  );
  for (const relativePath of actualResources) {
    if (!expectedResources.has(relativePath)) {
      throw new Error(
        `Deployment artifact contains an unapproved upstream resource: ${relativePath}`,
      );
    }
  }
  for (const relativePath of expectedResources) {
    if (!actualResources.includes(relativePath)) {
      throw new Error(
        `Deployment artifact is missing an approved upstream resource: ${relativePath}`,
      );
    }
  }

  const pagefindEntry = PagefindEntrySchema.parse(
    JSON.parse(await readFile(path.join(outputRoot, "pagefind/pagefind-entry.json"), "utf8")),
  );
  const pagefindLanguages = Object.keys(pagefindEntry.languages);
  const chineseIndex = pagefindEntry.languages["zh-cn"];
  if (!chineseIndex || pagefindLanguages.some((language) => language !== "zh-cn")) {
    throw new Error(
      `Pagefind languages must contain only zh-cn; received: ${pagefindLanguages.join(", ") || "none"}.`,
    );
  }
  const indexedPages = chineseIndex.page_count;
  const minimumIndexedPages = data.catalog.packages.length * 2 + data.catalog.modules.length;
  if (indexedPages < minimumIndexedPages) {
    throw new Error(
      `Pagefind indexed ${indexedPages} pages; expected at least ${minimumIndexedPages} package/module pages.`,
    );
  }
  const pagefindIndexes = artifactFiles.filter((relativePath) =>
    /^pagefind\/(?:fragment|index)\/.+\.pf_(?:fragment|index)$/u.test(relativePath),
  );
  if (pagefindIndexes.length === 0) throw new Error("Pagefind emitted no fragment or index files.");

  const robots = await readFile(path.join(outputRoot, "robots.txt"), "utf8");
  const sitemapUrl = new URL(`${config.basePath}sitemap-index.xml`, config.siteUrl).href;
  if (!robots.includes(`Allow: ${config.basePath}`) || !robots.includes(`Sitemap: ${sitemapUrl}`)) {
    throw new Error("robots.txt does not match the configured site and base path.");
  }
  const sitemap = await readFile(path.join(outputRoot, "sitemap-index.xml"), "utf8");
  if (!sitemap.includes(config.siteUrl.origin + config.basePath)) {
    throw new Error("Sitemap does not contain the configured site and base path.");
  }
  console.log(
    `Release artifact passed: ${data.catalog.modules.length} modules, ` +
      `${data.catalog.packages.length} packages, ${data.api.references.length} API references, ` +
      `${htmlFiles.length} HTML pages, ${indexedPages} indexed pages, ${artifactFiles.length} files ` +
      `at ${config.siteUrl.origin}${config.basePath}.`,
  );
}

await main();
