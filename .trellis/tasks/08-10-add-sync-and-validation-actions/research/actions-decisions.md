# GitHub Actions Decisions

## Primary Sources

- GitHub manual workflow inputs preserve booleans in the `inputs` context and choice values as
  strings: <https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow>
- GitHub recommends least-privilege tokens, environment indirection for untrusted values, and
  full-commit-SHA Action pins: <https://docs.github.com/en/actions/reference/security/secure-use>
- GitHub concurrency groups prevent overlapping runs:
  <https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency>
- Bun's verified setup Action reads or accepts an explicit Bun version:
  <https://github.com/oven-sh/setup-bun>
- Linkinator supports recursive website crawling, clean URLs, fragments, CSS references, and skip
  rules: <https://github.com/JustinBeckwith/linkinator>
- Doxygen 1.16.1 was released on 2026-01-11:
  <https://www.doxygen.nl/manual/changelog.html>

## Pinned Inputs

- `actions/checkout` v4: `11d5960a326750d5838078e36cf38b85af677262`
- `oven-sh/setup-bun` v2: `0c5077e51419868618aeaa5fe8019c62421857d6`
- Bun: `1.3.14`, matching `packageManager`
- Doxygen Linux asset: `doxygen-1.16.1.linux.bin.tar.gz`
- Doxygen SHA-256: `a56f885d37e3aae08a99f638d17bbb381224c03a878d9e2dda4f9fa4baf1d8bd`
- Linkinator: `8.0.3`, locked by Bun

The Action refs were resolved from their official repositories. The Doxygen checksum came from the
official GitHub release asset digest and matches the repository's exact version lock.

## Boundaries

Validation is read-only and never synchronizes. Snapshot sync is explicit, serialized, and the only
workflow with write permission. A TypeScript/Zod adapter reads the GitHub event file, validates the
mode/module/booleans, normalizes the allowlisted module ID, and calls the local sync CLI through an
argument array. Workflow shell is limited to change detection, validation command orchestration,
and staging/pushing `sources/` after success.

There is deliberately no Pages or deployment job. Release hosting and rollout remain a separate
readiness decision.

## Verification

- Workflow contract tests parse YAML structurally and assert triggers, permissions, concurrency,
  immutable external Actions, safe command boundaries, no deployment, and pinned Doxygen data.
- Request tests cover manual module/commit mapping, repository-dispatch defaults, invalid module,
  ambiguous scope, and dry-run/commit conflicts.
- actionlint v1.7.12 passed both workflow files using its checksum-verified official binary.
- Root and product-base artifact checks passed with 95 HTML pages each.
- Root and product-base Linkinator crawls each passed 102 internal targets; 2741 repeated external
  links were explicitly skipped without network requests.
- A real repository-dispatch adapter run used the empty-payload defaults, invoked
  `bun run sync --changed --dry-run`, skipped all six current upstream SHAs, emitted the expected
  GitHub outputs, and produced no source diff.
