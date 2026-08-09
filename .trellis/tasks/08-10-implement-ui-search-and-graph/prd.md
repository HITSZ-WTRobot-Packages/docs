# Implement UI, Search, and Dependency Graph

## Goal

Deliver the complete user-facing documentation experience over the catalog, README, and API data.

## Requirements

- Implement home/catalog, module, package, supplemental Markdown, API, quality-state, and 404 pages.
- Package pages show revision, install command, source links, manual/fallback, direct dependencies,
  reverse dependencies, and API status.
- Use Pagefind for static README/API search and filters for module, namespace, and result type.
- Use the selected graph library for lazy direct/transitive/reverse dependency exploration.
- Render external dependencies distinctly and never generate invalid internal links.
- Meet responsive, keyboard, semantic HTML, contrast, reduced-motion, and text-overflow requirements.
- Use icons from the selected existing icon library; do not create custom SVG UI icons.

## Acceptance Criteria

- [x] All catalog entries have reachable pages and valid breadcrumbs.
- [x] Search finds module, package, README text, and API symbols under each supported base path.
- [x] Dependency graph interaction works with keyboard and pointer input.
- [x] Playwright desktop/mobile screenshots show no overlap, clipping, blank views, or unstable layout.
- [x] Automated accessibility checks pass the agreed threshold.

## Dependencies

Requires README and Doxygen catalogs.

## Implementation Notes

- Static Astro routes cover the catalog, modules, packages, supplemental Markdown, API references,
  quality states, search, resources, and Starlight's generated 404 page.
- Pagefind loads from the configured base path, indexes page metadata and filters, restores URL
  state, and exposes a retryable failure state for development or asset failures.
- Cytoscape loads only after the native dependency explorer opens. Direct, transitive, and reverse
  modes work from keyboard or pointer input, persist in the URL, and have an accessible node list.
- Desktop and mobile Playwright suites cover root and `/products/wtr/docs/` deployments, axe serious
  and critical violations, layout overflow, screenshots, 404 behavior, and nonblank canvas pixels.
- Starlight-owned sidebar entries remain site-relative until rendering so nested deployment prefixes
  are applied exactly once; the nested browser suite checks the final href and clicks it.
