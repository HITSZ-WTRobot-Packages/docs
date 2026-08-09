# HITSZ WTR Packages Documentation

Static, searchable documentation for the reusable STM32 packages maintained by
`HITSZ-WTRobot-Packages`.

The site is built from committed files under `sources/`. Normal builds, tests, and previews do not
contact upstream repositories. Network access is isolated to an explicit synchronization command.

## Project Contract

- Bun is the only JavaScript runtime and package manager. Commit `bun.lock`; do not create npm,
  pnpm, or Yarn lockfiles.
- Astro and Starlight produce a static site. `SITE_URL` and `BASE_PATH` are the only deployment
  address inputs.
- When Python is necessary, use uv with its normal project `.venv` and global cache behavior.
- Prefer maintained libraries to custom parsers, renderers, search indexes, or graph layout code.
- Never edit upstream module repositories from this repository.
- Record upstream or architectural problems in `issues.md`.

## Repository Layout

| Path             | Purpose                                                                      |
| ---------------- | ---------------------------------------------------------------------------- |
| `src/`           | Astro pages, components, build-time loaders, and shared TypeScript contracts |
| `scripts/`       | Bun CLIs for synchronization, generation, and validation                     |
| `sources/`       | Tracked upstream snapshots and their manifest                                |
| `tests/`         | Unit, integration, browser, accessibility, and fixture coverage              |
| `public/`        | Static assets owned by this repository                                       |
| `docs/`          | Operational and deployment documentation                                     |
| `.trellis/spec/` | Executable conventions for contributors and agents                           |

## Command Contract

The repository provides these Bun commands. CI and contributor documentation call the same commands
rather than duplicate their logic in workflow shell.

```text
bun install --frozen-lockfile
bun run dev
bun run sync [--module <name> | --changed] [--dry-run]
bun run generate:catalog
bun run generate:readme
bun run generate:api
bun run generate
bun run lint
bun run typecheck
bun run test
bun run test:e2e
bun run check:artifacts
bun run check:links
bun run check
bun run build
```

Use `SITE_URL=https://example.invalid` and `BASE_PATH=/` for a root build. `BASE_PATH` may also be a
nested path such as `/products/wtr/docs/`; code must not contain a repository-specific deployment
prefix.

## Source Synchronization

`bun run sync` is the repository's only network-aware command. It shallow-clones the six allowlisted
module repositories into operating-system temporary storage, resolves each branch to a full commit
SHA, and validates the complete candidate before changing tracked files.

```text
bun run sync                         # refresh every allowlisted module
bun run sync --module MotorDrivers   # refresh one module
bun run sync --changed               # skip modules at an intact, unchanged SHA
bun run sync --changed --dry-run     # validate and report without writing sources/
```

The synchronized closure contains available `cpkg.toml`, README and transitively referenced
Markdown/assets, C/C++ Doxygen inputs, and license files. Local Markdown references must remain
inside their module; symlinks, missing targets, unsafe paths, and configured size-limit violations
fail the operation. Missing package manifests, README content, or licenses are retained as explicit
upstream-quality warnings so source-only modules still have reproducible snapshots.

Each successful snapshot is stored under `sources/modules/<module>/`. `sources/manifest.json` has
`formatVersion: 1` and records the module repository, branch, full and abbreviated SHAs, aggregate
byte count, warnings, license paths, and every selected file's path, kind, byte count, and SHA-256.
All arrays use stable ordering and the manifest contains no timestamp, so an identical rerun leaves
the worktree byte-for-byte unchanged. A dry-run or failed validation preserves the last complete
snapshot.

## Package Catalog

`bun run generate:catalog` verifies every synchronized `cpkg.toml` and builds the shared catalog in
memory without network access or tracked output. Package discovery uses the snapshot manifest, so a
new upstream package is included automatically after synchronization.

The catalog accepts current manifests with an omitted `format_version` or `format_version = 1` and
strictly validates package identity, semantic version shape, dependency names, snapshot checksums,
and paths. Internal dependencies resolve to stable package slugs and reverse-dependency entries; the
exact approved external set is `FreeRTOS`, `stm32cubemx`, and `VelocityProfile::SCurve`. Duplicate
names/slugs and any other unresolved dependency fail generation. Source links are pinned to the
module's full snapshot SHA and displayed revisions use `<version>+<short-sha>`.

## README Documentation

`bun run generate:readme` validates and renders module, package, and README-linked supplemental
Markdown entirely from the committed snapshot. Module and package README files become their primary
pages; packages without README content receive deterministic cpkg-derived fallback content.

