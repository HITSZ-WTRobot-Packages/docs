# Error Handling

## Boundary Errors

Validate CLI input, environment values, TOML, Markdown paths, Git results, XML, and manifest JSON at
the boundary. Convert library-specific failures into a shared diagnostic containing:

```ts
type Diagnostic = {
  code: string;
  message: string;
  module?: string;
  package?: string;
  path?: string;
  hint?: string;
};
```

Human output may format this type, while tests assert its stable fields. Never make callers parse a
free-form error message to determine behavior.

## Failure Semantics

- Invalid configuration and repository-owned data fail fast with a non-zero exit code.
- Remote Git operations use a 90-second idle timeout, HTTP/1.1 with TLS 1.2 transport, and at most
  three bounded attempts. Each failed clone attempt removes its incomplete temporary destination
  before retrying.
- A synchronization failure preserves the last successful snapshot and removes temporary state.
- Doxygen failure is isolated per package and becomes a recorded API quality state unless the
  executable itself is unavailable or non-reproducible; that case triggers `issues.md`.
- Missing package README content produces a catalog-derived fallback, not a hidden package.
- Broken, unsafe, or escaping local references fail generation with the source path and target.
- Do not catch an error unless adding context, converting it to a diagnostic, or providing a
  documented fallback.

## Cleanup

Use `try`/`finally` for temporary clones and generated intermediates. Cleanup failures are warnings
only after the primary result is known, and they must not replace the original error.

## Forbidden Patterns

- Empty `catch` blocks or catch-all success fallbacks.
- `process.exit()` in reusable domain modules; return or throw and let the CLI decide the exit code.
- Writing any part of a candidate snapshot before full validation.
- Logging credentials, authenticated remote URLs, environment dumps, or source file contents.
