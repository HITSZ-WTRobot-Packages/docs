# Doxygen Invocation Runtime Boundary Analysis

## Symptom

The initial Execa call passed the generated Doxyfile through its `input` option while invoking
`doxygen -`. Under the repository's Bun runtime, Doxygen received no configuration, fell back to
its defaults, scanned the working directory, and emitted HTML/LaTeX at the repository root. Target
isolation correctly reported missing XML, but the original diagnostic did not expose the failure
class.

## Root Cause Category

Cross-runtime process I/O contract. TypeScript types documented the Execa option, but successful
type-checking did not prove that Bun, Execa, and Doxygen agreed on stdin delivery.

## Why The Initial Approach Failed

- The implementation assumed the wrapper's typed `input` option was sufficient evidence of stdin
  delivery.
- The first assertion checked only the normalized result and did not assert absence of Doxygen's
  default output directories.
- A generic target failure warning hid whether the process, output, or XML boundary failed.

## Fix

- Generate a Doxyfile inside the per-run operating-system temporary root.
- Pass its exact path as an Execa argument and keep a bounded timeout.
- Classify process, missing-output, malformed-XML, and missing-compound failures with stable codes.
- Disable every irrelevant Doxygen output and remove the complete temporary root in `finally`.

## Prevention

- Integration fixtures assert that repository-root `html/` and `latex/` are never created.
- The real snapshot test proves that every synchronized source is owned exactly once.
- The backend and cross-layer specs require temporary config files for Doxygen instead of stdin.
- Any future process-wrapper stdin use needs a child-observed integration test, not only type checks.
