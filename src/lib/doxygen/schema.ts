import { z } from "zod";

const snapshotPath = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\).+$/u;

export const ApiSymbolKindSchema = z.enum([
  "namespace",
  "class",
  "struct",
  "union",
  "function",
  "enum",
  "typedef",
  "variable",
  "file",
  "define",
]);

export type ApiSymbolKind = z.infer<typeof ApiSymbolKindSchema>;

export const ApiLocationSchema = z
  .object({
    path: z.string().regex(snapshotPath),
    line: z.number().int().positive().nullable(),
    column: z.number().int().positive().nullable(),
    sourceUrl: z.url({ protocol: /^https?$/ }),
  })
  .strict();

export type ApiLocation = z.infer<typeof ApiLocationSchema>;

export const ApiEnumValueSchema = z
  .object({
    name: z.string().min(1),
    initializer: z.string(),
    description: z.string(),
  })
  .strict();

export type ApiEnumValue = z.infer<typeof ApiEnumValueSchema>;

export const ApiSymbolSchema = z
  .object({
    id: z.string().min(1),
    anchor: z.string().min(1),
    kind: ApiSymbolKindSchema,
    name: z.string().min(1),
    qualifiedName: z.string().min(1),
    signature: z.string(),
    description: z.string(),
    location: ApiLocationSchema.nullable(),
    parentId: z.string().min(1).nullable(),
    references: z.array(z.string().min(1)),
    enumValues: z.array(ApiEnumValueSchema),
  })
  .strict();

export type ApiSymbol = z.infer<typeof ApiSymbolSchema>;

export const ApiWarningSchema = z
  .object({
    code: z.enum([
      "API_INPUT_MISSING",
      "API_SYMBOLS_MISSING",
      "API_DOCUMENTATION_SPARSE",
      "DOXYGEN_OUTPUT_MISSING",
      "DOXYGEN_PROCESS_FAILED",
      "DOXYGEN_TARGET_FAILED",
      "DOXYGEN_XML_INVALID",
      "DOXYGEN_XML_MISSING",
    ]),
    message: z.string().min(1),
  })
  .strict();

export type ApiWarning = z.infer<typeof ApiWarningSchema>;

export const ApiReferenceSchema = z
  .object({
    targetKind: z.enum(["package", "module"]),
    targetId: z.string().min(1),
    displayName: z.string().min(1),
    moduleId: z.string().min(1),
    packageSlug: z.string().min(1).nullable(),
    moduleSha: z.string().regex(/^[a-f0-9]{40}$/u),
    revisionLabel: z.string().min(1),
    inputPaths: z.array(z.string().regex(snapshotPath)),
    status: z.enum(["complete", "sparse", "empty", "failed"]),
    warnings: z.array(ApiWarningSchema),
    symbols: z.array(ApiSymbolSchema),
    symbolCount: z.number().int().nonnegative(),
    documentedSymbolCount: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((reference, context) => {
    if (reference.symbolCount !== reference.symbols.length) {
      context.addIssue({
        code: "custom",
        path: ["symbolCount"],
        message: "symbolCount must equal symbols.length.",
      });
    }
    if (reference.documentedSymbolCount > reference.symbolCount) {
      context.addIssue({
        code: "custom",
        path: ["documentedSymbolCount"],
        message: "documentedSymbolCount cannot exceed symbolCount.",
      });
    }
    if (reference.targetKind === "package" && reference.packageSlug === null) {
      context.addIssue({
        code: "custom",
        path: ["packageSlug"],
        message: "Package references require packageSlug.",
      });
    }
    if (reference.targetKind === "module" && reference.packageSlug !== null) {
      context.addIssue({
        code: "custom",
        path: ["packageSlug"],
        message: "Module references cannot have packageSlug.",
      });
    }
  });

export type ApiReference = z.infer<typeof ApiReferenceSchema>;

export const ApiCatalogSchema = z
  .object({
    formatVersion: z.literal(1),
    doxygenVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
    references: z.array(ApiReferenceSchema),
  })
  .strict();

export type ApiCatalog = z.infer<typeof ApiCatalogSchema>;
