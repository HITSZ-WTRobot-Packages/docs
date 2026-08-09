# Build Pipeline Quality Guidelines

## Required Patterns

- Bun is the only JavaScript runtime and package manager; commit only `bun.lock`.
- External formats are parsed with the selected maintained libraries and validated with Zod:
  smol-toml for TOML, unified/remark/rehype for Markdown and HTML, and fast-xml-validator plus
  fast-xml-parser for XML.
- Git operations use simple-git, Doxygen and other bounded processes use Execa, CLI options use
  Commander, and filesystem discovery uses tinyglobby.
- Normal builds, generation, and validation are offline and consume only committed snapshots.
- Shared code under `src/` is imported by Astro's Node prerender runtime and must not use Bun-only
  globals. Use portable Web APIs or `node:` modules; convention checks reject `Bun.*` in `src/`.
- Shared URL, safe-path, checksum, slug, and dependency helpers are the single sources of truth.
- README rendering uses remark-parse + remark-gfm + remark-rehype, expands raw HTML through
  rehype-raw, rewrites references in HAST, assigns GitHub-compatible heading slugs, sanitizes, then
  serializes. Reordering or bypassing this pipeline requires security and link fixture updates.
- All generated ordering is explicit and covered by repeat-run tests.
- Doxygen must match `.doxygen-version`. Each target receives a temporary Doxyfile containing only
  checksum-verified owned inputs; HTML, source browsing, compilation, recursive input discovery,
  and normal-build network access remain disabled.
- A source belongs to the deepest package directory containing it. Every catalog package receives
  an API reference, and source files outside all package roots receive a module-level reference.
- Doxygen target failures become explicit `failed` references. No inputs, no public symbols, and
  missing descriptions become `empty` or `sparse` quality states. Missing/mismatched tooling and
  invalid snapshot bytes fail the complete generation before target isolation.

## Forbidden Patterns

- npm, pnpm, or Yarn commands and lockfiles.
- Regular expressions or line splitting as TOML, Markdown, XML, or HTML parsers.
- Network access in Astro builds or tests outside synchronization integration fixtures.
- Shelling out with interpolated commands; pass argument arrays through the selected process/Git
  library.
- `any`, unchecked type assertions, silent schema coercion, or unchecked path joins.
- Hand-edited files under `sources/`.
- Alternate foundational parsers, Git/process wrappers, CLI parsers, or glob libraries without an
  updated research decision and compatibility proof.

## Tests

- Unit tests cover schemas, path containment, URL/base handling, Markdown references, dependency
  classification, slugs, checksums, and Doxygen normalization.
- Synchronizer integration tests cover full, one-module, changed-only, dry-run, identical rerun,
  rollback on failure, and deterministic manifest output.
- Catalog fixtures cover optional `format_version`, duplicates, invalid paths, unresolved internal
  dependencies, and approved external dependencies.
- Documentation fixtures cover cross-page headings, root/nested-base images and attachments, raw
  HTML sanitization, missing-README fallbacks, missing targets, and root escapes.
- Doxygen fixtures cover C, C++, header-only, compiled, empty, and sparsely documented packages.
- Doxygen integration checks assert exact version gating, target failure isolation, no repository
  HTML/LaTeX output, source ownership uniqueness, pinned revisions, and deterministic serialization.
- The quality gate runs convention, format, lint, typecheck, unit, integration, generation, build,
  static-link, search, browser, screenshot, responsive, accessibility, and artifact checks.

## Review Checklist

- Does the change preserve the offline build boundary?
- Can invalid external input reach a trusted domain type?
- Is an output order dependent on filesystem or object insertion order?
- Can any failure partially replace a valid snapshot?
- Are root and nested base paths exercised where URLs changed?

## Scenario: Offline Snapshot Build Boundary

### 1. Scope / Trigger

