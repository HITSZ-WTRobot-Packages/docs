# Build cpkg Catalog

## Goal

Create the typed module/package catalog used by every generated page from committed snapshots only.

## Requirements

- Discover package boundaries exclusively through snapshot `cpkg.toml` files.
- Accept currently observed manifests with and without explicit `format_version`.
- Validate name, `pkgname`, version, dependencies, paths, and module revision.
- Distinguish internal dependencies from approved external dependencies.
- Generate reverse dependencies, stable slugs, source links pinned to the snapshot SHA, and package
  revision labels in `<version>+<short-sha>` form.
- Hard-fail duplicate package names, unresolved internal dependencies, invalid paths, and schema
  errors.
- Keep generated catalog output deterministic and testable with fixtures.

## Acceptance Criteria

- [ ] Every synchronized `cpkg.toml` maps to exactly one package entry and stable route.
- [ ] Internal and external dependency behavior is covered by unit tests.
- [ ] Catalog generation works without network access.
- [ ] Known packages omitted by historical indexes are found through direct snapshot scanning.

## Dependencies

Requires committed real snapshots.

