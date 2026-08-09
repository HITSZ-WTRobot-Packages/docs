# Type Safety

## Compiler Contract

Use Astro's strict TypeScript settings. `strict`, `noUncheckedIndexedAccess`, and
`exactOptionalPropertyTypes` remain enabled. Public functions and component props have explicit
types; local values use inference where it is clearer.

## Runtime Validation

Use Zod at external and serialized-data boundaries:

```ts
export const PackageSchema = z.object({
  name: z.string().min(1),
  module: z.string().min(1),
  version: z.string().min(1),
});

export type Package = z.infer<typeof PackageSchema>;
```

Infer domain types from their schema. Transform external variants into one normalized internal type
once, then keep components unaware of the source format.

## Organization

- Schemas and inferred types live with the owning domain under `src/lib/`.
- View-only prop types live in the component file.
- Generated JSON has an explicit versioned schema and is parsed before use.
- Use discriminated unions for quality states, dependency kinds, and diagnostics.

## Forbidden Patterns

- `any`, `@ts-ignore`, unchecked `as`, and non-null assertions in production code.
- Duplicated hand-written interfaces that can drift from a Zod schema.
- Passing `unknown` past the validation boundary.
- Treating optional and nullable values as interchangeable.
- Using a display label as a stable identifier.
