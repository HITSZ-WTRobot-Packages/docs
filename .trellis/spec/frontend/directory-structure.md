# Frontend Directory Structure

## Layout

```text
src/
  components/
    catalog/             # Dense package/module browsing controls
    dependency-graph/    # Lazy graph island and accessible alternatives
    documentation/       # README, API, metadata, and quality presentation
  content/               # Starlight content configuration/adapters
  layouts/               # Page-level composition, not decorative cards
  lib/                   # Shared catalog, route, and URL helpers
  pages/                 # Astro routes and generated route entry points
  styles/                # Tokens, global Starlight overrides, component CSS
public/                  # Repository-owned static files copied unchanged
```

## Organization

- Route files load validated build-time data and delegate presentation to components.
- Components are grouped by domain. A reusable primitive belongs in `components/`, while domain
  helpers remain with their feature.
- Put interactive graph/search code in the smallest possible client island; all surrounding
  content renders as static HTML.
- One shared path helper owns internal URLs and asset prefixes. Do not concatenate `BASE_PATH` in a
  component.
- Upstream assets are addressed through generated mappings; never import a path from `sources/`
  directly into browser code.

## Naming

- Astro and framework component files use `PascalCase`.
- Utilities, styles, and route folders use `kebab-case`.
- Dynamic route parameters use stable catalog slugs, not display names.
- CSS custom properties use the `--wtr-` prefix for project-owned design tokens.

## Page Boundaries

Provide home/catalog, module, package, supplemental Markdown, API, quality-state, and 404 routes.
Every catalog entry must be reachable from static navigation without requiring JavaScript.
