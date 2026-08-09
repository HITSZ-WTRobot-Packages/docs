# Release Evidence

## Candidate

- Source commit: `8e060a8` (`feat: verify release artifacts and document deployment`)
- Build date: 2026-08-10
- Production address contract:
  `SITE_URL=https://hitsz-wtrobot-packages.github.io`, `BASE_PATH=/docs/`
- Build inputs: committed `sources/manifest.json` and 163 committed module snapshot files
- Network boundary: generation and builds ran in the restricted workspace environment without
  external network access. Linkinator crawled only a loopback preview and explicitly skipped
  external origins.

## Baseline Gate

- `bun install --frozen-lockfile`: 806 installs across 875 locked packages, no changes.
- `bun run check`: conventions, Prettier, ESLint, Astro check, 68 unit/integration tests, 594
  assertions, zero failures, and zero type warnings/hints.
- `bun run generate`: 6 modules, 42 packages, 52 internal and 16 external dependency edges; 48
  documentation pages (15 upstream and 33 fallback); 43 API references and 2,136 symbols with
  Doxygen 1.16.1.
- `actionlint` v1.7.12: both workflow files passed.
- Trellis task context and `git diff --check`: passed.

## Address Matrix

| Address | Static artifact | Links | Browser |
| --- | --- | --- | --- |
| `https://release-root.example.invalid/` | 6 modules, 42 packages, 43 API references, 95 HTML, 93 Pagefind, 229 files | 102 internal passed; 2,741 external skipped | 12 desktop/mobile scenarios passed against prebuilt `dist/` |
| `https://hitsz-wtrobot-packages.github.io/docs/` | Same complete counts | Same link result | 12 desktop/mobile scenarios passed against prebuilt `dist/` |
| `https://release-nested.example.invalid/products/wtr/docs/` | Same complete counts | Same link result | 12 desktop/mobile scenarios passed against prebuilt `dist/` |

Every browser run set `PLAYWRIGHT_REUSE_ARTIFACT=1`; the web-server log contained `astro preview`
and no second `astro build`. Scenarios covered catalog/navigation, package metadata and dependencies,
Cytoscape pixels and keyboard state, API revision/status, Pagefind query/filter restoration, Chinese
upstream README content, 404 behavior, responsive overflow, and zero serious/critical axe findings.

Successful desktop/mobile screenshots for catalog, package graph, API, search, and Chinese README
were inspected manually. No blank output, incoherent overlap, horizontal overflow, clipped graph
label, broken wrapping, or missing asset was observed.

## Final Artifact

The final ignored `dist/` was built from `8e060a8` for the production address pair, then checked by
artifact, Linkinator, and exact-byte Playwright modes.

- Uncompressed size: 7,486,902 bytes
- Files: 229
- Symbolic links: 0
- Deterministic archive: `/tmp/wtr-packages-docs-8e060a8.tar.gz`
- Archive size: 1,799,567 bytes
- SHA-256: `9fb86684f58e324c7364e62f77943edc885ef763c8bac1bdb8152d30f9566f96`

The archive was produced twice with sorted names, epoch timestamps, numeric owner/group zero, and
GNU tar format. Both copies had the same SHA-256. The archive is verification output only: it is not
tracked, uploaded, or deployed.

## Boundary Result

No Pages workflow, Pages artifact upload, production deployment, DNS change, custom domain change,
or upstream repository modification occurred. `DEPLOYMENT-001` remains the explicit administrator
gate for the later deployment task; `UPSTREAM-001` remains the only upstream-content deficiency.
