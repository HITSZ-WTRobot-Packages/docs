# Infrastructure Library Selection

Verified on 2026-08-10 with Bun `1.3.14` on Linux. Version and license data came from the npm
registry's package metadata; behavior and integration details were cross-checked against each
project's official documentation or source repository.

## Decision Summary

| Concern | Selection and constraint | License | Runtime impact | Fallback / rejection rationale |
| --- | --- | --- | --- | --- |
| Static documentation | `astro@^7.2.0`, `@astrojs/starlight@^0.41.7` | MIT | Build only; Astro requires Node-compatible APIs equivalent to Node 22.12+ | Plain Astro would require rebuilding navigation, SEO, accessibility, and search. Docusaurus adds React runtime and conflicts with the requested stack. |
| Search | Starlight's bundled Pagefind | MIT | Static index plus a lazy browser client | Do not build an indexer. Algolia requires a hosted service and network access. Starlight enables Pagefind by default for prerendered sites. |
| TOML | `smol-toml@^1.7.1` | BSD-3-Clause | Build/sync only, zero native dependency | `@iarna/toml` is established but older and CommonJS-oriented. Bun's built-in TOML import is unsuitable for arbitrary discovered files and explicit parse diagnostics. |
| Runtime validation | `zod@^4.4.3` | MIT | Build/sync only; inferred TypeScript types | Valibot is smaller, but the project needs build-time validation rather than browser bundle minimization and Zod has broader ecosystem integration. |
| Markdown AST | `unified@^11.0.5`, `remark-parse@^11.0.0`, `remark-rehype@^11.1.2`, `rehype-sanitize@^6.0.0`, `rehype-stringify@^10.0.1`, `unist-util-visit@^5.1.0` | MIT | Synchronization and build; no client runtime | Markdown-it token transforms are possible but less natural for transitive reference discovery and HAST sanitization. Regex/string replacement is forbidden. |
| XML | `fast-xml-parser@^5.10.1` | MIT | Build only; pure ESM/CommonJS JavaScript | `xml2js` has a callback-era API and weaker maintenance signal. SAX parsers reduce memory but make Doxygen's cross-reference normalization much more complex; revisit only if measured XML size requires streaming. |
| Git | `simple-git@^3.36.0` | MIT | Synchronization only; wraps the installed Git executable with argument arrays | `isomorphic-git` avoids an executable but increases implementation surface and is unnecessary in CI/Linux. Raw interpolated shell commands are forbidden. |
| External processes | `execa@^10.0.1` | MIT | Build/sync only; used for Doxygen and bounded tooling | Bun.spawn is capable, but Execa provides mature cancellation, timeout, encoding, and structured failure behavior. It does not replace simple-git's Git-specific API. |
| CLI parsing | `commander@^15.0.0` | MIT | Synchronization only | `util.parseArgs` is acceptable but would require more handwritten mutual-exclusion/help behavior. Yargs is larger and not needed. |
| File discovery | `tinyglobby@^0.2.17` | MIT | Build/sync only | Native recursive traversal is retained only for tightly bounded operations; package/Doxygen input discovery uses tested glob semantics. Fast-glob has a larger dependency surface. |
| Dependency graph | `cytoscape@^3.34.0` | MIT | Lazy client island | D3 supplies primitives rather than graph semantics/layout. React Flow requires React and targets editors. Cytoscape includes breadth-first and force layouts and graph traversal APIs. |
| Static link checking | `linkinator@^8.0.3` | MIT | CI/build validation only; Node-compatible CLI/API | `broken-link-checker` is stale. Lychee is strong but introduces a separately distributed Rust binary; Linkinator stays inside the Bun lockfile and checks clean URLs/fragments. |
| Unit/integration tests | Bun's built-in `bun:test` | MIT (Bun) | Development/CI only | Vitest duplicates a runner already required by the package-manager constraint. Add Vitest only if an Astro integration proves impossible to exercise with Bun test. |
| Browser tests | `@playwright/test@^1.62.1` | Apache-2.0 | Development/CI plus pinned Chromium | Cypress adds a separate execution model and heavier client tooling. Playwright covers multiple viewports, screenshots, keyboard interaction, and base URLs. |
| Accessibility | `@axe-core/playwright@^4.12.1` | MPL-2.0 | Test only; no deployed code | Manual inspection remains supplementary. The MPL package is test-only and does not alter the license of repository-owned code. |
| UI icons | `astro-icon@^1.1.5`, `@iconify-json/lucide@^1.2.122` | MIT / ISC | Selected icons compile into static markup | Hand-authored SVG UI icons are forbidden. Loading a complete icon font would add unused client assets. |

