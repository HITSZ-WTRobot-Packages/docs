# CLI Logging Guidelines

## Output Contract

Commands write concise progress and summaries to stdout and actionable diagnostics to stderr. CI
must be able to run commands without interactive prompts. Use one shared reporter so local and
GitHub Actions output describe the same events.

## Levels

- `debug`: opt-in command details and selected paths, never enabled by default in CI.
- `info`: phase starts, module revisions, counts, durations, and final summaries.
- `warn`: recoverable upstream deficiencies and per-package documentation quality states.
- `error`: failed validation or operation with a stable diagnostic code and corrective hint.

## Required Context

Synchronization messages include mode, module, repository, branch, and abbreviated SHA where
known. Generation messages include package and snapshot-relative path. Summaries include changed,
unchanged, skipped, warning, and failed counts.

## Sensitive Data

Never print tokens, headers, credential-bearing URLs, complete environment variables, temporary
directory names containing user data, or arbitrary upstream file contents. Sanitize Git errors
before displaying their remote URL.

## Determinism

Snapshot files and generated catalogs never contain timestamps or durations. Time-dependent details
belong only in command output or explicitly named synchronization metadata fields.