Apply this contract whenever a command reads upstream repositories, writes `sources/`, produces
catalog/API/search data, or constructs a deployable URL. It prevents a normal build from becoming
network-dependent and keeps synchronization behavior identical locally and in Actions.

### 2. Signatures

```text
bun run sync [--module <allowlisted-name> | --changed] [--dry-run]
bun run generate
SITE_URL=<absolute-http-url> BASE_PATH=<absolute-path> bun run build
ASTRO_DEV_BACKGROUND=0 bun run dev
ASTRO_PREVIEW_BACKGROUND=0 bun run preview
```

`--module` and `--changed` are mutually exclusive. With neither, synchronization processes every
allowlisted module. `--dry-run` composes with all modes and performs no repository writes.

### 3. Contracts

| Boundary | Input | Output |
| --- | --- | --- |
| Synchronization | Allowlist, mode, optional module, current manifest, upstream Git repositories | Atomically replaced module directories plus deterministic `sources/manifest.json` |
| Generation | Valid committed `sources/` tree and manifest | Versioned in-memory or ignored generated catalogs; no snapshot mutation |
| Build | `SITE_URL` absolute `http:`/`https:` URL; normalized absolute `BASE_PATH` | Static `dist/` whose internal routes and assets include the configured base |
| Local server | The same site/base inputs and an Astro foreground sentinel | A foreground process owned and terminated by the invoking terminal or Playwright worker |

`BASE_PATH` defaults to `/`, starts and ends with `/`, and contains no `.` or `..` segment. Normal
generation and build commands make zero upstream network requests.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Unknown module or incompatible flags | Exit non-zero with `CLI_INVALID_ARGUMENT`; write nothing |
| Invalid origin or base path | Exit non-zero with `CONFIG_INVALID_URL`; do not start a build |
| Clone, reference, license, size, or checksum failure | Exit non-zero; retain the prior snapshot |
| Unchanged SHA in changed mode | Report skipped; write nothing |
| Identical full synchronization | Exit zero and leave the worktree byte-identical |
| Network attempt during generation/build | Test failure; no fallback fetch |
| Astro server command exits while its server remains alive | Invalid process ownership; restore the foreground sentinel in the package script |

### 5. Good / Base / Bad Cases

- Good: `SITE_URL=https://docs.example.org BASE_PATH=/products/wtr/docs/ bun run build`
  produces base-aware canonical, asset, search, and content links.
- Base: `BASE_PATH=/ bun run build` builds from committed snapshots with network disabled.
- Local: `bun run dev` stays in the foreground even when Astro detects an agent environment.
- Bad: `BASE_PATH=../../docs bun run build` fails before Astro emits output.

### 6. Tests Required

- CLI unit tests assert flag exclusivity, allowlist validation, diagnostic code, and no writes.
- Synchronizer integration tests hash the previous tree before injected failures and assert exact
  equality afterward; unchanged reruns assert an empty Git diff.
- Offline build tests deny network and assert successful root and nested-base artifacts.
- At least one production build must import each shared snapshot loader through an Astro route;
  passing only Bun unit/CLI tests does not prove runtime compatibility.
- Browser and static-link tests assert canonical URLs, Pagefind assets, Markdown resources, and deep
  links under each configured base.
- A Playwright run with no pre-existing server must start, await, and stop its configured web server
  without leaving an Astro background process.

### 7. Wrong vs Correct

```ts
// Wrong: bypasses the shared configuration and breaks nested deployments.
const packageUrl = `/packages/${slug}/`;

// Correct: every internal path crosses the shared base-aware helper.
const packageUrl = sitePath("packages", slug);
```

```jsonc
// Wrong: forcing Astro onto Bun's runtime breaks esbuild IPC in supported environments.
{ "build": "bun run --bun astro build" }

// Correct: Bun owns script/package resolution and Astro uses its declared runtime.
{ "build": "astro build", "dev": "ASTRO_DEV_BACKGROUND=0 astro dev" }
```
