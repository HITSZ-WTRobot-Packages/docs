# Deployment Decisions

## Selected Target

The future target is GitHub Pages using a custom GitHub Actions workflow. The repository remote is
`HITSZ-WTRobot-Packages/docs`, so the default project-site build contract is:

```text
SITE_URL=https://hitsz-wtrobot-packages.github.io
BASE_PATH=/docs/
```

A later organization-approved custom domain changes the contract to its HTTPS origin and `/`.
Because every address is supplied at build time, artifacts cannot move between these targets.

No deployment workflow is added in this task. A read-only GitHub API probe from the current
environment returned HTTP 404, so Pages enablement, domain state, and protection rules could not be
verified. That administrator-owned state is tracked as `DEPLOYMENT-001`.

## Primary Sources

- GitHub's custom-workflow contract requires an uploaded Pages artifact and a deployment job with
  `pages: write`, `id-token: write`, a build dependency, and an environment:
  <https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages>
- GitHub documents Pages source selection and the Actions artifact flow:
  <https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site>
- GitHub documents protected environments, reviewers, concurrency, and deployment history:
  <https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments>
- GitHub documents custom-domain ordering, DNS, domain verification, Actions-published `CNAME`
  behavior, and HTTPS:
  <https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site>
  <https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages>
  <https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https>
- Astro documents the GitHub project-site `site`/`base` relationship:
  <https://docs.astro.build/en/guides/deploy/github/>

## Workflow Boundaries

- A build job uses committed snapshots and `contents: read`. A separate deployment job owns only
  `pages: write` and `id-token: write` and targets protected `github-pages`.
- The future workflow builds once for the production address, validates those exact bytes, uploads
  them, and never rebuilds in the browser or deploy job. Its E2E step sets
  `PLAYWRIGHT_REUSE_ARTIFACT=1` so Playwright previews the existing `dist/`.
- External Actions remain full-SHA pinned; setup stays in the repository-local Action.
- Synchronization remains outside deployment. Snapshot bot commits pass ordinary validation before
  becoming deployment candidates.
- Pages concurrency does not cancel an in-progress deployment.
- A retained artifact plus digest/config metadata supports exact prior-byte rollback; rebuilding a
  recorded last-good commit is the fallback after retention expiry.

## Executable Artifact Contract

`bun run check:artifacts` parses the built HTML and Pagefind manifest, joins it to the validated
catalog/README/Doxygen model, and proves all modules and packages have stable routes, revision
metadata, documentation or fallback, dependencies, and API status. It also rejects symbolic links,
temporary/build/source directory names, environment or credential files, credential signatures,
raw snapshot trees, and any resource outside the generated documentation resource allowlist.

This makes the local/CI release assertion independent of a future hosting workflow and ensures a
prior artifact can be revalidated before rollback.
