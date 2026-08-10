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
- Validation Actions use committed snapshots, are triggered only by `workflow_dispatch`, use
  `contents: read`, install frozen Bun dependencies, and never run a sync command. Root, `/docs/`,
  and `/products/wtr/docs/` builds run artifact and Linkinator checks; root and product variants
  also run Playwright/axe.
- Snapshot synchronization is limited to `workflow_dispatch` and the named `repository_dispatch`
  type, uses serialized concurrency, and grants `contents: write` only there. Structured event
  parsing must validate mode, module, dry-run, and commit before invoking the local sync CLI.
- External Actions use immutable full commit SHAs. Downloaded Doxygen binaries must match both
  `.doxygen-version` and the release asset SHA-256 before entering `PATH`.
- A snapshot commit stages only `sources/`, uses a bot identity, runs only after the complete offline
  gate succeeds, and is skipped when no source status exists. Change detection must include tracked
  edits, deletions, and untracked additions. The sync workflow has no push trigger.
- Release artifact validation joins generated HTML back to the catalog, documentation, and API
  models for every module/package route. It rejects missing revision/dependency/status content,
  inadequate Pagefind coverage, symbolic links, temporary/source paths, credential files or
  signatures, and resources outside the generated documentation allowlist.
- A Pages deployment is a later administrator-approved change. Build once for the exact production
  `SITE_URL`/`BASE_PATH`, validate those bytes, retain a digest-addressed rollback artifact, and give
  only the separate protected deployment job `pages: write` plus `id-token: write`.

## Review Checklist

- Does the change preserve the offline build boundary?
- Can invalid external input reach a trusted domain type?
- Is an output order dependent on filesystem or object insertion order?
- Can any failure partially replace a valid snapshot?
- Are root and nested base paths exercised where URLs changed?

## Scenario: Pinned Doxygen Version Identification

### 1. Scope / Trigger

Apply this contract whenever changing `.doxygen-version`, the pinned Doxygen archive, or the
generator's tool-version gate. Official Doxygen release binaries may append their release commit to
`--version`, while distribution packages may report only the semantic version.

### 2. Signatures

```text
.doxygen-version: X.Y.Z
doxygen --version: X.Y.Z | X.Y.Z (<40 lowercase hexadecimal characters>)
ApiCatalog.doxygenVersion: X.Y.Z
```

### 3. Contracts

- Parse the complete trimmed stdout, not a line prefix or whitespace-delimited token.
- Accept only the two declared formats and compare the normalized `X.Y.Z` with the repository lock.
- Store only the normalized semantic version in the API catalog.
- Preserve the complete reported stdout in `DOXYGEN_VERSION_MISMATCH` diagnostics.

### 4. Validation & Error Matrix

| Reported value | Required result |
| --- | --- |
| Exact locked `X.Y.Z` | Accept and store `X.Y.Z` |
| Locked `X.Y.Z` plus a 40-character lowercase hexadecimal commit | Accept and store `X.Y.Z` |
| Different semantic version in either accepted form | Fail with `DOXYGEN_VERSION_MISMATCH` |
| Empty output, development suffix, uppercase/non-hex commit, extra lines, or arbitrary text | Fail with `DOXYGEN_VERSION_MISMATCH` and retain the raw value |
| Process invocation failure or timeout | Fail with `DOXYGEN_TOOL_UNAVAILABLE` |

### 5. Good / Base / Bad Cases

- Good: official `1.9.8 (c2fe5c3e4986974eb2a97608b24086683502f07f)` normalizes to `1.9.8`.
- Base: distribution package output `1.9.8` remains `1.9.8`.
- Bad: `1.9.8-dev`, `1.9.8 extra`, or `1.9.9` cannot satisfy a `1.9.8` lock.

### 6. Tests Required

- Integration fixtures cover both accepted output forms and assert the normalized catalog version.
- Version mismatch tests assert the stable diagnostic code and expected version context.
- A real pinned release binary runs the snapshot generator before updating its Action checksum.

### 7. Wrong vs Correct

```ts
// Wrong: rejects an official release binary that appends its source commit.
if (stdout.trim() !== expectedVersion) throw mismatch();

// Correct: validate the complete supported shape, then compare its normalized semantic version.
const actualVersion = /^(\d+\.\d+\.\d+)(?: \([0-9a-f]{40}\))?$/u.exec(stdout.trim())?.[1];
if (actualVersion !== expectedVersion) throw mismatch();
```

## Scenario: Offline Snapshot Build Boundary

### 1. Scope / Trigger

Apply this contract whenever a command reads upstream repositories, writes `sources/`, produces
catalog/API/search data, constructs a deployable URL, or changes a GitHub Actions trigger. It
prevents a normal build from becoming network-dependent, keeps synchronization behavior identical
locally and in Actions, and prevents Validation from silently becoming an automatic branch gate.

### 2. Signatures

```text
bun run sync [--module <allowlisted-name> | --changed] [--dry-run]
bun run generate
SITE_URL=<absolute-http-url> BASE_PATH=<absolute-path> bun run build
SITE_URL=<same-build-origin> BASE_PATH=<same-build-path> bun run check:artifacts
SITE_URL=<same-build-origin> BASE_PATH=<same-build-path> PLAYWRIGHT_REUSE_ARTIFACT=1 bun run test:e2e
ASTRO_DEV_BACKGROUND=0 bun run dev
ASTRO_PREVIEW_BACKGROUND=0 bun run preview
Validation workflow trigger: workflow_dispatch
```

