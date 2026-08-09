# State Management

## State Categories

- Build state: validated snapshot and generated catalogs; immutable during a deployed build.
- Route state: module, package, symbol, and supplemental-page slugs in the URL.
- Filter state: search text, module, namespace, result type, graph direction, and depth. Store
  shareable values in URL query parameters.
- Ephemeral state: menu open state, selected graph node, and focus position inside one island.

## Rules

- Do not add a global state library. State is local to an island or encoded in the URL.
- Derive reverse dependencies and transitive graph subsets from the shared catalog; do not maintain
  duplicate indexes in components.
- Update query parameters with the History API while preserving `BASE_PATH` and unrelated values.
- Progressive enhancement is required: package content and direct dependency lists remain available
  when client JavaScript fails.
- Persist user preferences only when they are meaningful across pages and do not duplicate
  Starlight behavior.

## Server State

There is no server state. Pagefind and graph data are immutable build artifacts. A failed asset load
shows a bounded error state with a retry action and does not hide static documentation.

## Common Mistakes

- Treating build data as mutable client data.
- Storing filter state only in memory, which breaks navigation and sharing.
- Introducing a context/provider around the whole site for one interactive feature.
- Computing URL strings independently from the shared path helper.
