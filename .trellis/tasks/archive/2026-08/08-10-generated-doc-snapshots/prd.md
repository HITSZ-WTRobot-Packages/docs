# Persist Generated Documentation Snapshots

## Goal

Make synchronization the only phase that clones upstream repositories or runs Doxygen. Persist
README documentation, its resource closure, license files, normalized package metadata, and
normalized Doxygen API data so Astro, Cloudflare Pages, and GitHub Pages builds are deterministic,
offline consumers of committed data rather than repeated API producers.

## Requirements

- Synchronization must run Doxygen for full, per-module, changed-only, dry-run, manual Action, and
  `repository_dispatch` incremental flows.
- Use the locally installed Doxygen version `1.16.1`. GitHub Actions must install the same version
  through `ssciwr/doxygen-install` pinned to commit
  `b5b80f5a60852f72d3c33f47fee9ddfb84a25929`, not a repository-owned download script.
- Persist one normalized package catalog and one normalized API catalog per module.
- Preserve upstream README, referenced Markdown/resources, and license files byte-for-byte under a
  dedicated content root. Do not persist `cpkg.toml`, C/C++ sources, Doxygen XML, temporary
  Doxyfiles, clones, or Git metadata.
- Validate README links to uncached source files during synchronization and rewrite them to pinned
  upstream URLs during rendering. Embedded resources must remain cached and verified.
- Generate candidates in temporary directories, validate the complete cross-module data model, and
  atomically replace only valid changed modules while preserving the last valid snapshot on error.
- Treat the upstream SHA and producer fingerprint as cache inputs. The fingerprint must cover the
  normalized Doxygen version, Doxyfile/generator behavior, and persisted Schema versions.
- `bun run build` and all `generate:*` validation commands must consume committed artifacts without
  invoking Doxygen or accessing upstream repositories.
- Keep `loadPortalData()` and its consumer-facing `PortalData` shape stable.
- Update repository documentation, workflow tests, `AGENTS.md`, and Trellis specifications to match
  the new producer/consumer boundary.

## Acceptance Criteria

- [x] `sources/` contains documentation/resources/licenses and normalized JSON, with no synchronized
      C/C++ source, raw `cpkg.toml`, Doxygen XML, or temporary build files.
- [x] Full synchronization produces package and API coverage equivalent to the existing snapshot.
- [x] Running the same synchronization twice with Doxygen 1.16.1 produces an identical tree and no
      Git diff; the second run reports unchanged modules.
- [x] README source links resolve to immutable upstream commit URLs while embedded resources remain
      local deployment resources.
- [x] Changed-only and module sync run Doxygen only for invalidated modules; producer changes
      invalidate all affected API artifacts.
- [x] Dry-run performs generation and validation without writing tracked snapshot files.
- [x] A failed clone, parse, Doxygen invocation, reference check, or global consistency check leaves
      the previous snapshot intact.
- [x] `bun run generate` and `bun run build` succeed without a usable Doxygen executable and without
      upstream network access.
- [x] Unit, integration, workflow, formatting, lint, typecheck, static artifact, link, browser,
      responsive, and accessibility checks pass in proportion to the changed surface.

## Definition of Done

- The source manifest, synchronization pipeline, catalog/API loaders, workflows, tests, and docs use
  the new committed-artifact contract.
- Existing module/package/API routes and quality states remain behaviorally compatible.
- Project and Trellis instructions document the revised workflow.
- The Trellis quality and finish workflows complete successfully.

## Technical Approach

Upgrade the source manifest to format version 2 and give each module a transactional directory with
`content/`, `package-catalog.json`, and `api-catalog.json`. Synchronization discovers all upstream
inputs from the temporary clone, builds a package catalog from transient `cpkg.toml` files, runs
Doxygen against transient source files, normalizes XML to stable TypeScript data, then copies only
the approved content and serialized JSON into the candidate.

At build time, package and API loaders read and checksum-verify each module's persisted JSON, combine
the module fragments in stable order, and preserve the current portal data interfaces. Markdown
rendering uses persisted reference metadata to distinguish cached pages/resources from validated,
uncached source links.

## Decision (ADR-lite)

**Context:** Re-running Doxygen in every static-site build causes platform-version failures and
duplicates work across deployment providers.

**Decision:** Doxygen is a synchronization-time producer. Persist normalized project-owned JSON,
not raw Doxygen XML. Partition derived data per module. Use Doxygen 1.16.1 locally and in GitHub
Actions via a commit-pinned community setup Action.

**Consequences:** Deployment builds no longer need Doxygen or upstream source. Snapshot updates are
larger than README-only changes, and Doxygen/generator upgrades intentionally regenerate API data.
Byte idempotence is guaranteed only for the same upstream bytes, normalized Doxygen version,
configuration, generator, and schemas.

## Out of Scope

- Adding a scheduled synchronization trigger; automatic synchronization remains
  `repository_dispatch` based.
- Persisting raw Doxygen XML or generated Doxygen HTML.
- Making one `dist/` valid for different `SITE_URL`/`BASE_PATH` pairs.
- Changing public portal routes or visual design.

## Research References

- [`research/doxygen-action.md`](research/doxygen-action.md) - GitHub Actions Doxygen setup and
  reproducibility decision.

## Technical Notes

- Current synchronization is already candidate-based and transactionally swaps module directories.
- Current package generation requires transient `cpkg.toml`; current API generation requires raw
  source files, but both already provide stable JSON serializers.
- Doxygen raw references and temporary paths must remain parser-internal. Persisted symbol IDs and
  source links must remain stable and repository-relative.
