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

- [ ] All catalog entries have reachable pages and valid breadcrumbs.
- [ ] Search finds module, package, README text, and API symbols under each supported base path.
- [ ] Dependency graph interaction works with keyboard and pointer input.
- [ ] Playwright desktop/mobile screenshots show no overlap, clipping, blank views, or unstable layout.
- [ ] Automated accessibility checks pass the agreed threshold.

## Dependencies

Requires README and Doxygen catalogs.

