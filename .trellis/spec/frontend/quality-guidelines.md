# Frontend Quality Guidelines

## Required Checks

- Formatting, lint, Astro check, strict TypeScript, and unit tests run through Bun.
- Production builds cover `/`, `/docs/`, and `/products/wtr/docs/` with more than one `SITE_URL`.
- Built root and deep pages declare `lang="zh-CN"`; repository-owned visible and accessibility copy
  is Simplified Chinese, while synchronized upstream documentation keeps its original language.
- Static link checks include routes, fragments, Markdown resources, images, canonical URLs, sitemap,
  robots, 404 behavior, and Pagefind assets.
- Playwright covers desktop and mobile navigation, search, dependency graph keyboard/pointer use,
  deep links, long Chinese/English text, and reduced motion.
- Automated accessibility checks use `@axe-core/playwright` on each major page type and report zero
  serious or critical violations.
- Linkinator checks recursive clean URLs, fragments, and CSS references in each built base-path
  variant; external bot-protection skips are reported separately.
- Artifact validation requires the generated 404, robots, sitemap, Pagefind entry point, favicon,
  quality/search routes, per-page canonical URLs, and no duplicated deployment prefix.
- Artifact validation requires every repository-owned guide scaffold route. Empty scaffold pages
  must retain `pagefind: false` so their titles do not produce empty search results.
- The release artifact check must prove every module/package route carries its validated revision,
  README or explicit fallback, and dependencies, while every API route carries the configured source
  branch and API quality state. Pagefind's parsed page count must exactly match the currently
  published documentation, API, catalog, and quality pages so empty guide scaffolds cannot enter the
  index unnoticed: `documentation.pages.length + api.references.length + 2`.
- Screenshot and layout assertions check for blank views, overlap, clipping, unexpected horizontal
  scrolling, and unstable fixed-format controls.
- Manually inspect canvas screenshots after graph style/layout changes. Browser `scrollWidth`
  assertions and axe cannot detect a Cytoscape label clipped within an otherwise valid canvas.
- Prefer wrapped API signatures over horizontally scrollable `pre` regions. If scrolling is
  unavoidable, the region must be keyboard-focusable and have an accessible name.

## Page Requirements

- Every package route shows revision, install command, pinned source link, README or explicit
  fallback, direct and reverse dependencies, and API status.
- Breadcrumbs and a static dependency list make all routes reachable without client JavaScript.
- The shared sidebar presents guide groups, a flat catalog-derived driver-package group linking
  directly to module README routes, and reference links. It must not contain redundant module
  overview children or expand package routes.
- Search distinguishes module, package, README, and API results and supports module, namespace, and
  type filters.
- External dependencies are visually and semantically distinct and never link to a missing internal
  route.

## Simplified Chinese Display Contract

The root route is the only locale and uses `zh-CN`; do not add a `/zh-CN/` prefix or a language
switcher. Starlight owns framework translations and document language metadata, while the project
i18n collection supplies missing Pagefind, heading-anchor, and Expressive Code strings.

Brand copy uses these exact names: `哈尔滨工业大学（深圳）南工问天` for the team in Chinese,
`HITSZ WTRobot` for the team in English, and `HITSZ-WTRobot-Packages` for the project. Treat spacing,
punctuation, capitalization, and hyphens as part of the public contract.

```ts
starlight({
  locales: { root: { label: "简体中文", lang: "zh-CN" } },
});
```

Repository-owned page copy, accessibility names, client status messages, and generated README
fallbacks are Simplified Chinese. Package/module names, API symbols, diagnostic codes, paths,
commands, query parameters, and serialized enum/filter values remain unchanged. Translate stable
domain values only at the view boundary:

```ts
// Stable value used in generated data and filters.
const status = "sparse";

// Chinese label rendered by Astro or a client component.
const label = apiStatusLabel(status); // "文档稀疏"
```

Synchronized Markdown and its resources remain byte-for-byte unchanged under `sources/` and render
in their original language. Never translate upstream descriptions during synchronization or
generation. Artifact validation must parse every emitted HTML document and require `lang="zh-CN"`,
then require Pagefind's language map to contain only `zh-cn`. Playwright must assert the root and a
deep route language tag, representative Chinese controls and status updates, stable URL/filter
values after reload, and unchanged upstream content.

Wrong: change `data-graph-mode="transitive"` to a Chinese value or rewrite an upstream README.

Correct: retain `transitive` in data/URL state, render `传递`, and map snapshot/API warning codes to
Chinese messages in the project-owned view model.

## Forbidden Patterns

- Hard-coded origins, deployment prefixes, or root-relative internal assets.
- Custom search indexing, graph layout, Markdown parsing, or hand-authored icon SVGs.
- Marketing-style landing pages, decorative card grids, nested cards, oversized panel headings,
  viewport-width font sizing, negative letter spacing, or one-hue palettes.
- Client-only critical content or controls without keyboard semantics.

## Review Checklist

- Verify the longest module/package names at both mobile and desktop widths.
- Verify root and nested base builds after any link, asset, search, or routing change.
- Inspect built HTML for duplicated base segments such as `/docs/docs/`, and click at least one
  Starlight-owned sidebar link in the nested-base browser suite.
- Inspect both the hydrated and no-JavaScript page.
- Confirm focus order, accessible names, contrast, and reduced-motion behavior.
- Never reuse a static artifact under a different origin/base pair. Repeat the build, artifact,
  links, browser, search, screenshot, responsive, and axe checks after a production-address or
  custom-domain change.

## Astro Server Process Ownership

Run all project commands through `bun run`, but allow third-party CLI shebangs to select their
supported runtime. Package scripts set `ASTRO_DEV_BACKGROUND=0` and
`ASTRO_PREVIEW_BACKGROUND=0`; despite the value's spelling, Astro checks whether the variable is
non-empty and therefore disables automatic agent-environment backgrounding. Do not remove these
sentinels or add `--bun` to Astro commands without repeating production build and fresh-server
Playwright checks.

Playwright standalone mode builds before preview. Once a release workflow has validated `dist/`, set
`PLAYWRIGHT_REUSE_ARTIFACT=1` so its web server starts preview only and the browser/axe suite covers
the exact artifact that will be uploaded. The build, artifact, link, and browser steps must share
the same `SITE_URL` and `BASE_PATH`.
