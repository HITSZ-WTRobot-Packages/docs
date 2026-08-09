# Component Guidelines

## Static First

Use Astro components for content, navigation, metadata, and layouts. Introduce a client island only
for stateful search filtering or dependency-graph interaction. Select the lightest hydration mode
that preserves the workflow; do not hydrate an entire page.

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

## Common Mistakes

- Hiding critical package content behind hydration.
- Nesting cards, clipping long identifiers, or using color as the only quality indicator.
- Linking to an internal route with a raw leading slash.
- Showing an internal dependency as external because components reclassify catalog data.
- Replacing Cytoscape's graph semantics/layout or Starlight's Pagefind engine with custom code.
