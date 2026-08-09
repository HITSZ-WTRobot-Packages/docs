# Implement Source Synchronizer

## Goal

Build the only network-aware subsystem: a safe, incremental synchronizer that writes reproducible,
tracked documentation snapshots.

## Requirements

- Maintain an explicit module allowlist beginning with the six known active package repositories.
- Support full, `--module`, `--changed`, and `--dry-run` modes from one Bun CLI.
- Shallow-clone into temporary storage and select only `cpkg.toml`, README content, transitively
  referenced Markdown/assets, Doxygen C/C++ inputs, and licenses.
- Parse Markdown references through the selected AST library; preserve remote links and reject
  references escaping the module root.
- Generate `sources/manifest.json` with repository, branch, SHA, file size, and SHA-256 metadata.
- Validate size limits and references before atomically replacing a module snapshot.
- Preserve the last successful snapshot on any failure and produce no changes for identical input.
- Make all output deterministic apart from explicitly defined synchronization metadata.

## Acceptance Criteria

- [ ] Full and one-module syncs produce valid snapshots.
- [ ] Changed-only mode skips unchanged SHA values.
- [ ] Dry-run never writes repository files.
- [ ] Failed syncs leave prior snapshots intact.
- [ ] Repeating a sync against unchanged upstream state leaves Git clean.
- [ ] Snapshot size or licensing concerns that alter the design trigger the architecture issue gate.

## Dependencies

Requires the application/tooling scaffold and selected parsing/Git libraries.

