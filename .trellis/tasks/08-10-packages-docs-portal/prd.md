# Build HITSZ WTR Packages Documentation Portal

## Goal

Deliver a deployment-ready static documentation repository for
`HITSZ-WTRobot-Packages/docs`. The repository must contain committed snapshots of all
documentation inputs so normal builds are reproducible and require no access to upstream module
repositories.

## Requirements

- Use Astro and Starlight with Bun as the only JavaScript package manager.
- Use uv with its default `.venv` and global cache behavior if Python is needed.
- Prefer established libraries for every feature; custom implementations require documented
  research showing that no suitable library exists.
- Synchronize `cpkg.toml`, README content and relative assets, Doxygen inputs, and licenses into a
  tracked `sources/` snapshot.
- Support manual full, per-module, changed-only, and dry-run synchronization locally and through a
  manually triggered GitHub Action.
- Build module, package, supplemental Markdown, and Doxygen API pages entirely from the snapshot.
- Support arbitrary `SITE_URL` and `BASE_PATH` values without hard-coded deployment paths.
- Produce search, dependency navigation, quality reporting, tests, CI, and a deployable `dist/`.
- Do not deploy from this task group and do not modify upstream repositories.
- Record out-of-scope problems in `issues.md`; pause for user input if an issue changes an
  architectural choice.
- Keep `AGENTS.md` and `.trellis/spec/` synchronized with all adopted project conventions.

## Task Order

1. Bootstrap repository and conventions.
2. Research and select libraries.
3. Scaffold the static documentation site.
4. Implement the source synchronizer.
5. Synchronize and commit real module content.
6. Build the cpkg catalog.
7. Render README content and relative references.
8. Generate Doxygen reference data.
9. Implement UI, search, and dependency graph.
10. Add synchronization and validation Actions.
11. Complete release-readiness checks and the deployment test plan.

## Acceptance Criteria

- [ ] Every child task is completed in dependency order and passes its own quality gate.
- [ ] Real snapshots for all configured modules are committed and sufficient for an offline build.
- [ ] Repeated synchronization is idempotent and changed-only synchronization is incremental.
- [ ] Root, nested base paths, and custom site origins pass build and browser tests.
- [ ] All snapshot packages have stable pages, revision metadata, README or fallback content,
      dependencies, and Doxygen status.
- [ ] Lint, typecheck, unit, integration, link, search, browser, accessibility, and convention checks
      pass.
- [ ] `dist/` is deployment-ready and deployment-stage tests are documented.
- [ ] No formal deployment or upstream-repository modification is included.

## Architecture Decision Gate

Stop implementation, create or update `issues.md`, and request user input when snapshot size,
licensing, cross-root references, unavailable Doxygen tooling, Action write permissions, library
availability, or static base-path behavior would force a different architecture.

