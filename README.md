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

The application scaffold will provide these Bun commands. CI and contributor documentation must call
the same commands rather than duplicate their logic in shell scripts.

```text
bun install --frozen-lockfile
bun run dev
bun run sync [--module <name> | --changed] [--dry-run]
bun run generate
bun run lint
bun run typecheck
bun run test
bun run test:e2e
bun run check
bun run build
```

Use `SITE_URL=https://example.invalid` and `BASE_PATH=/` for a root build. `BASE_PATH` may also be a
nested path such as `/products/wtr/docs/`; code must not contain a repository-specific deployment
prefix.

## Architecture Issues

If snapshot size, licensing, cross-root references, unavailable Doxygen tooling, GitHub Actions
permissions, library availability, or static base-path behavior would change the architecture,
record the evidence in `issues.md` and pause that decision. Routine upstream documentation gaps do
not block unrelated work.
