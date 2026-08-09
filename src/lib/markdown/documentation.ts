import path from "node:path";

import { slug as githubSlug } from "github-slugger";
import type { Element, Root } from "hast";
import { lookup } from "mrmime";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type Plugin } from "unified";
import { visit } from "unist-util-visit";

import type { CatalogPackage } from "../catalog/schema";
import { loadPackageCatalog } from "../catalog/loader";
import { catalogSlug } from "../catalog/slugs";
import { sitePath } from "../paths/site-config";
import { readSourceManifest, type ModuleSnapshot, type SnapshotFile } from "../sources/manifest";
import { resolveMarkdownReference } from "../sources/path-safety";
import { readVerifiedSnapshotText } from "../sources/reader";
import { pinnedUpstreamUrl } from "../sources/upstream-url";
import { CatalogDiagnostic } from "../catalog/diagnostic";
import {
  DocumentationBundleSchema,
  type DocumentationBundle,
  type DocumentationPage,
} from "./documentation-schema";

type PageDefinition = Omit<DocumentationPage, "html" | "source"> & {
  module: ModuleSnapshot;
  file?: SnapshotFile | undefined;
  package?: CatalogPackage | undefined;
  fallbackMarkdown?: string | undefined;
};

type RewriteContext = {
  module: ModuleSnapshot;
  sourcePath: string;
  fileByPath: ReadonlyMap<string, SnapshotFile>;
  pageRouteByPath: ReadonlyMap<string, string>;
  resourceRouteByPath: ReadonlyMap<string, string>;
};

const REFERENCE_PROPERTIES = ["href", "src", "poster", "data"] as const;
const sanitizationSchema = { ...defaultSchema, clobberPrefix: "wtr-" };

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function localSuffix(reference: string, prefixHeading: boolean): string {
  const parsed = new URL(reference, "https://snapshot.invalid/");
  const rawHash = parsed.hash.slice(1);
  const headingHash = prefixHeading ? githubSlug(decodeURIComponent(rawHash)) : rawHash;
  const hash = rawHash ? `#${prefixHeading ? "wtr-" : ""}${headingHash}` : "";
  return `${parsed.search}${hash}`;
}

function rewriteReference(context: RewriteContext, reference: string, property: string): string {
  if (reference.startsWith("#")) {
    return reference.length > 1
      ? `#wtr-${githubSlug(decodeURIComponent(reference.slice(1)))}`
      : reference;
  }
  const resolved = resolveMarkdownReference(context.sourcePath, reference);
  if (!resolved) {
    return reference;
  }
  const file = context.fileByPath.get(resolved);
  if (!file) {
    throw new CatalogDiagnostic(
      "DOCUMENT_REFERENCE_MISSING",
      `Documentation reference is not present in the snapshot: ${reference}`,
      { module: context.module.id, path: context.sourcePath, hint: `Missing target: ${resolved}` },
    );
  }

  const pageRoute = context.pageRouteByPath.get(resolved);
  if (pageRoute) {
    return `${pageRoute}${localSuffix(reference, true)}`;
  }
  const resourceRoute = context.resourceRouteByPath.get(resolved);
  if (resourceRoute) {
    return `${resourceRoute}${localSuffix(reference, false)}`;
  }
  if (property !== "href") {
    throw new CatalogDiagnostic(
      "DOCUMENT_EMBED_TARGET_INVALID",
      `Embedded documentation target is not a synchronized asset: ${reference}`,
      { module: context.module.id, path: context.sourcePath },
    );
  }
  return `${pinnedUpstreamUrl(context.module, "blob", resolved)}${localSuffix(reference, false)}`;
}

const rewriteReferences: Plugin<[RewriteContext], Root> = (context) => (tree) => {
  visit(tree, "element", (node: Element) => {
    for (const property of REFERENCE_PROPERTIES) {
      const value = node.properties[property];
      if (typeof value === "string") {
        node.properties[property] = rewriteReference(context, value, property);
      }
    }
  });
};

const shiftHeadings: Plugin<[], Root> = () => (tree) => {
  visit(tree, "element", (node: Element) => {
    if (/^h[1-5]$/u.test(node.tagName)) {
      const level = Number(node.tagName.slice(1)) + 1;
      node.tagName = `h${level}`;
    }
  });
};

