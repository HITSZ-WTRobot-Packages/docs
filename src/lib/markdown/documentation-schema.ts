import { z } from "zod";

const UpstreamDocumentationSourceSchema = z
  .object({
    kind: z.literal("upstream"),
    snapshotPath: z.string().min(1),
    upstreamUrl: z.url({ protocol: /^https?$/ }),
  })
  .strict();

const GeneratedDocumentationSourceSchema = z
  .object({
    kind: z.literal("generated"),
    reason: z.enum(["MODULE_README_MISSING", "PACKAGE_README_MISSING"]),
    upstreamUrl: z.url({ protocol: /^https?$/ }),
  })
  .strict();

export const DocumentationSourceSchema = z.discriminatedUnion("kind", [
  UpstreamDocumentationSourceSchema,
  GeneratedDocumentationSourceSchema,
]);

export const DocumentationPageSchema = z
  .object({
    kind: z.enum(["module", "package", "supplemental"]),
    title: z.string().min(1),
    route: z.string().startsWith("/"),
    moduleId: z.string().min(1),
    moduleSlug: z.string().min(1),
    packageSlug: z.string().min(1).nullable(),
    html: z.string(),
    source: DocumentationSourceSchema,
  })
  .strict();

export type DocumentationPage = z.infer<typeof DocumentationPageSchema>;

export const DocumentationResourceSchema = z
  .object({
    moduleId: z.string().min(1),
    moduleSlug: z.string().min(1),
    moduleShortSha: z.string().regex(/^[a-f0-9]{12}$/u),
    snapshotPath: z.string().min(1),
    route: z.string().startsWith("/"),
    mediaType: z.string().min(1),
  })
  .strict();

export const DocumentationBundleSchema = z
  .object({
    formatVersion: z.literal(1),
    pages: z.array(DocumentationPageSchema),
    resources: z.array(DocumentationResourceSchema),
  })
  .strict();

export type DocumentationBundle = z.infer<typeof DocumentationBundleSchema>;
