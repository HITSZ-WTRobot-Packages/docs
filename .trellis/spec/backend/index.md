# Build Pipeline Guidelines

The backend layer in this repository is build-time TypeScript: synchronization, persisted catalog
validation, Markdown transformation, and synchronization-time Doxygen XML normalization. There is
no server, database, or runtime API.

## Pre-Development Checklist

- Read [Directory Structure](./directory-structure.md) before adding a loader or CLI.
- Read [Error Handling](./error-handling.md) and [Logging](./logging-guidelines.md) before touching
  synchronization or generation.
- Read [Quality](./quality-guidelines.md) before changing snapshot or catalog contracts.
- Read [Database](./database-guidelines.md) when considering persistence; it explains why tracked
  files are the only supported store.
- Read the shared code-reuse and cross-layer guides.

## Guides

| Guide | Contract |
| --- | --- |
| [Directory Structure](./directory-structure.md) | Ownership of CLIs, domain loaders, fixtures, and generated files |
| [Database](./database-guidelines.md) | File-backed snapshot and deterministic-output rules |
| [Error Handling](./error-handling.md) | Boundary validation, atomic writes, and diagnostics |
| [Logging](./logging-guidelines.md) | Human and CI output without secret leakage |
| [Quality](./quality-guidelines.md) | Offline, idempotency, fixture, and integration gates |

Repository-owned documentation and user-facing interface copy are written in Simplified Chinese.
Code comments remain in English, while synchronized upstream README content keeps its original
language.
