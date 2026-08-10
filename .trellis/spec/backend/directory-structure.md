# Build Pipeline Directory Structure

## Layout

```text
.github/
  actions/              # Local pinned toolchain setup shared by workflows
  workflows/            # Read-only validation and explicit snapshot synchronization
docs/                   # Contributor operations and future deployment plans
scripts/
  deployment/           # Provider-specific build orchestration with no snapshot synchronization
  toolchain/            # Explicit pinned build-tool installers
  sync/                 # The only subsystem that accesses upstream module repositories
  generate/             # Snapshot-only catalog, README, and Doxygen generators
  validation/           # Convention, link, artifact, and snapshot checks
src/
  content/              # Astro content collections and generated-content adapters
  lib/
    catalog/            # cpkg discovery, schemas, dependency indexes, slugs
    deployment/         # Validated provider environment-to-site configuration
    doxygen/            # XML-to-domain normalization
    markdown/           # README AST transforms and route/resource resolution
    paths/              # SITE_URL/BASE_PATH and safe snapshot path helpers
    sources/            # Read-only manifest and snapshot contracts
    toolchain/          # Shared release validation and atomic tool installation
tests/
  fixtures/             # Small synthetic repositories and parser inputs
  integration/          # Cross-layer build and generation tests
sources/                # Committed upstream snapshots; never hand-edit
```

## Ownership Rules

- CLI argument parsing stays in `scripts/`; reusable behavior belongs in `src/lib/`.
- Upstream repository network and Git operations stay under `scripts/sync/`. The only other network
  boundary is explicit toolchain setup under `scripts/toolchain/` backed by validated shared logic;
  Astro builds never import or invoke either network path.
- Runtime-validated domain types are defined next to their schema and inferred from it. Consumers
  import the shared type instead of redefining a similar shape.
- Intermediate output goes under ignored `.cache/` or `.doxygen/`. Only upstream inputs belong in
  `sources/`; final static output belongs in ignored `dist/`.
- Workflow YAML only orchestrates repository commands. Event validation, synchronization behavior,
  toolchain installation, provider environment mapping, artifact inspection, and link checking
  remain testable scripts or shared modules rather than embedded shell logic.
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