Relative Markdown pages, headings, images, and attachments are resolved through the snapshot file
index. Page and resource routes use the shared base-path helper, while upstream source links are
pinned to the full module SHA. GFM and raw HTML pass through the unified/remark/rehype pipeline and
an explicit sanitization schema. Missing, checksum-mismatched, or escaping local references fail
generation with source context rather than producing a broken page.

## Doxygen API Reference

`bun run generate:api` verifies every synchronized C/C++ file, checks the installed Doxygen version
against `.doxygen-version`, and generates XML in operating-system temporary storage. Doxygen is
invoked once per package with an explicit temporary Doxyfile; files nested below multiple package
paths belong to the deepest package, while unclaimed module sources receive a module-level
reference. Generation does not compile firmware, emit Doxygen HTML, or create a source browser.

The XML pipeline validates syntax with `fast-xml-validator`, parses with `fast-xml-parser`, and
normalizes files, namespaces, classes and structs, functions, enums, typedefs, variables, defines,
descriptions, locations, pinned source links, and symbol relationships into a versioned TypeScript
catalog. Missing inputs and symbols are explicit empty states, missing comments are a sparse quality
state, and a target-level extraction error does not suppress other packages. A missing or mismatched
Doxygen executable is a global reproducibility error and must be resolved before generation.

## Documentation Portal

The production build joins the package catalog, rendered Markdown, and normalized Doxygen data into
static Astro routes. The main route families are:

| Route                   | Content                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `/`                     | Module summaries and the complete package catalog                       |
| `/modules/<module>/`    | Module README, packages, and module-level API status                    |
| `/packages/<slug>/`     | Revision, install command, source, manual, dependencies, and API status |
| `/packages/<slug>/api/` | Namespaced Doxygen symbols and pinned source locations                  |
| `/search/`              | Pagefind search with module, namespace, and result-type filters         |
| `/quality/`             | Snapshot and API documentation quality states                           |

Package pages expose a lazy Cytoscape dependency explorer in direct, transitive, and reverse modes.
The selected non-default mode is shareable as `?graph=transitive` or `?graph=reverse`; static direct
and reverse dependency lists remain available when JavaScript is disabled.

Pagefind is emitted by the production build, so verify search with `bun run build` followed by
`bun run preview`. The development server deliberately shows a bounded unavailable state with a
retry command because it has no generated Pagefind index. Search query and filter state is encoded
in the URL. All portal links, Pagefind assets, and graph links are derived from `BASE_PATH` and are
covered at root and nested deployment prefixes by Playwright.

After a release artifact has already passed `check:artifacts` and `check:links`, run
`PLAYWRIGHT_REUSE_ARTIFACT=1 bun run test:e2e` to test those exact bytes. Without the flag,
Playwright performs its normal standalone build before previewing.

## Automation

`.github/workflows/validation.yml` runs the offline quality gate and static-site matrix from the
committed snapshot. `.github/workflows/sync-snapshots.yml` is the only network-aware workflow: it is
explicitly triggered, validates its event payload, calls the same `bun run sync` CLI used locally,
and commits only `sources/` when requested and changed. Neither workflow deploys the site.

See [docs/automation.md](docs/automation.md) for workflow inputs, repository-dispatch payloads,
permissions, no-op behavior, pinned tooling, and failure semantics.

## Deployment Readiness

`bun run check:artifacts` is the executable release-artifact contract. In addition to canonical,
robots, sitemap, 404, and Pagefind assets, it verifies every module/package route against the
catalog, README/fallback, revision, dependency, and API data. It rejects temporary paths, raw
snapshots, Git metadata, virtual environments, credentials, symbolic links, and upstream resources
outside the generated allowlist.

The selected future target is the GitHub Pages project site built with
`SITE_URL=https://hitsz-wtrobot-packages.github.io` and `BASE_PATH=/docs/`. A custom domain requires
a new root-base build; production artifacts are not portable between address pairs. No deployment
workflow is enabled in this repository. See [docs/deployment.md](docs/deployment.md) for the exact
permissions, environment protection, custom-domain procedure, retained-artifact rollback, rollout
drills, stop conditions, and post-deployment checklist.

## Architecture Issues

If snapshot size, licensing, cross-root references, unavailable Doxygen tooling, GitHub Actions
permissions, library availability, or static base-path behavior would change the architecture,
record the evidence in `issues.md` and pause that decision. Routine upstream documentation gaps do
not block unrelated work.
