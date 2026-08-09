# Research and Select Libraries

## Goal

Select maintained libraries for all non-domain infrastructure before implementation starts.

## Requirements

- Evaluate established libraries for TOML parsing, runtime schema validation, Markdown AST parsing
  and rendering, XML parsing, Git operations, graph visualization/layout, link checking, and tests.
- Start from Zod, unified/remark, a maintained TOML parser, a maintained XML parser, simple-git or
  execa, Cytoscape.js, and Starlight Pagefind, but verify compatibility and licensing.
- Produce small Bun-based proof-of-concept checks for the selected APIs.
- Record alternatives, rejection reasons, version constraints, licenses, browser/runtime impact,
  and maintenance risk under this task's `research/` directory.
- Do not hand-roll parsers, search, or graph layout. If no library is suitable, record an
  architecture issue and pause for user direction.

## Acceptance Criteria

- [ ] Each infrastructure concern has a selected library and documented fallback.
- [ ] Selected libraries work with Bun, Astro static output, and the project license constraints.
- [ ] Later tasks can implement without making additional foundational library choices.

## Dependencies

Requires repository and convention bootstrap.

