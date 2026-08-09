# Project Issues

This file records architectural gates and upstream documentation deficiencies. An open issue only
blocks implementation when its impact says that it changes an architectural choice.

## Issue Template

```markdown
## ISSUE-ID: Short title

- Status: open | monitoring | resolved | accepted
- Scope: architecture | upstream-content | tooling | deployment
- Owner: GitHub handle or role
- Evidence: Reproducible command, URL, file path, and observed result
- Impact: What cannot be completed or what architectural decision would change
- Workaround: Current bounded workaround, or `none`
- Close condition: Objective evidence required to close the issue
- Last verified: YYYY-MM-DD

Additional context and resolution notes.
```

## Open Issues

## DEPLOYMENT-001: GitHub Pages administrative state is not yet approved

- Status: open
- Scope: deployment
- Owner: `HITSZ-WTRobot-Packages/docs` repository administrators
- Evidence: The repository remote identifies `HITSZ-WTRobot-Packages/docs`, but a read-only GitHub
  API repository/Pages-state probe returned HTTP 404 from the current environment on 2026-08-10. No
  deployment workflow or `CNAME` exists in the repository.
- Impact: The artifact can be built and fully validated for the default project-site address, but a
  production deployment cannot be enabled until an administrator confirms Pages source, target
  domain, Actions policy, protected `github-pages` environment, reviewers, and `main` branch rules.
  This does not change the static snapshot or base-path architecture.
- Workaround: Keep deployment disabled, use
  `SITE_URL=https://hitsz-wtrobot-packages.github.io BASE_PATH=/docs/` as the default release
  contract, and follow `docs/deployment.md` in the later deployment task.
- Close condition: An administrator records the selected domain/address pair, enables GitHub Actions
  as the Pages source, configures branch/environment protections and required permissions, and the
  first/repeat/rollback drills plus post-deployment checklist pass.
- Last verified: 2026-08-10

## UPSTREAM-001: ArmController has no package manifest, README, or license file

- Status: open
- Scope: upstream-content
- Owner: ArmController maintainers
- Evidence: `bun run sync --module ArmController --dry-run` at upstream commit
  `967f6e0c5a1e211ffc45b7af80efece89252f685` selects seven C/C++ files and reports
  `PACKAGE_MANIFEST_MISSING`, `README_MISSING`, and `LICENSE_MISSING`.
- Impact: The portal can generate a source API view for the module, but cannot discover a cpkg
  package, render upstream usage guidance, or state a source license. This does not change the
  snapshot architecture; the source and documentation repositories have the same organization owner,
  and the portal must present the missing license as unknown rather than infer one.
- Workaround: Retain the validated source-only snapshot, surface all three warnings, and generate a
  module-level fallback instead of inventing package or README metadata.
- Close condition: A later synchronized ArmController revision contains at least one `cpkg.toml`, a
  README, and a license file, and the three manifest warnings disappear.
- Last verified: 2026-08-10
