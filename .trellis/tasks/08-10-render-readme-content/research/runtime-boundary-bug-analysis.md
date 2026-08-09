# Bug Analysis: Bun-only manifest reader failed in Astro prerender

## 1. Root Cause Category

- **Category**: B/D - Cross-layer contract and test coverage gap
- **Specific Cause**: `readSourceManifest` lived under shared `src/` code but used `Bun.file`.
  Synchronizer, unit, integration, and CLI checks all ran under Bun, so the assumption stayed hidden
  until an Astro static route imported the reader in Astro's Node prerender runtime.

## 2. Why Earlier Checks Failed

1. The loader was exercised only from Bun-owned entry points before the resource route existed.
2. TypeScript accepted the global because Bun types are part of the project compiler environment;
   compile-time success did not prove runtime availability.
3. The initial README integration fixture called the loader through `bun test`, repeating the same
   runtime assumption instead of crossing the production boundary.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Shared `src/` loaders use Web or `node:` APIs only | Done |
| P0 | Convention | Reject `Bun.*` usage under `src/` | Done |
| P0 | Integration | Run Astro production builds after adding loader-backed routes | Done |
| P1 | Documentation | Record package-manager/runtime ownership in backend and cross-layer specs | Done |

## 4. Systematic Expansion

- **Similar issues**: Any Bun convenience added to a catalog, Doxygen, Markdown, or route helper can
  pass Bun tests and fail only during Astro build.
- **Design improvement**: Runtime-specific code remains in `scripts/` and tests; shared domain code
  uses standard modules.
- **Process improvement**: A loader is not complete until it is exercised through its production
  consumer, including root/nested URL variants where relevant.

## 5. Knowledge Capture

- [x] Updated backend quality guidelines.
- [x] Updated the cross-layer thinking guide.
- [x] Added an executable convention check.
- [x] Verified the fix through a nested-base Astro production build.
- [x] Confirmed this repository has no `src/templates/markdown/spec/` mirror to synchronize.