export async function renderSnapshotMarkdown(
  markdown: string,
  context: RewriteContext,
): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rewriteReferences, context)
    .use(shiftHeadings)
    .use(rehypeSlug)
    .use(rehypeSanitize, sanitizationSchema)
    .use(rehypeStringify)
    .process(markdown);
  return String(file);
}

function supplementalRoute(basePath: string, moduleSlug: string, snapshotPath: string): string {
  const extension = path.posix.extname(snapshotPath);
  const withoutExtension = snapshotPath.slice(0, snapshotPath.length - extension.length);
  const segments = withoutExtension.split("/").map(catalogSlug);
  return sitePath(basePath, "modules", moduleSlug, "supplemental", ...segments);
}

function moduleFallback(module: ModuleSnapshot, packages: readonly CatalogPackage[]): string {
  const packageLines = packages.length
    ? packages.map((entry) => `- \`${entry.pkgname}\` (${entry.revisionLabel})`).join("\n")
    : "- No cpkg package manifests are present in this snapshot.";
  return `# ${module.displayName}\n\nNo upstream README is present at revision \`${module.shortSha}\`.\n\n## Packages\n\n${packageLines}\n`;
}

function packageFallback(entry: CatalogPackage): string {
  const dependencyLines = entry.dependencies.length
    ? entry.dependencies.map((dependency) => `- \`${dependency.name}\``).join("\n")
    : "- No declared dependencies.";
  return `# ${entry.pkgname}\n\nNo package README is present in the synchronized snapshot.\n\n- Version: \`${entry.revisionLabel}\`\n- Module: \`${entry.moduleId}\`\n- Manifest: \`${entry.manifestPath}\`\n\n## Dependencies\n\n${dependencyLines}\n`;
}

function selectReadme(files: readonly SnapshotFile[], directory: string): SnapshotFile | undefined {
  return files
    .filter((file) => file.kind === "readme" && path.posix.dirname(file.path) === directory)
    .sort((left, right) => compareStrings(left.path, right.path))[0];
}

function addRoute(routeSet: Set<string>, route: string, context: string): void {
  if (routeSet.has(route)) {
    throw new CatalogDiagnostic(
      "DOCUMENT_ROUTE_DUPLICATE",
      `Duplicate documentation route: ${route}`,
      {
        path: context,
      },
    );
  }
  routeSet.add(route);
}

