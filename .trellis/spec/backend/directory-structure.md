# Build Pipeline Directory Structure

## Layout

```text
.github/
  actions/              # Local pinned toolchain setup shared by workflows
  workflows/            # Read-only validation and explicit snapshot synchronization
docs/                   # Contributor operations and future deployment plans
scripts/
  sync/                 # The only network-aware subsystem
  generate/             # Snapshot-only catalog, README, and Doxygen generators
  validation/           # Convention, link, artifact, and snapshot checks
src/
  content/              # Astro content collections and generated-content adapters
  lib/
    catalog/            # cpkg discovery, schemas, dependency indexes, slugs
    doxygen/            # XML-to-domain normalization
    markdown/           # README AST transforms and route/resource resolution
    paths/              # SITE_URL/BASE_PATH and safe snapshot path helpers
    sources/            # Read-only manifest and snapshot contracts
tests/
  fixtures/             # Small synthetic repositories and parser inputs
  integration/          # Cross-layer build and generation tests
sources/                # Committed upstream snapshots; never hand-edit
```

## Ownership Rules

- CLI argument parsing stays in `scripts/`; reusable behavior belongs in `src/lib/`.
- Network and Git operations stay under `scripts/sync/`. Files imported by the Astro build must not
  import them.
- Runtime-validated domain types are defined next to their schema and inferred from it. Consumers
  import the shared type instead of redefining a similar shape.
- Intermediate output goes under ignored `.cache/` or `.doxygen/`. Only upstream inputs belong in
  `sources/`; final static output belongs in ignored `dist/`.
- Workflow YAML only orchestrates repository commands. Event validation, synchronization behavior,
  artifact inspection, and link checking remain testable scripts rather than embedded shell logic.
- Tests mirror domain ownership and use `tests/fixtures/` for external formats.

## Naming

- TypeScript modules and route segments use `kebab-case`.
- Exported types and components use `PascalCase`; functions and values use `camelCase`.
- A CLI entry file ends in `-cli.ts`; a Zod schema export ends in `Schema`.
- Stable package routes use validated slugs derived by one catalog helper, never inline string
  replacement.

## Forbidden Layouts

- Do not place network calls in Astro pages, content loaders, or components.
- Do not import from `scripts/` into `src/`.
- Do not store generated catalogs beside upstream files under `sources/`.
- Do not introduce a second implementation of URL, slug, checksum, or safe-path logic.
