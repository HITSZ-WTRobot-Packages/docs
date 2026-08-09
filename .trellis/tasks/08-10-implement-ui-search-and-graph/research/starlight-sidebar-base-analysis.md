# Starlight Sidebar Base-Path Analysis

## Symptom

A successful `/docs/` production build emitted custom sidebar links such as `/docs/docs/search/`.
Page-body links, canonical URLs, sitemap entries, Pagefind, and resources used `/docs/` correctly.

## Root Cause

The application passed links already constructed with `BASE_PATH` into `StarlightPage.sidebar`.
Starlight treats sidebar links as site-relative slugs and applies Astro's configured base during
rendering, so both layers added the same prefix. Existing browser coverage navigated directly to
routes and never clicked or inspected a Starlight-owned sidebar link.

## Correction

`buildPortalSidebar` now returns `/`, `/search/`, `/modules/<slug>/`, and `/packages/<slug>/` values
independent of deployment configuration. Starlight owns the final prefix. Application-owned links
continue to use the shared `sitePath(basePath, ...)` helper because Astro does not rewrite them.

## Prevention

- Unit/integration coverage asserts that sidebar inputs are unique site-relative links without a
  deployment prefix.
- Nested-base Playwright coverage asserts the rendered search href and clicks it on desktop.
- Production artifact review checks that duplicated segments such as `/docs/docs/` are absent.
- Keep framework-owned route normalization distinct from application-owned URL construction in
  frontend specifications and code review.
