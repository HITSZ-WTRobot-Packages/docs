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
  offline catalog, Markdown, and Doxygen checks. They must discover inputs from the committed
  snapshot rather than maintained indexes.
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
- Use the exact Doxygen version in `.doxygen-version` only as a build-time producer of XML. Pass a
  temporary Doxyfile path through Execa; the site consumes normalized TypeScript data, not Doxygen
  HTML or source-browser output.
- Use Zod for runtime schemas, smol-toml for `cpkg.toml`, unified/remark/rehype for Markdown and
  sanitized HTML, fast-xml-parser plus fast-xml-validator for Doxygen XML, simple-git for Git
  operations, Execa for bounded external processes, Commander for CLI arguments, and tinyglobby for
  input discovery.
- Use Starlight's Pagefind integration for search, Cytoscape.js for dependency graph traversal and
  layout, Linkinator for static links, Playwright plus axe for browser/accessibility checks, and
  Astro Icon with the Lucide Iconify set for UI icons.
- Keep GitHub Actions dependencies pinned to full commit SHAs. The local setup Action owns Bun,
  frozen dependency installation, the exact Doxygen binary/checksum, and optional Chromium setup.

## Data And Network Boundaries

- Repository-owned documentation and user-facing interface copy use Simplified Chinese with the
  `zh-CN` language tag. Preserve synchronized upstream documentation in its original language, and
  keep technical identifiers, commands, paths, URLs, and stable data values unchanged.
- Use the exact brand names `哈尔滨工业大学（深圳）南工问天` in Chinese, `HITSZ WTRobot` in English,
  and `HITSZ-WTRobot-Packages` for the project. Do not abbreviate or substitute these names in
  repository-owned documentation or interface copy.
- `sources/` is a committed, deterministic snapshot. Ordinary build, generation, test, and preview
  commands must work without contacting upstream module repositories.
- Preserve synchronized files byte-for-byte so their manifest SHA-256 values remain valid. The
  `sources/**` Git whitespace exemption applies only to upstream bytes; do not extend it to
  repository-owned code or documentation.
- Only the synchronization CLI and its manually triggered GitHub Action may access upstream
  repositories. Never modify or push to an upstream module repository.
- Validation CI has read-only contents permission and never invokes synchronization. Snapshot sync
  has no push trigger, parses dispatch data through `sync:action`, stages only `sources/`, and may
  push only after the complete offline validation path succeeds.
- Parse TOML, Markdown, XML, schemas, Git output, search indexes, and dependency layouts with the
  selected maintained libraries. Do not add an ad hoc parser or layout algorithm.
- Validate external input at the boundary before converting it into internal catalog types.

## Required Quality

- Run the repository's convention, formatting, lint, typecheck, unit, integration, link, search,
  browser, screenshot, responsive, and accessibility checks in proportion to the changed surface.
- Synchronization must support full, per-module, changed-only, and dry-run operation; preserve the
  last valid snapshot on failure; and leave no diff when upstream revisions are unchanged.
- New UI must be keyboard accessible, respect reduced motion, avoid text overlap, and use the
  configured icon library instead of hand-authored UI SVGs.
- Keep build artifacts, temporary clones, Git metadata, `.venv`, credentials, and unapproved source
  files out of `sources/` and the deployment artifact.
- Run `bun run check:artifacts` and `bun run check:links` against every built site/base variant.
  Workflow changes must also pass `tests/unit/workflows.test.ts`; use actionlint when available.
- Treat `bun run check:artifacts` as the release boundary: every catalog package and API route must
  match its revision/documentation/dependency/status model, Pagefind must cover the portal, and the
  artifact must contain no symlinks, temporary/source directories, credentials, or resources outside
  the generated allowlist.
- Formal deployment is a separate administrator-approved task. The future Pages build uses the exact
  address pair documented in `docs/deployment.md`; deployment never synchronizes or rebuilds bytes
  after artifact validation.

## Architecture Gate

Record problems in `issues.md` with evidence, impact, workaround, owner, and close condition. Pause
for user input if snapshot size, licensing, cross-root references, Doxygen availability, Actions
write permissions, library availability, or static base-path behavior would force a different
architecture. Routine upstream-content deficiencies should be recorded and handled with explicit
quality states.
