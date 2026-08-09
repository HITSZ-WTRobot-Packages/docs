# Generate Doxygen Reference

## Goal

Generate structured C/C++ API reference data for each package from snapshot inputs.

## Requirements

- Run Doxygen against only the synchronized C/C++ inputs associated with each package.
- Generate XML and parse it with the selected maintained XML library.
- Normalize namespaces, classes/structs, functions, enums, files, descriptions, locations, and links
  into a package-scoped symbol catalog.
- Avoid a full source browser and avoid requiring compilation of upstream firmware.
- Isolate package failures; absent comments or symbols create quality warnings and explicit empty
  states rather than suppressing the package.
- Make Doxygen version and invocation reproducible locally and in CI.

## Acceptance Criteria

- [ ] Header-only, compiled, C, and C++ fixtures generate valid symbol data.
- [ ] API references remain associated with the correct package and source revision.
- [ ] Empty or sparsely documented packages do not break the site build.
- [ ] Private or non-reproducible tooling requirements trigger the architecture issue gate.

## Dependencies

Requires catalog and snapshot path ownership.

