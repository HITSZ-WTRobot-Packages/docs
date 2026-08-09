# Frontend Quality Guidelines

## Required Checks

- Formatting, lint, Astro check, strict TypeScript, and unit tests run through Bun.
- Production builds cover `/`, `/docs/`, and `/products/wtr/docs/` with more than one `SITE_URL`.
- Static link checks include routes, fragments, Markdown resources, images, canonical URLs, sitemap,
  robots, 404 behavior, and Pagefind assets.
- Playwright covers desktop and mobile navigation, search, dependency graph keyboard/pointer use,
  deep links, long Chinese/English text, and reduced motion.
- Automated accessibility checks use `@axe-core/playwright` on each major page type and report zero
  serious or critical violations.
- Linkinator checks recursive clean URLs, fragments, and CSS references in each built base-path
  variant; external bot-protection skips are reported separately.
- Screenshot and layout assertions check for blank views, overlap, clipping, unexpected horizontal
  scrolling, and unstable fixed-format controls.

## Page Requirements

- Every package route shows revision, install command, pinned source link, README or explicit
  fallback, direct and reverse dependencies, and API status.
- Breadcrumbs and a static dependency list make all routes reachable without client JavaScript.
- Search distinguishes module, package, README, and API results and supports module, namespace, and
  type filters.
- External dependencies are visually and semantically distinct and never link to a missing internal
  route.

## Forbidden Patterns

- Hard-coded origins, deployment prefixes, or root-relative internal assets.
- Custom search indexing, graph layout, Markdown parsing, or hand-authored icon SVGs.
- Marketing-style landing pages, decorative card grids, nested cards, oversized panel headings,
  viewport-width font sizing, negative letter spacing, or one-hue palettes.
- Client-only critical content or controls without keyboard semantics.

## Review Checklist

- Verify the longest module/package names at both mobile and desktop widths.
- Verify root and nested base builds after any link, asset, search, or routing change.
- Inspect both the hydrated and no-JavaScript page.
- Confirm focus order, accessible names, contrast, and reduced-motion behavior.

## Astro Server Process Ownership

Run all project commands through `bun run`, but allow third-party CLI shebangs to select their
supported runtime. Package scripts set `ASTRO_DEV_BACKGROUND=0` and
`ASTRO_PREVIEW_BACKGROUND=0`; despite the value's spelling, Astro checks whether the variable is
non-empty and therefore disables automatic agent-environment backgrounding. Do not remove these
sentinels or add `--bun` to Astro commands without repeating production build and fresh-server
Playwright checks.
