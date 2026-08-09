# Automation

The repository separates network-aware snapshot synchronization from ordinary offline validation.
Neither workflow deploys the site or enables GitHub Pages.

## Validation Workflow

`.github/workflows/validation.yml` runs on pushes to `main`, pull requests, and manual dispatch. It
has `contents: read` permission, checks out without persisted credentials, and never calls a sync
command or an upstream module repository.

The offline quality job runs frozen installation, conventions, formatting, lint, Astro type checks,
unit/integration tests, and all catalog/README/Doxygen generators. The site matrix builds `/`,
`/docs/`, and `/products/wtr/docs/` against distinct example origins. Every variant verifies
canonical URLs, robots, sitemap, Pagefind, required assets, duplicated base paths, recursive clean
URLs, fragments, and CSS references. Root and product variants also run desktop/mobile Playwright
and axe checks.

## Snapshot Synchronization

`.github/workflows/sync-snapshots.yml` has no push or scheduled trigger. Runs are serialized and may
be started by `workflow_dispatch` or a `repository_dispatch` event of type `sync-snapshots`.

Manual inputs are:

| Input     | Values                      | Default   | Contract                                        |
| --------- | --------------------------- | --------- | ----------------------------------------------- |
| `mode`    | `changed`, `all`, `module`  | `changed` | Maps to the local sync CLI mode                 |
| `module`  | One allowlisted module name | empty     | Required only for `module` mode                 |
| `dry_run` | boolean                     | `true`    | Validates without writing `sources/`            |
| `commit`  | boolean                     | `false`   | Commits validated changes to the default branch |

`dry_run: true` with `commit: true`, a module outside the allowlist, an unknown mode, or conflicting
module input fails before synchronization. A default repository dispatch is a changed-only dry run:

```json
{
  "event_type": "sync-snapshots",
  "client_payload": {}
}
```

An explicit module update that is allowed to commit uses:

```json
{
  "event_type": "sync-snapshots",
  "client_payload": {
    "mode": "module",
    "module": "Sensors",
    "dry_run": false,
    "commit": true
  }
}
```

The event adapter invokes `bun run sync` with an argument array; workflow expressions are not
interpolated into that command. Change detection includes tracked edits, deletions, and new
untracked snapshot files. An unchanged run reports a no-op and creates no commit. A changed run must
pass the complete offline gate, nested site build, artifact/link checks, and Playwright/axe before
the optional commit. The commit stages only `sources/`, uses the GitHub Actions bot identity, and
includes `[snapshot-sync]` in its message. The workflow has no push trigger, so its bot commit
cannot recursively start another synchronization run.

The synchronization workflow is the only workflow with `contents: write`. Repository and branch
rules may still block its push; that failure leaves the remote branch unchanged and is reported by
the commit step. A non-committing run keeps its validated diff only for the lifetime of the runner.

## Pinned Tooling

External Actions are referenced by full commit SHA. The local setup Action installs Bun 1.3.14 from
the package contract, uses `bun install --frozen-lockfile`, and downloads the official Doxygen
1.16.1 Linux asset. Its SHA-256 is verified before extraction and its version must equal
`.doxygen-version`. Chromium is installed only for jobs that run Playwright.

When changing workflow structure, run:

```text
bun test tests/unit/action-request.test.ts tests/unit/workflows.test.ts
bun run typecheck
bun run check
```

Run actionlint when available. Update the Action SHA comments, release-asset checksum, tests, this
document, and the applicable `AGENTS.md` in the same change when a pinned workflow dependency or
automation contract changes.
