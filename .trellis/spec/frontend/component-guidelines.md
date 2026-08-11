# Component Guidelines

## Static First

Use Astro components for content, navigation, metadata, and layouts. Introduce a client island only
for stateful search filtering or dependency-graph interaction. Select the lightest hydration mode
that preserves the workflow; do not hydrate an entire page.

The portal uses small autonomous custom elements for search and graph interaction. Keep their
validated data in inert HTML/JSON and import heavy browser libraries only when the interaction is
requested. In particular, Cytoscape loads when the dependency explorer opens, not on every package
page visit.

```astro
---
interface Props {
  revision: string;
  sourceUrl: URL;
}
const { revision, sourceUrl } = Astro.props;
---
<dl class="package-meta">
  <div><dt>Revision</dt><dd><a href={sourceUrl.toString()}>{revision}</a></dd></div>
</dl>
```

## Props And Composition

- Define an `interface Props` for every non-trivial component.
- Pass validated domain objects or narrow view models; do not pass raw TOML/XML/manifest records.
- Prefer slots and small semantic components over boolean prop matrices.
- Keep route and URL construction outside display components unless the component calls the shared
  helper directly.
- `StarlightPage` sidebar entries are site-relative slugs such as `/search/`; Starlight applies
  Astro's `base` when rendering them. Application-owned anchors, Pagefind assets, resources, and
  graph links use the shared helper with `BASE_PATH`. Do not pass an already-prefixed link into
  Starlight or nested deployments will receive the prefix twice.

### Shared Global Navigation

Build the global sidebar through one shared navigation helper and use that result in both the
Starlight integration config and custom `StarlightPage` routes. This prevents content pages and
generated routes from drifting into different navigation trees.

```ts
const sidebar = buildPortalSidebar(catalog);

starlight({ sidebar });
// Generated routes pass the same value to <PortalPage sidebar={sidebar}>.
```

Keep repository guides in their own groups. In `驱动包`, render each catalog module as a native
collapsed Starlight group whose first item is the module `README`, followed by every package sorted
by `pkgname`. Starlight group labels cannot also be links; preserve the module route through the
explicit README item instead of copying the framework Sidebar component.

## Starlight Right Sidebar Contract

Starlight renders `PageSidebar` only when the route has a table-of-contents state. Portal routes
that provide custom right-sidebar content must activate that state through the shared page wrapper,
and the configured `PageSidebar` override must fall back to Starlight's default component for every
route it does not own.

```astro
<!-- Exact route owner: /packages/<slug>/, excluding /packages/<slug>/api/. -->
<PortalPage rightSidebar={true} ... />
```

- Match route IDs exactly and resolve display data from the validated cached catalog. A route that
  should have sidebar data but cannot resolve it fails the build instead of silently omitting it.
- Keep page-level navigation context such as breadcrumbs in `main`. The primary package install
  prompt also belongs in `main`, immediately before the documentation content; custom right
  sidebars own supplemental route-specific information panels, not the document hierarchy or its
  primary action.
- Custom mobile sidebar content precedes `main`. Reset `--sl-mobile-toc-height` below Starlight's
  `72rem` breakpoint when the default mobile TOC control is replaced, or the empty TOC reservation
  leaves a blank band below the header.
- Critical sidebar information is expanded in server-rendered HTML. If narrow screens should start collapsed,
  use a bounded custom element to synchronize the native `<details>` state, clean up media/print
  listeners on disconnect, and expand it for printing. Do not duplicate the information DOM.
- Browser tests assert desktop landmark order, mobile collapsed/expanded behavior, print visibility,
  overflow, axe results, and an adjacent route that must not receive the custom sidebar.

## Visual Rules

- Follow Starlight tokens first and add a restrained project palette with neutral surfaces, blue
  links, green success, amber warning, and red error states.
- Cards have at most an 8px radius and represent repeated items, not entire page sections.
- Use stable grid tracks, min/max widths, and aspect ratios for catalog rows and graph controls.
- Letter spacing is `0`; typography never scales directly with viewport width.
- Use the selected icon library for UI actions. Do not draw custom SVG icons.
- The selected icon stack is Astro Icon with `@iconify-json/lucide`; import individual icons so the
  deployed site does not ship a complete icon set.

## Accessibility

- Interactive elements use native button, link, input, checkbox, or select semantics.
- Icon-only buttons have an accessible name and a visible hover/focus tooltip where unfamiliar.
- Keyboard and pointer users can perform equivalent graph and filter actions.
- Focus is visible, headings remain hierarchical, landmarks are named, and status changes are
  announced when needed.
- Motion is optional and disabled under `prefers-reduced-motion`.
- A graph canvas is visual enhancement, not the only interface. Mirror visible nodes as native
  buttons and links, announce mode/selection changes, and keep static dependency lists outside it.
- Size Cytoscape nodes from label content with a bounded maximum and character wrapping. DOM
  overflow assertions cannot detect text clipped inside canvas rendering, so inspect graph
  screenshots at desktop and mobile widths.

## Common Mistakes

- Hiding critical package content behind hydration.
- Nesting cards, clipping long identifiers, or using color as the only quality indicator.
- Linking to an internal route with a raw leading slash.
- Showing an internal dependency as external because components reclassify catalog data.
- Replacing Cytoscape's graph semantics/layout or Starlight's Pagefind engine with custom code.
