# GitHub Actions trigger-chain research

## Official behavior

- A reusable workflow can be referenced as
  `owner/repository/.github/workflows/file.yml@ref`, where `ref` may be a branch, tag, or complete
  commit SHA. A branch reference resolves to the current branch content on a new run, while a SHA
  remains immutable.
  - <https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows>
  - <https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations>
- A called reusable workflow keeps the caller workflow's `github` context. Therefore
  `github.repository`, `github.ref_name`, and `github.event.repository.default_branch` identify the
  driver repository, and the called job is part of the caller run rather than an independently
  triggered docs workflow.
  - <https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations>
- Events caused by a repository `GITHUB_TOKEN` do not create another workflow run, except for
  `workflow_dispatch` and `repository_dispatch`. In particular, a commit pushed with
  `GITHUB_TOKEN` does not trigger a `push` workflow or a GitHub Pages build. GitHub recommends a
  GitHub App installation token or personal access token when a workflow-created event must start
  another workflow.
  - <https://docs.github.com/en/actions/concepts/security/github_token>
  - <https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow>
- `repository_dispatch` runs in the target repository and only works when its receiving workflow
  exists on that repository's default branch.
  - <https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#repository_dispatch>

## Current repository findings

- `.github/workflows/request-docs-sync.yml` has only `workflow_call`, so it cannot start as an
  independent docs workflow. Its caller-derived identity boundary is already correct.
- Driver documentation pins that reusable workflow to a complete docs commit SHA, so callers do not
  follow later docs workflow changes.
- `.github/workflows/sync-snapshots.yml` maps repository dispatch to one module, detects the
  `sources/` diff, and commits only when the diff is non-empty. This part already matches the desired
  behavior.
- The sync checkout persists the repository `GITHUB_TOKEN`, and its `git push` therefore cannot
  trigger a subsequent push workflow.
- `.github/workflows/validation.yml` accepts only `workflow_dispatch`; no committed snapshot change
  starts a site rebuild.

## Recommended correction

1. Keep the request workflow callable-only and strengthen its contract test.
2. Document driver callers with `@main` so new runs resolve the latest docs reusable workflow.
3. Use the existing organization-scoped fine-grained `DOCS_SYNC_TOKEN` for the docs checkout/push as
   well as the cross-repository dispatch. This PAT-created push can start downstream workflows.
4. Keep Validation manual-only and add no local commit/push build workflow. The existing external
   build service observes the PAT-created default-branch commit.
5. Do not add Pages deployment unless separately approved; the current architecture explicitly
   treats formal deployment as a separate administrator-approved task.

## Risks and controls

- `@main` intentionally trades immutable caller behavior for centralized rolling updates. Changes
  to the reusable workflow must remain backward compatible because every caller adopts them on its
  next run.
- Make the docs PAT visible only to the docs repository and approved driver callers, and limit it to
  docs `Contents: write`.
- Keep synchronization free of a push trigger, so the snapshot commit starts Validation/build but
  cannot recursively synchronize.
- A no-op synchronization produces no commit and therefore no downstream build, as required.
