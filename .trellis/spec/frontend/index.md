# Astro And Starlight Frontend Guidelines

The frontend is a static Astro/Starlight documentation application. Server rendering, client data
fetching, and application-wide client state are out of scope.

## Pre-Development Checklist

- Read [Directory Structure](./directory-structure.md) before adding a route or component.
- Read [Components](./component-guidelines.md) for Astro island and accessibility rules.
- Read [State](./state-management.md) before adding client-side state.
- Read [Type Safety](./type-safety.md) before consuming generated data.
- Read [Quality](./quality-guidelines.md) for base-path, browser, and accessibility gates.
- Read [Hooks](./hook-guidelines.md) before adding a framework-specific hook; most features should
  not need one.
- Read the shared code-reuse and cross-layer guides.

## Guides

| Guide | Contract |
| --- | --- |
| [Directory Structure](./directory-structure.md) | Routes, components, styles, and static assets |
| [Components](./component-guidelines.md) | Static-first composition and accessible interaction |
| [Hooks](./hook-guidelines.md) | Minimal framework islands and lifecycle cleanup |
| [State](./state-management.md) | URL/local state and derived catalog data |
| [Type Safety](./type-safety.md) | Strict TypeScript and validated content contracts |
| [Quality](./quality-guidelines.md) | Rendering, search, browser, and accessibility checks |

The portal uses Simplified Chinese at the root locale with the `zh-CN` language tag. Translate all
repository-owned visible and accessibility copy while preserving routes, stable data values,
technical identifiers, and synchronized upstream documentation.
