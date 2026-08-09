# Release Readiness and Deployment Plan

## Goal

Prove that the repository is deployment-ready while leaving formal deployment to a later task.

## Requirements

- Build the complete site from committed real snapshots with external network access disabled.
- Verify root, `/docs/`, and a custom nested base path with multiple site origins.
- Run convention, lint, typecheck, unit, integration, Doxygen, static-link, Pagefind, Playwright,
  screenshot, responsive, and accessibility checks.
- Confirm all synchronized packages have stable routes, revision metadata, README/fallback,
  dependencies, and API status.
- Inspect `dist/` for temporary clones, Git metadata, `.venv`, credentials, and unapproved upstream
  files.
- Document deployment configuration, required permissions, custom-domain behavior, rollback, and
  post-deployment tests.
- Update README, AGENTS, Trellis specs, and `issues.md` with the final executable project contract.

## Deployment Test Checklist

- HTTPS, canonical URL, sitemap, robots, 404, deep-link refresh, and custom-domain behavior.
- Root and nested base-path navigation, assets, Pagefind worker/index, Markdown resources, and API
  anchors.
- First deploy, repeated deploy, prior-artifact rollback, and snapshot-update rebuild.
- Branch protection, Actions permissions, concurrency, manual synchronization, and bot commits.
- Desktop/mobile search, dependency graph, Chinese content, external links, and accessibility.

## Acceptance Criteria

- [ ] A complete deployment artifact is produced and passes the full local quality matrix.
- [ ] Deployment-stage procedures and tests are decision-complete.
- [ ] Every unresolved out-of-scope concern is recorded in `issues.md`.
- [ ] No deployment workflow is enabled and no production deployment is performed.

## Dependencies

Requires every preceding child task.