`--module` and `--changed` are mutually exclusive. With neither, synchronization processes every
allowlisted module. `--dry-run` composes with all modes and performs no repository writes.

### 3. Contracts

| Boundary | Input | Output |
| --- | --- | --- |
| Synchronization | Allowlist, mode, optional module, current manifest, upstream Git repositories | Atomically replaced module directories plus deterministic `sources/manifest.json` |
| Generation | Valid committed `sources/` tree and manifest | Versioned in-memory or ignored generated catalogs; no snapshot mutation |
| Build | `SITE_URL` absolute `http:`/`https:` URL; normalized absolute `BASE_PATH` | Static `dist/` whose internal routes and assets include the configured base |
| Artifact check | The built `dist/`, the same address pair, and validated portal data | Release summary with module/package/API/HTML/Pagefind/file counts; no writes |
| Release browser check | Validated `dist/`, same address pair, `PLAYWRIGHT_REUSE_ARTIFACT=1` | Local preview and browser/axe results without rebuilding `dist/` |
| Local server | The same site/base inputs and an Astro foreground sentinel | A foreground process owned and terminated by the invoking terminal or Playwright worker |
| Validation workflow | Manually dispatched repository ref and committed `sources/` | Read-only offline quality and site-matrix result for the resolved commit |

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
| Missing package/API route or mismatched revision, documentation, dependency, or status | Artifact check fails with the affected route/package; do not upload |
| Symlink, temporary/source path, credential signal, or non-allowlisted resource in `dist/` | Artifact check fails with the relative path; do not upload |
| Artifact address differs from deployment origin/base | Reject the artifact and rebuild; static artifacts are not address-portable |
| Release E2E omits `PLAYWRIGHT_REUSE_ARTIFACT=1` | Invalid artifact handoff; Playwright's standalone mode rebuilds and replaces `dist/` |
| Astro server command exits while its server remains alive | Invalid process ownership; restore the foreground sentinel in the package script |
| Validation declares `push`, `pull_request`, `schedule`, or another automatic trigger | Workflow contract test fails; retain only `workflow_dispatch` |

### 5. Good / Base / Bad Cases

- Good: `SITE_URL=https://docs.example.org BASE_PATH=/products/wtr/docs/ bun run build`
  followed by the same environment for `bun run check:artifacts` produces and validates base-aware
  canonical, asset, search, and content links.
- Good: an operator dispatches Validation for the intended ref and records the resolved commit from
  the successful run.
- Base: `BASE_PATH=/ bun run build` builds from committed snapshots with network disabled.
- Local: `bun run dev` stays in the foreground even when Astro detects an agent environment.
- Bad: `BASE_PATH=../../docs bun run build` fails before Astro emits output.
- Bad: a pull request or push to `main` starts Validation without an explicit dispatch.
- Bad: building with `BASE_PATH=/` and uploading those bytes under `/docs/` is rejected even when
  every file exists, because canonical URLs and static asset paths are already compiled.

### 6. Tests Required

- CLI unit tests assert flag exclusivity, allowlist validation, diagnostic code, and no writes.
- Synchronizer integration tests hash the previous tree before injected failures and assert exact
  equality afterward; unchanged reruns assert an empty Git diff.
- Offline build tests deny network and assert successful root and nested-base artifacts.
- At least one production build must import each shared snapshot loader through an Astro route;
  passing only Bun unit/CLI tests does not prove runtime compatibility.
- Browser and static-link tests assert canonical URLs, Pagefind assets, Markdown resources, and deep
  links under each configured base.
- Artifact tests map every catalog module/package and API reference to built HTML, assert revision,
  README/fallback, dependency, and status text, parse Pagefind's page count, compare resource output
  with the generated allowlist, and inject representative unsafe paths/credential signatures.
- Workflow contract tests require release browser steps to set `PLAYWRIGHT_REUSE_ARTIFACT=1`; run at
  least one root and nested E2E suite against a prebuilt artifact.
- Workflow contract tests assert that Validation's event keys equal exactly `workflow_dispatch` and
  that its read-only permissions and existing site matrix remain unchanged.
- A Playwright run with no pre-existing server must start, await, and stop its configured web server
  without leaving an Astro background process.

### 7. Wrong vs Correct

```ts
// Wrong: bypasses the shared configuration and breaks nested deployments.
const packageUrl = `/packages/${slug}/`;

// Correct: every internal path crosses the shared base-aware helper.
const packageUrl = sitePath("packages", slug);
```

```text
# Wrong: validate root bytes and deploy them as a repository-path site.
SITE_URL=https://example.invalid BASE_PATH=/ bun run build
# upload dist/ to https://example.invalid/docs/

# Correct: build and validate the exact deployment address pair before upload.
SITE_URL=https://example.invalid BASE_PATH=/docs/ bun run build
SITE_URL=https://example.invalid BASE_PATH=/docs/ bun run check:artifacts
```

```jsonc
// Wrong: forcing Astro onto Bun's runtime breaks esbuild IPC in supported environments.
{ "build": "bun run --bun astro build" }

// Correct: Bun owns script/package resolution and Astro uses its declared runtime.
{ "build": "astro build", "dev": "ASTRO_DEV_BACKGROUND=0 astro dev" }
```

```yaml
# Wrong: Validation runs automatically for branch activity.
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

# Correct: an operator must explicitly select a ref and dispatch Validation.
on:
  workflow_dispatch:
```
