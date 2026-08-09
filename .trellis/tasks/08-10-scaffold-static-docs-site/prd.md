# Scaffold Static Documentation Site

## Goal

Create the Bun-managed Astro/Starlight application and its baseline quality tooling.

## Requirements

- Configure Astro, Starlight, strict TypeScript, formatting/linting, unit tests, and Playwright.
- Use `SITE_URL` and `BASE_PATH` as the only deployment-address inputs.
- Provide a single URL helper used by navigation, assets, canonical URLs, sitemap, search, and 404.
- Validate `/`, `/docs/`, and a nested base such as `/products/wtr/docs/`.
- Provide the documentation application as the first screen, not a marketing landing page.
- Use only Bun commands and commit only `bun.lock`.

## Acceptance Criteria

- [ ] Development, lint, typecheck, test, and production-build commands run through Bun.
- [ ] Static output works under root and nested base paths.
- [ ] Baseline desktop and mobile pages render without overflow or overlap.
- [ ] No upstream data synchronization is implemented here.

## Dependencies

Requires completed library selection and project conventions.

