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