export async function loadDocumentationBundle(options: {
  repositoryRoot?: string;
  basePath: string;
}): Promise<DocumentationBundle> {
  const repositoryRoot = path.resolve(
    options.repositoryRoot ?? path.join(import.meta.dirname, "../../.."),
  );
  const sourcesRoot = path.join(repositoryRoot, "sources");
  const [manifest, catalog] = await Promise.all([
    readSourceManifest(sourcesRoot),
    loadPackageCatalog(repositoryRoot),
  ]);
  const catalogByModule = new Map<string, CatalogPackage[]>();
  for (const entry of catalog.packages) {
    const entries = catalogByModule.get(entry.moduleId) ?? [];
    entries.push(entry);
    catalogByModule.set(entry.moduleId, entries);
  }

  const definitions: PageDefinition[] = [];
  const pageRoutesByModule = new Map<string, Map<string, string>>();
  const resourceRoutesByModule = new Map<string, Map<string, string>>();
  const routeSet = new Set<string>();
  const resources: DocumentationBundle["resources"] = [];

  for (const module of manifest.modules) {
    const moduleSlug = catalogSlug(module.id);
    const packages = catalogByModule.get(module.id) ?? [];
    const pageRouteByPath = new Map<string, string>();
    const resourceRouteByPath = new Map<string, string>();
    pageRoutesByModule.set(module.id, pageRouteByPath);
    resourceRoutesByModule.set(module.id, resourceRouteByPath);

    for (const file of module.files.filter((entry) => entry.kind === "asset")) {
      const route = sitePath(
        options.basePath,
        "resources",
        moduleSlug,
        module.shortSha,
        ...file.path.split("/"),
      );
      resourceRouteByPath.set(file.path, route.slice(0, -1));
      resources.push({
        moduleId: module.id,
        moduleSlug,
        moduleShortSha: module.shortSha,
        snapshotPath: file.path,
        route: route.slice(0, -1),
        mediaType: lookup(file.path) ?? "application/octet-stream",
      });
    }

    const consumed = new Set<string>();
    const rootReadme = selectReadme(module.files, ".");
    const moduleRoute = sitePath(options.basePath, "modules", moduleSlug);
    addRoute(routeSet, moduleRoute, module.id);
    if (rootReadme) {
      consumed.add(rootReadme.path);
      pageRouteByPath.set(rootReadme.path, moduleRoute);
    }
    definitions.push({
      kind: "module",
      title: module.displayName,
      route: moduleRoute,
      moduleId: module.id,
      moduleSlug,
      packageSlug: null,
      module,
      file: rootReadme,
      fallbackMarkdown: rootReadme ? undefined : moduleFallback(module, packages),
    });

    for (const entry of packages) {
      const readme = selectReadme(module.files, entry.packagePath);
      const route = sitePath(options.basePath, "packages", entry.slug);
      addRoute(routeSet, route, entry.manifestPath);
      if (readme) {
        consumed.add(readme.path);
        if (!pageRouteByPath.has(readme.path)) {
          pageRouteByPath.set(readme.path, route);
        }
      }
      definitions.push({
        kind: "package",
        title: entry.pkgname,
        route,
        moduleId: module.id,
        moduleSlug,
        packageSlug: entry.slug,
        module,
        package: entry,
        file: readme,
        fallbackMarkdown: readme ? undefined : packageFallback(entry),
      });
    }

    for (const file of module.files.filter(
      (entry) =>
        (entry.kind === "markdown" || entry.kind === "readme") && !consumed.has(entry.path),
    )) {
      const route = supplementalRoute(options.basePath, moduleSlug, file.path);
      addRoute(routeSet, route, file.path);
      pageRouteByPath.set(file.path, route);
      definitions.push({
        kind: "supplemental",
        title: path.posix.basename(file.path, path.posix.extname(file.path)),
        route,
        moduleId: module.id,
        moduleSlug,
        packageSlug: null,
        module,
        file,
      });
    }
  }

  const pages: DocumentationPage[] = [];
  for (const definition of definitions) {
    const fileByPath = new Map(definition.module.files.map((file) => [file.path, file]));
    const pageRouteByPath = pageRoutesByModule.get(definition.module.id);
    const resourceRouteByPath = resourceRoutesByModule.get(definition.module.id);
    if (!pageRouteByPath || !resourceRouteByPath) {
      throw new CatalogDiagnostic(
        "DOCUMENT_MODULE_INDEX_MISSING",
        `Documentation index is missing for module: ${definition.module.id}`,
        { module: definition.module.id },
      );
    }
    const markdown = definition.file
      ? await readVerifiedSnapshotText(sourcesRoot, definition.module, definition.file)
      : definition.fallbackMarkdown;
    if (markdown === undefined) {
      throw new CatalogDiagnostic(
        "DOCUMENT_CONTENT_MISSING",
        "Documentation page has no content.",
        {
          module: definition.module.id,
          ...(definition.package ? { package: definition.package.pkgname } : {}),
        },
      );
    }
    const sourcePath = definition.file?.path ?? definition.package?.manifestPath ?? "README.md";
    const html = await renderSnapshotMarkdown(markdown, {
      module: definition.module,
      sourcePath,
      fileByPath,
      pageRouteByPath,
      resourceRouteByPath,
    });
    pages.push({
      kind: definition.kind,
      title: definition.title,
      route: definition.route,
      moduleId: definition.moduleId,
      moduleSlug: definition.moduleSlug,
      packageSlug: definition.packageSlug,
      html,
      source: definition.file
        ? {
            kind: "upstream",
            snapshotPath: definition.file.path,
            upstreamUrl: pinnedUpstreamUrl(definition.module, "blob", definition.file.path),
          }
        : {
            kind: "generated",
            reason:
              definition.kind === "module" ? "MODULE_README_MISSING" : "PACKAGE_README_MISSING",
            upstreamUrl:
              definition.package?.sourceUrl ?? pinnedUpstreamUrl(definition.module, "tree"),
          },
    });
  }

  return DocumentationBundleSchema.parse({
    formatVersion: 1,
    pages: pages.sort((left, right) => compareStrings(left.route, right.route)),
    resources: resources.sort((left, right) => compareStrings(left.route, right.route)),
  });
}

export function serializeDocumentationBundle(bundle: DocumentationBundle): string {
  return `${JSON.stringify(DocumentationBundleSchema.parse(bundle), null, 2)}\n`;
}
