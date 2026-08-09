# Deployment Plan

This repository is release-ready but intentionally does not contain an enabled deployment workflow.
The first production deployment is a separate, administrator-approved change. This plan selects
GitHub Pages with a custom Actions workflow as the target and defines the checks that change must
implement.

## Address Contract

The repository remote is `HITSZ-WTRobot-Packages/docs`. Until an organization-owned custom domain is
approved, the deployment target is the GitHub Pages project-site address:

| Target               | `SITE_URL`                                 | `BASE_PATH` |
| -------------------- | ------------------------------------------ | ----------- |
| Default project site | `https://hitsz-wtrobot-packages.github.io` | `/docs/`    |
| Future custom domain | Approved HTTPS origin, without a path      | `/`         |

`SITE_URL` and `BASE_PATH` are build inputs, not runtime settings. Canonical URLs, sitemap entries,
robots directives, navigation, Pagefind assets, Markdown resources, and graph links are compiled for
that exact pair. Never deploy an artifact under a different origin or path from the values used to
build and validate it.

For an Actions-published Pages site, configure the custom domain in repository Pages settings and at
the DNS provider. GitHub does not require or use a `CNAME` file from the uploaded Actions artifact.
Add the custom domain in Pages settings before changing DNS, verify the organization domain, avoid
wildcard DNS, wait for certificate provisioning, and enable HTTPS enforcement before switching
`SITE_URL` to the custom origin. A subdomain CNAME points to `HITSZ-WTRobot-Packages.github.io`,
without `/docs`.

References:

- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Pages custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [GitHub Pages HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
- [Astro deployment to GitHub Pages](https://docs.astro.build/en/guides/deploy/github/)

## Administrative Preconditions

An organization or repository administrator must complete and record these choices before adding the
deployment workflow:

- Set Pages **Build and deployment > Source** to GitHub Actions.
- Confirm Actions is allowed to use the required official Actions and the repository-local setup
  Action. Pin every external Action to a full commit SHA.
- Protect `main` and require the existing `Validation` workflow before merge.
- Protect the `github-pages` environment, restrict it to `main`, and require a reviewer for the
  first deploy, domain changes, and rollback runs.
- Keep synchronization manual. A deploy build consumes committed `sources/` and never calls
  `bun run sync`.
- Resolve `DEPLOYMENT-001` in `issues.md` with the selected domain, Pages setting, environment
  reviewers, and branch rules.

The build job needs only `contents: read`. A separate deployment job needs only `pages: write` and
`id-token: write`, depends on the successful build job, and targets the protected `github-pages`
environment. No checkout credentials, repository write token, upstream token, or deployment secret
is required. Use one `pages` concurrency group with `cancel-in-progress: false` so an in-progress
deployment is not interrupted by a newer run.

## Future Workflow Contract

The later deployment task must keep build, retained release artifact, and deployment
responsibilities separate:

1. Check out an explicit commit from `main` and install through
   `.github/actions/setup-docs-toolchain` with frozen dependencies and Chromium.
2. Run `bun run check` and `bun run generate` from the committed snapshot with no synchronization.
3. Build once with the selected production `SITE_URL` and `BASE_PATH`.
4. Run `bun run check:artifacts`, `bun run check:links`, and
   `PLAYWRIGHT_REUSE_ARTIFACT=1 bun run test:e2e` against that same address configuration. The flag
   makes Playwright preview the existing `dist/` instead of rebuilding it.
5. Package the validated `dist/` without symbolic or hard links. Upload the Pages artifact and a
   second retention artifact named with the source commit and address-contract hash. Store its
   SHA-256, source commit, `SITE_URL`, and `BASE_PATH` beside, but outside, the deployed files.
6. Deploy the already validated Pages artifact in a separate protected job. Do not rebuild in the
   deployment job.

The Pages artifact must satisfy GitHub's format and size contract: one gzip-compressed tar archive,
less than 10 GB, with no symbolic or hard links. Keep the retained release artifact for at least 30
days so the rollback drill can use the exact previous bytes. Action and Doxygen pins must follow the
same checksum policy as validation CI.

The initial workflow should support manual dispatch with an explicit commit SHA. Automatic main
deployment may be enabled only after the first, repeat, and rollback drills pass. When enabled, it
must deploy only a `main` commit whose `Validation` workflow succeeded; a snapshot bot commit
follows the same validation path and receives no deployment exception.

## Pre-Deployment Gate

Run this matrix from a clean commit. Builds and generators must complete while upstream network
access is unavailable; only Linkinator's local preview and Playwright's loopback server are used.

| Variant          | `SITE_URL`                                 | `BASE_PATH`           | Required checks                                           |
| ---------------- | ------------------------------------------ | --------------------- | --------------------------------------------------------- |
| Root             | `https://release-root.example.invalid`     | `/`                   | Build, artifact, links, desktop/mobile Playwright and axe |
| Repository path  | `https://hitsz-wtrobot-packages.github.io` | `/docs/`              | Build, artifact, links                                    |
| Deep custom path | `https://release-nested.example.invalid`   | `/products/wtr/docs/` | Build, artifact, links, desktop/mobile Playwright and axe |

Before the matrix, run `bun install --frozen-lockfile`, `bun run check`, and `bun run generate`.
`bun run check:artifacts` must report every module, package, and API reference; validate README or
fallback content, revision metadata, dependencies, stable package/API routes, Pagefind coverage,
canonical/robots/sitemap/404 assets, and reject temporary paths, Git metadata, virtual environments,
credentials, symbolic links, raw `sources/`, or unapproved upstream resources.

Retain the final production-address `dist/` until the Pages artifact is uploaded. Record the commit,
address pair, file count, byte size, Pagefind page count, SHA-256, and validation run URL in the
release record.

## Rollout Drills

### First Deployment

1. Require environment approval and deploy a validated artifact from the selected `main` commit.
2. Run every post-deployment test below before removing the approval hold.
3. Record the Pages deployment ID, workflow run, source commit, artifact digest, address pair, DNS
   state, and tester.

### Repeated Deployment

Redeploy the same commit and address pair. The generated file set and retained artifact digest must
match the first run. Canonical URLs and Pagefind results must remain unchanged, and the new
deployment must not create a synchronization commit.

### Snapshot Update

Run manual synchronization with `commit: true`. Confirm the bot commit changes only `sources/`, the
ordinary `Validation` workflow passes from the committed snapshot, and the deployment rebuild uses
the bot commit without contacting upstream repositories. Verify affected package revisions and
pinned source links changed while unaffected stable routes remain valid.

### Prior-Artifact Rollback

1. Select the last known-good retained artifact by deployment record, not by filename alone.
2. Verify its SHA-256, source commit, `SITE_URL`, and `BASE_PATH`; reject a configuration mismatch.
3. In a new protected manual workflow run, download that exact artifact, rerun artifact and link
   checks from its matching source commit, wrap it as the current run's Pages artifact, and deploy.
4. Run all post-deployment tests and record the rollback deployment ID.

If the retained artifact expired or fails verification, check out the last known-good commit,
rebuild it offline with the recorded address pair, pass the full matrix, and deploy the newly
verified bytes. Unpublishing is an emergency availability action, not a rollback; a successful new
deployment is required to restore the site.

## Post-Deployment Tests

Run the checklist against the deployed HTTPS URL after first deploy, repeat deploy, rollback, domain
change, and any snapshot update.

| Area           | Test                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Transport      | HTTP redirects to HTTPS; certificate matches the host; no mixed-content request occurs.                                                                                  |
| Metadata       | Home and deep pages have the selected canonical origin/base; `robots.txt` names the deployed sitemap; every sitemap URL returns success.                                 |
| Error handling | An unknown route returns the custom 404; a direct package, API anchor, and supplemental-page refresh succeeds.                                                           |
| Paths          | Root or configured nested navigation, Astro assets, favicon, Markdown resources, and all sidebar links retain exactly one base prefix.                                   |
| Search         | Pagefind worker, WASM, metadata, fragments, and indexes return success; desktop/mobile symbol search restores query and filters after refresh.                           |
| Packages       | Sample packages from every module show the expected revision, install command, README/fallback, dependencies, reverse dependencies, API status, and pinned source links. |
| API            | Direct API URLs and symbol anchors resolve; Chinese and long C/C++ identifiers wrap without clipping.                                                                    |
| Graph          | Direct, transitive, and reverse modes render nonblank on desktop/mobile and retain keyboard operation and URL state.                                                     |
| Accessibility  | Keyboard focus order and names remain valid; axe reports no serious or critical violations; reduced-motion behavior is stable.                                           |
| External links | A sampled upstream source/license link resolves to the exact pinned revision; failures remain external and do not break internal navigation.                             |
| Operations     | Deployment history points to the expected commit and environment; no synchronization loop or unexpected bot commit occurred.                                             |

At minimum, probe `/`, `/search/`, `/quality/`, one module, one package, one package API page, one
API anchor, `/robots.txt`, `/sitemap-index.xml`, `/pagefind/pagefind-worker.js`, and an unknown
route. Use the configured base prefix for every path. Save desktop/mobile screenshots for the
catalog, search, package graph, and API page with the release record.

## Stop Conditions

Do not deploy when any quality job fails, the artifact or address metadata is missing, a retained
artifact digest does not match, the target commit is outside protected `main`, Pages permissions are
broader than specified, the custom domain is unverified, HTTPS is unavailable, or DNS differs from
the approved record. Record the evidence in `issues.md`, leave the last good deployment active, and
resolve the condition before retrying.
