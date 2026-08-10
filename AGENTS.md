<!-- TRELLIS:START -->

# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a
  given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`,
`/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:

- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a
future `trellis update`.

<!-- TRELLIS:END -->

# Project Engineering Contract

## Toolchain

- Use Bun for every JavaScript/TypeScript command and dependency change. The only allowed lockfile
  is `bun.lock`; never use npm, pnpm, or Yarn commands.
- Invoke third-party CLIs through `bun run <script>`, but do not force Astro, esbuild, ESLint, or
  Playwright onto Bun's runtime with `--bun`; respect their declared shebang/runtime while Bun
  remains the package manager and command entry point.
- Use `bun run generate:catalog`, `bun run generate:readme`, and `bun run generate:api` for the
  offline package-catalog, Markdown, and API-catalog checks. They must read and validate the
  committed per-module artifacts rather than rescan transient upstream inputs.
- Code under `src/` runs in Astro's declared Node runtime during build and must use portable Web or
  `node:` APIs, never Bun-only globals. Bun-specific APIs are limited to Bun-owned scripts/tests.
- Keep `ASTRO_DEV_BACKGROUND=0` and `ASTRO_PREVIEW_BACKGROUND=0` in the package scripts. Astro 7
  otherwise auto-backgrounds servers in detected agent environments, breaking process ownership in
  Playwright and CI.
- Set `PLAYWRIGHT_REUSE_ARTIFACT=1` when a workflow has already built and statically validated
  `dist/`; this makes browser tests preview those exact bytes. Omit it for standalone E2E runs that
  must build their own artifact.
- When Python is required, use uv without relocating its project `.venv` or global cache.
- Use Astro with Starlight in static-output mode. `SITE_URL` and `BASE_PATH` are the only supported
  deployment address inputs; route and asset code must go through the shared URL helper.
- Use the exact Doxygen version in `.doxygen-version` only during synchronization to produce
  transient XML and committed normalized API JSON. Pass a temporary Doxyfile path through Execa;
  ordinary generation, build, validation, and deployment consume the JSON and never run Doxygen.
  Never commit Doxygen XML, HTML, source-browser output, or upstream source code. Normalize
  `doxygen --version` only from an exact semantic version or the official
  `X.Y.Z (<40-hex release commit>)` form; reject every other suffix while preserving the raw output
  in mismatch diagnostics.
- Use Zod for runtime schemas, smol-toml for `cpkg.toml`, unified/remark/rehype for Markdown and
  sanitized HTML, fast-xml-parser plus fast-xml-validator for Doxygen XML, simple-git for Git
  operations, Execa for bounded external processes, Commander for CLI arguments, and tinyglobby for
  input discovery.
- Use Starlight's Pagefind integration for search, Cytoscape.js for dependency graph traversal and
  layout, Linkinator for static links, Playwright plus axe for browser/accessibility checks, and
  Astro Icon with the Lucide Iconify set for UI icons.
- Keep third-party GitHub Actions dependencies pinned to full commit SHAs. Driver repositories
  intentionally reference the organization-owned dispatch reusable workflow at `@main` so its
  centrally maintained contract rolls forward without per-repository edits. The local setup Action
  owns Bun, the lockfile-keyed package cache, frozen dependency installation, and optional Chromium
  setup. The synchronization workflow restores a version-keyed Doxygen executable cache and invokes
  its pinned dedicated Doxygen Action only on a cache miss.

## Data And Network Boundaries

- Repository-owned documentation and user-facing interface copy use Simplified Chinese with the
  `zh-CN` language tag. Preserve synchronized upstream documentation in its original language, and
  keep technical identifiers, commands, paths, URLs, and stable data values unchanged.
- Use the exact brand names `哈尔滨工业大学（深圳）南工问天` in Chinese, `HITSZ WTRobot` in English,
  and `HITSZ-WTRobot-Packages` for the project. Do not abbreviate or substitute these names in
  repository-owned documentation or interface copy.
- `sources/` is a committed, deterministic snapshot of documentation/resources/licenses plus
  per-module package and API catalogs. Ordinary build, generation, test, and preview commands must
  work without contacting upstream module repositories or requiring Doxygen/source files.
- Preserve synchronized upstream content files byte-for-byte so their manifest SHA-256 values remain
  valid. Repository-owned normalized JSON must use deterministic serialization. The `sources/**` Git
  whitespace exemption applies only to upstream content bytes; do not extend it to repository-owned
  code or documentation.
- Only the synchronization CLI and snapshot synchronization workflow may access upstream
  repositories. An indexed module comes from the committed manifest; a new
  `HITSZ-WTRobot-Packages/*` repository may enter that index only through a validated discovery
  dispatch and a fully successful atomic synchronization. Never modify or push to an upstream module
  repository.
- Validation CI is manually triggered only through `workflow_dispatch`, has read-only contents
  permission, and never invokes synchronization. Snapshot sync has no push trigger, parses manual or
  repository-discovery dispatch data through `sync:action`, relies on the sync CLI's schema, graph,
  checksum, tool-version, and atomic-write gates, and stages only `sources/`. It does not run the
  offline/site/browser validation path. Its `GITHUB_TOKEN` remains read-only; only the conditional
  commit step uses the organization-scoped `DOCS_SYNC_TOKEN`, allowing the resulting default-branch
  push to be observed by the external build service. The callable-only reusable workflow derives
  repository identity from its caller and requires the same secret.
- Parse TOML, Markdown, XML, schemas, Git output, search indexes, and dependency layouts with the
  selected maintained libraries. Do not add an ad hoc parser or layout algorithm.
- Validate external input at the boundary before converting it into internal catalog types.

## Required Quality

- Run the repository's convention, formatting, lint, typecheck, unit, integration, link, search,
  browser, screenshot, responsive, and accessibility checks in proportion to the changed surface.
- Synchronization must support full, per-module, changed-only, dry-run, and first-discovery
  operation; derive indexed modules from the committed manifest; preserve the last valid snapshot on
  failure; regenerate when the upstream revision, Doxygen version, or producer fingerprint changes;
  and leave no diff for identical inputs.
- New UI must be keyboard accessible, respect reduced motion, avoid text overlap, and use the
  configured icon library instead of hand-authored UI SVGs.
- Keep build artifacts, temporary clones, raw package manifests/source/XML, Git metadata, `.venv`,
  credentials, and unapproved files out of `sources/` and the deployment artifact.
- Run `bun run check:artifacts` and `bun run check:links` against every built site/base variant.
  Workflow changes must also pass `tests/unit/workflows.test.ts`; use actionlint when available.
- Treat `bun run check:artifacts` as the release boundary: every catalog package and API route must
  match its revision/documentation/dependency/status model, Pagefind must cover the portal, and the
  artifact must contain no symlinks, temporary/source directories, credentials, or resources outside
  the generated allowlist.
- Formal deployment is a separate administrator-approved task. The future Pages build uses the exact
  address pair documented in `docs/deployment.md`; deployment never synchronizes or rebuilds bytes
  after artifact validation.
- Do not add a local commit/push build trigger for snapshot commits. `Validation` remains manual;
  repository-external build automation owns rebuilds initiated by the committed snapshot change.

## Architecture Gate

Record problems in `issues.md` with evidence, impact, workaround, owner, and close condition. Pause
for user input if snapshot size, licensing, cross-root references, Doxygen availability, Actions
write permissions, library availability, or static base-path behavior would force a different
architecture. Routine upstream-content deficiencies should be recorded and handled with explicit
quality states.
