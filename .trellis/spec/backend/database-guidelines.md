# File-Backed Data Guidelines

## No Database

This static site has no database, ORM, migration system, server cache, or mutable production state.
The committed `sources/` tree and `sources/manifest.json` are the reproducible input store. Generated
catalogs are derived during the build and are never a competing source of truth.

## Snapshot Contract

- Discover packages by scanning snapshot `cpkg.toml` files, not a maintained index.
- Validate `sources/manifest.json` and each `cpkg.toml` at its read boundary.
- Record repository URL, branch, full SHA, selected file path, byte size, and SHA-256 checksum.
- Manifest format version 1 requires `shortSha` to equal the first 12 characters of `sha`,
  `totalBytes` to equal the sum of file byte counts, unique module IDs and file paths, and a complete
  one-to-one license-file index.
- Sort object keys and arrays with an explicit stable comparator before serialization.
- Normalize line endings and finish text files with one newline where source fidelity permits.
- Treat snapshot paths as POSIX-style relative paths and reject absolute paths, `..` escapes,
  symlinks, and entries outside the module root.
- A configured module may legitimately contain no package manifest or README. Preserve its selected
  source files and record `PACKAGE_MANIFEST_MISSING`, `README_MISSING`, or `LICENSE_MISSING` warnings
  instead of dropping the module or aborting unrelated synchronization.

## Atomic Replacement

Synchronize into a temporary sibling directory, validate the complete candidate, then rename it
into place. A failed clone, selection, reference closure, license check, checksum, or validation
must leave the previous snapshot byte-for-byte intact. Dry-run computes and reports the plan but
must never write project files.

## Schema Evolution

Add an explicit format version to repository-owned manifests and generated data. Readers may accept
documented historical upstream `cpkg.toml` variants, but repository-owned formats fail on unknown
versions. Schema changes require fixture migration tests and deterministic-output tests.

## Common Mistakes

- Using file modification times or clone paths as build input.
- Serializing filesystem traversal order.
- Updating a module before all references and licenses have been validated.
- Fetching missing data during an ordinary build instead of failing with an actionable diagnostic.
