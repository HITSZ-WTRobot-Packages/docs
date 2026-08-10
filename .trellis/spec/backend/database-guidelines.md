# File-Backed Data Guidelines

## No Database

This static site has no database, ORM, migration system, server cache, or mutable production state.
The committed `sources/` tree and `sources/manifest.json` are the reproducible input store. Package
and API catalogs are produced during synchronization and committed per module; builds only validate
and aggregate those artifacts.

`sources/manifest.json` is also the only persistent repository index. Production code contains no
static module-repository list. Existing synchronization modes reconstruct module configuration from
the manifest; a new organization repository enters it only when its first discovery candidate and
the complete cross-module graph validate successfully.

## Snapshot Contract

- During synchronization, discover packages and source ownership from the temporary upstream clone;
  never persist `cpkg.toml` or source files solely to support a later build.
- Validate `sources/manifest.json`, each content file, and each package/API artifact at its read
  boundary.
- Record repository URL, branch, full SHA, producer fingerprint, uncached references, selected
  content path, artifact path, byte size, and SHA-256 checksum.
- Manifest format version 2 requires `shortSha` to equal the first 12 characters of `sha`,
  `totalBytes` to equal the sum of content and artifact byte counts, unique module IDs and paths, a
  complete one-to-one license-file index, and exactly one package plus one API artifact per module.
- Sort object keys and arrays with an explicit stable comparator before serialization.
- Normalize line endings and finish text files with one newline where source fidelity permits.
- Treat snapshot paths as POSIX-style relative paths and reject absolute paths, `..` escapes,
  symlinks, and entries outside the module root.
- A configured module may legitimately contain no package manifest, README, or source files. Record
  `PACKAGE_MANIFEST_MISSING`, `README_MISSING`, or `LICENSE_MISSING` warnings and persist valid empty
  catalog states instead of dropping the module or aborting unrelated synchronization.
- A missing manifest represents an empty index. Discovery installs the first module directory and
  manifest atomically; dry-run or any discovery failure leaves the index empty.

## Atomic Replacement

Synchronize into a temporary sibling directory, validate the complete candidate including all
module package/API catalogs, then rename it into place. A failed clone, selection, reference
closure, license check, Doxygen run, checksum, cross-module dependency resolution, or validation
must leave the previous snapshot byte-for-byte intact. Dry-run computes and reports the plan but
must never write project files.

## Schema Evolution

Add an explicit format version to repository-owned manifests and generated data. Readers may accept
documented historical upstream `cpkg.toml` variants during synchronization, but repository-owned
formats fail on unknown versions. A legacy snapshot may be read only by the full synchronization
migration path, never by ordinary generation/build. Schema changes require fixture migration tests
and deterministic-output tests.

## cpkg Catalog Contract

- Discover upstream catalog entries only in the synchronization clone. Persist one
  `package-catalog.json` per module and verify its manifest byte count and SHA-256 before parsing.
- Accept an omitted upstream `format_version` for historical manifests. If present it must equal 1.
- Require globally unique `pkgname` and derived package slug values. Display `name` may repeat across
  namespaces and is not a stable identifier.
- Resolve dependencies only after every package is parsed. The exact approved external dependency
  set is `FreeRTOS`, `stm32cubemx`, and `VelocityProfile::SCurve`; all other missing targets fail.
- Derive reverse dependencies from the normalized catalog, revision labels as
  `<version>+<module-short-sha>`, and source URLs pinned to the full module SHA.
- Keep module and aggregate catalog arrays explicitly sorted and serialize format version 1 without
  timestamps.

## API Catalog Contract

- Run the exact `.doxygen-version` only during synchronization against explicit source paths in the
  temporary clone. Doxygen XML is temporary and must not be committed.
- Persist one format-version-2 `api-catalog.json` per module with its source branch and normalized
  Doxygen version. Verify checksum, schema, module identity, source branch, and version before
  aggregation. API source URLs follow the configured branch instead of embedding the module SHA, so
  a revision-only update leaves the large API artifact byte-identical; the manifest retains the
  exact synchronized SHA.
- Every catalog package receives one API reference. Preserve explicit `complete`, `sparse`, `empty`,
  or `failed` states and stable warnings instead of rebuilding missing data during an ordinary build.
- A producer fingerprint covers the locked Doxygen version and source-to-artifact implementation.
  Changed-only synchronization may skip only when both upstream SHA and fingerprint match.

## Common Mistakes

- Using file modification times or clone paths as build input.
- Serializing filesystem traversal order.
- Updating a module before all references and licenses have been validated.
- Fetching missing data during an ordinary build instead of failing with an actionable diagnostic.
- Running Doxygen during validation, site build, or deployment instead of consuming the committed API
  artifact.
