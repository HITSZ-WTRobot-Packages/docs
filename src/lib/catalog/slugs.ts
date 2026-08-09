import { CatalogDiagnostic } from "./diagnostic";

function slugSegment(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function catalogSlug(value: string): string {
  const slug = value.split("::").map(slugSegment).filter(Boolean).join("--");
  if (!slug) {
    throw new CatalogDiagnostic("CATALOG_SLUG_INVALID", `Cannot derive a slug from: ${value}`);
  }
  return slug;
}
