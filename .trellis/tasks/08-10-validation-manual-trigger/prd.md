# Make Validation Manually Triggered

## Goal

Retain the existing GitHub Actions Validation workflow and all of its checks while restricting it
to explicit manual invocation through `workflow_dispatch`.

## Requirements

- Remove the `push` and `pull_request` triggers from `.github/workflows/validation.yml`.
- Keep `workflow_dispatch` as the workflow's only trigger, without adding inputs.
- Preserve the workflow's permissions, concurrency, jobs, matrices, timeouts, and validation steps.
- Keep the snapshot synchronization workflow unchanged; a snapshot commit must no longer trigger
  Validation automatically.
- Update workflow contract tests to enforce the manual-only trigger.
- Update repository-owned automation and deployment documentation so it does not claim Validation
  runs automatically for pull requests, `main` pushes, or snapshot bot commits.
- Update the applicable root `AGENTS.md` workflow requirement so future agents preserve the
  manual-only contract.

## Acceptance Criteria

- [x] Parsing `.github/workflows/validation.yml` yields exactly `workflow_dispatch` under `on`.
- [x] Validation remains read-only and retains all existing offline, site-matrix, link, browser,
      accessibility, and artifact checks.
- [x] `.github/workflows/sync-snapshots.yml` is behaviorally unchanged.
- [x] Documentation describes manual validation of an explicitly selected ref and does not imply
      an automatic Validation run.
- [x] Workflow unit tests and the repository quality command pass.
- [x] `actionlint` was checked for availability; it is not installed in the current environment.

## Definition of Done

- Tests and documentation are updated in the same change as the workflow.
- Formatting, lint, type checking, and relevant unit/integration tests pass.
- No deployment workflow or new workflow permission is introduced.

## Technical Approach

Change only the Validation event mapping, update the exact trigger assertion in the workflow test,
and revise the automation/deployment contracts that currently describe automatic triggering. Add a
concise manual-only Validation invariant to the root agent instructions.

## Decision (ADR-lite)

**Context**: Validation currently runs on pull requests, pushes to `main`, and manual dispatch, but
the requested operational model requires it to run only when explicitly requested.

**Decision**: Retain the current workflow body and make `workflow_dispatch` its sole trigger.

**Consequences**: Pull requests and pushes, including synchronization bot commits, will not receive
automatic Validation runs. Operators must select the intended ref and start Validation manually.
Any future deployment gate must verify a manual Validation result for the exact commit it deploys.

## Out of Scope

- Adding or enabling GitHub Pages deployment.
- Changing Validation inputs or checks.
- Changing snapshot synchronization triggers or behavior.
- Changing branch protection or GitHub repository settings.

## Technical Notes

- Relevant implementation: `.github/workflows/validation.yml`.
- Contract coverage: `tests/unit/workflows.test.ts`.
- Behavior documentation: `docs/automation.md` and `docs/deployment.md`.
- Project instructions require workflow changes to update applicable tests, documentation, and
  `AGENTS.md` guidance.
