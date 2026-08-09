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

- [x] A complete deployment artifact is produced and passes the full local quality matrix.
- [x] Deployment-stage procedures and tests are decision-complete.
- [x] Every unresolved out-of-scope concern is recorded in `issues.md`.
- [x] No deployment workflow is enabled and no production deployment is performed.

## Dependencies

Requires every preceding child task.

## Implementation Notes

- `check:artifacts` now parses the generated HTML and Pagefind manifest, joins every built route to
  the catalog/README/Doxygen model, and rejects missing metadata, unsafe paths, symlinks, credential
  signatures, raw snapshots, and resources outside the generated allowlist.
- Frozen installation, the full 68-test/594-assertion quality gate, all three offline generators,
  and root, `/docs/`, and `/products/wtr/docs/` builds passed. Each artifact contained 6 modules, 42
  packages, 43 API references, 95 HTML pages, 93 Pagefind pages, and 229 files.
- Linkinator passed 102 internal targets for every address variant while 2,741 repeated external
  links were deliberately skipped without requests.
- Root, `/docs/`, and deep nested variants each passed 12 Playwright scenarios across desktop and
  mobile, including Pagefind, graph canvas pixels, 404, screenshots, axe, responsive layout, and an
  explicit Chinese upstream README check. Successful screenshots were manually inspected for blank
  output, overlap, overflow, and graph/text clipping. All three browser matrices used
  `PLAYWRIGHT_REUSE_ARTIFACT=1`; their logs started preview without a second build.
- `docs/deployment.md` selects the default GitHub Pages project-site address, defines the custom
  domain transition, minimum permissions, protected environment, exact-byte artifact handoff,
  retained-artifact rollback, rollout drills, stop conditions, and post-deployment tests.
- `DEPLOYMENT-001` records the administrator-owned Pages/domain/protection state that could not be
  verified from the current environment. It blocks enabling deployment, not local artifact
  readiness. No Pages workflow, production deployment, or upstream repository modification was
  performed.
