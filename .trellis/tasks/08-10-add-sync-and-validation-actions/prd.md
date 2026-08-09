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

- [ ] Manual workflow modes call the same behavior as local commands.
- [ ] A changed snapshot can be committed safely and an unchanged run creates no commit.
- [ ] Validation CI requires no upstream repository access.
- [ ] Workflow permissions, failure behavior, and loop prevention are documented and tested where
      feasible.

## Dependencies

Requires all local synchronization, generation, UI, and quality commands.

