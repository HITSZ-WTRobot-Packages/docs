# Synchronize Real Module Content

## Goal

Exercise the synchronizer against the real organization repositories and commit the resulting
snapshot as production documentation input.

## Requirements

- Run a real full synchronization for all configured modules.
- Verify manifest revisions, selected paths, licenses, relative references, and size limits.
- Repeat the full sync to prove idempotency.
- Run one per-module sync and changed-only sync to exercise incremental paths.
- Commit the validated `sources/` tree and manifest as a dedicated source-snapshot change.
- Record upstream content deficiencies in `issues.md` without modifying upstream repositories.

## Acceptance Criteria

- [ ] All six configured modules have committed snapshots.
- [ ] The snapshot contains enough local input for cpkg, README, and Doxygen generation.
- [ ] A second unchanged sync leaves the worktree clean.
- [ ] No temporary clone, `.git`, build output, `.venv`, or credential is committed.

## Dependencies

Requires a fully tested source synchronizer.