## Compatibility Evidence

- Bun documents ESM/CommonJS module resolution and broad Node API compatibility. The proof below
  imports every foundational build/runtime library and runs Git and Doxygen through the selected
  process wrappers: <https://bun.sh/docs/runtime/nodejs-compat>.
- Starlight provides static navigation, SEO, accessibility foundations, and Pagefind search. Its
  configuration metadata declares `astro@^7.0.2`, and the selected `0.41.7` release therefore
  matches Astro `7.2.0`: <https://starlight.astro.build/> and
  <https://starlight.astro.build/guides/site-search/>.
- Starlight custom pages can use its layout while Astro file-based routes generate catalog pages
  from snapshot data: <https://starlight.astro.build/guides/pages/>.
- unified's remark-to-rehype pipeline supports an AST boundary before HTML serialization and
  sanitization: <https://github.com/remarkjs/remark-rehype>.
- fast-xml-parser exposes ESM parsing and tag-order preservation and is actively released:
  <https://github.com/NaturalIntelligence/fast-xml-parser>.
- Cytoscape exposes built-in layouts and requires an explicit `layout.run()`, which the PoC covers:
  <https://js.cytoscape.org/>.
- Linkinator recursively checks static output, fragments, CSS references, and clean URLs:
  <https://github.com/JustinBeckwith/linkinator>.

## Version And Upgrade Policy

- `package.json` uses compatible-release ranges shown above; `bun.lock` is the reproducible install
  authority committed to Git.
- Astro/Starlight, Playwright/browser, Zod major versions, and Markdown AST majors are upgraded in
  isolated changes with full generation/build/browser checks.
- Doxygen is an external reproducible tool pinned by the CI image/package version. The current
  development version is `1.16.1`.
- Review licenses and engine requirements on every major upgrade. No selected production
  dependency has a copyleft license; the test-only axe adapter is MPL-2.0.

## Maintenance Risks

- Astro 7 expects Node 22.12-compatible APIs. Bun currently passes the selected imports and Astro
  configuration PoC, but the actual Starlight build remains a scaffold-task gate.
- Doxygen XML can become large. Start with fast-xml-parser and measure real snapshots; switch to a
  maintained SAX parser only if memory evidence crosses CI limits, because that would be an
  architecture decision.
- Cytoscape accessibility is not automatic. The graph must have a keyboard-operable control model
  and an equivalent semantic dependency list.
- Linkinator may treat bot-protected external links as skipped. CI hard-fails internal links and
  reports external skips separately.
- Pagefind metadata/filter customization may require a Starlight search override, but the index and
  query engine remain Pagefind rather than custom code.

## Proof Of Concept

`poc.ts` and `poc-package.json` are committed with this research. The reproducible check is:

```text
mkdir <temporary-directory>
cp poc.ts <temporary-directory>/poc.ts
cp poc-package.json <temporary-directory>/package.json
cd <temporary-directory>
bun install --frozen-lockfile=false
bun run poc
```

Expected assertions:

1. TOML parses and Zod validates it.
2. unified rewrites a local Markdown link and sanitizes a script element.
3. Doxygen XML parses with attributes preserved.
4. simple-git and Execa execute installed Git and Doxygen binaries.
5. Cytoscape runs a headless breadth-first layout.
6. Commander rejects incompatible modes in project code; the PoC validates option parsing.
7. tinyglobby, Linkinator, Astro/Starlight, Playwright, and axe imports resolve under Bun.

The observed output and install details are recorded in `poc-results.md` after execution.
