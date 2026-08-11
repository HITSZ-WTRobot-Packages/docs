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

export const ApiAccessSchema = z.enum(["public", "protected", "private"]);

export type ApiAccess = z.infer<typeof ApiAccessSchema>;

export const ApiMemberMetadataSchema = z
  .object({
    access: ApiAccessSchema.nullable(),
    static: z.boolean(),
    virtual: z.enum(["none", "virtual", "pure"]),
    const: z.boolean(),
  })
  .strict();

export type ApiMemberMetadata = z.infer<typeof ApiMemberMetadataSchema>;

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
    member: ApiMemberMetadataSchema.nullable(),
    references: z.array(z.string().min(1)),
    enumValues: z.array(ApiEnumValueSchema),
  })
  .strict();

export type ApiSymbol = z.infer<typeof ApiSymbolSchema>;

export const ApiInheritanceRelationSchema = z
  .object({
    kind: z.literal("inherits"),
    derivedId: z.string().min(1),
    baseId: z.string().min(1).nullable(),
    baseQualifiedName: z.string().min(1),
    access: ApiAccessSchema,
    virtual: z.boolean(),
  })
  .strict();

export type ApiInheritanceRelation = z.infer<typeof ApiInheritanceRelationSchema>;

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
    sourceBranch: z.string().min(1),
    inputPaths: z.array(z.string().regex(snapshotPath)),
    status: z.enum(["complete", "sparse", "empty", "failed"]),
    warnings: z.array(ApiWarningSchema),
    symbols: z.array(ApiSymbolSchema),
    inheritanceRelations: z.array(ApiInheritanceRelationSchema),
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
    const symbolsById = new Map(reference.symbols.map((symbol) => [symbol.id, symbol]));
    if (symbolsById.size !== reference.symbols.length) {
      context.addIssue({
        code: "custom",
        path: ["symbols"],
        message: "Symbol IDs must be unique within an API reference.",
      });
    }
    for (const [index, symbol] of reference.symbols.entries()) {
      if (
        symbol.parentId !== null &&
        (symbol.parentId === symbol.id || !symbolsById.has(symbol.parentId))
      ) {
        context.addIssue({
          code: "custom",
          path: ["symbols", index, "parentId"],
          message: "parentId must identify another symbol in the API reference.",
        });
      }
    }
    for (const [index, relation] of reference.inheritanceRelations.entries()) {
      const derived = symbolsById.get(relation.derivedId);
      const base = relation.baseId === null ? undefined : symbolsById.get(relation.baseId);
      if (!derived || (derived.kind !== "class" && derived.kind !== "struct")) {
        context.addIssue({
          code: "custom",
          path: ["inheritanceRelations", index, "derivedId"],
          message: "derivedId must identify a class or struct in the API reference.",
        });
      }
      if (
        relation.baseId !== null &&
        (!base ||
          relation.baseId === relation.derivedId ||
          (base.kind !== "class" && base.kind !== "struct"))
      ) {
        context.addIssue({
          code: "custom",
          path: ["inheritanceRelations", index, "baseId"],
          message: "baseId must identify a class or struct in the API reference when present.",
        });
      }
      if (base && base.qualifiedName !== relation.baseQualifiedName) {
        context.addIssue({
          code: "custom",
          path: ["inheritanceRelations", index, "baseQualifiedName"],
          message: "baseQualifiedName must match the identified base symbol.",
        });
      }
    }
  });

export type ApiReference = z.infer<typeof ApiReferenceSchema>;

export const ApiCatalogSchema = z
  .object({
    formatVersion: z.literal(3),
    doxygenVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
    references: z.array(ApiReferenceSchema),
  })
  .strict();

export type ApiCatalog = z.infer<typeof ApiCatalogSchema>;
