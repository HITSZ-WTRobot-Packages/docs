import type { ApiReference, ApiSymbol } from "../doxygen/schema";

export type QualityTone = "success" | "warning" | "danger" | "neutral";

export function apiStatusLabel(status: ApiReference["status"]): string {
  switch (status) {
    case "complete":
      return "Documented";
    case "sparse":
      return "Sparse docs";
    case "empty":
      return "No public API";
    case "failed":
      return "Extraction failed";
  }
}

export function apiStatusTone(status: ApiReference["status"]): QualityTone {
  switch (status) {
    case "complete":
      return "success";
    case "sparse":
    case "empty":
      return "warning";
    case "failed":
      return "danger";
  }
}

export function symbolNamespace(symbol: ApiSymbol): string {
  if (symbol.kind === "namespace") {
    return symbol.qualifiedName;
  }
  const separator = symbol.qualifiedName.lastIndexOf("::");
  return separator > 0 ? symbol.qualifiedName.slice(0, separator) : "(global)";
}

export function referenceNamespaces(reference: ApiReference): string[] {
  return [...new Set(reference.symbols.map(symbolNamespace))].sort();
}
