# Add Synchronization and Validation Actions

## Goal

Automate explicit snapshot synchronization and offline validation without deploying the site.

## Requirements

- Add `workflow_dispatch` inputs for all, changed, module, dry-run, and commit behavior.
- Optionally accept `repository_dispatch` payloads, without requiring any upstream sender.
- Reuse the Bun synchronization CLI; do not duplicate sync logic in workflow shell.
- Commit only validated `sources/` and manifest changes with a bot identity; no-op on unchanged data.
- Prevent bot snapshot commits from recursively invoking synchronization.
- Run ordinary CI entirely from committed snapshots: convention check, frozen Bun install, lint,
  typecheck, unit/integration tests, Doxygen, static build, links, search, Playwright, and accessibility.
- Use least-privilege permissions and concurrency controls.
- Do not add or enable a Pages deployment job.

## Acceptance Criteria

- [x] Manual workflow modes call the same behavior as local commands.
- [x] A changed snapshot can be committed safely and an unchanged run creates no commit.
- [x] Validation CI requires no upstream repository access.
- [x] Workflow permissions, failure behavior, and loop prevention are documented and tested where
      feasible.

## Dependencies

Requires all local synchronization, generation, UI, and quality commands.

## Implementation Notes

- Validation uses read-only permissions and a three-variant site matrix; it never invokes sync or
  includes a deployment job.
- Snapshot synchronization accepts manual or named repository dispatches, validates the payload in
  TypeScript, invokes the local sync CLI, and serializes runs with a single concurrency group.
- Changed snapshots pass source checks, all generators, nested production build, artifact/link
  validation, and Playwright/axe before the optional bot commit stages only `sources/`.
- External Actions are pinned to full SHAs. The official Doxygen 1.16.1 Linux asset is locked to its
  release SHA-256 and checked against `.doxygen-version`.
- Workflow structure and request mapping are covered by unit tests; actionlint v1.7.12 also passes.
- A real default `repository_dispatch` dry run resolved to changed-only mode, contacted all six
  allowlisted upstreams, skipped their current SHAs, emitted `commit=false`, and left `sources/`
  unchanged.
