# Client Lifecycle Guidelines

## Default

Astro has no component hook requirement. Prefer static HTML and small vanilla or framework islands.
Do not add a UI framework solely to obtain hooks.

## Interactive Islands

When an island requires lifecycle behavior:

- Keep the state and listeners within the feature island.
- Register browser-only APIs after hydration and remove listeners, observers, and graph instances on
  teardown.
- Derive initial filter state from the URL so deep links work without hidden global state.
- Debounce only measured expensive work; search index loading itself must expose loading and error
  states.
- Guard browser APIs during static rendering and tests.

## Data Fetching

The deployed site has no application API and performs no upstream fetch. Pagefind may load its own
generated static index. Other catalogs are embedded or loaded from base-aware static assets owned by
the build.

## Naming

If the selected island framework uses hooks, follow its required `use*` naming. Framework-neutral
helpers must not be named as hooks. One feature must not mix lifecycle systems.

## Common Mistakes

- Running graph layout during server rendering.
- Loading the search index from a root-relative URL.
- Leaving media-query, resize, or keyboard listeners registered after navigation.
- Mirroring catalog data in mutable client state instead of deriving the visible subset.
