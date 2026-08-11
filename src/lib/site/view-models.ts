import type {
  ApiAccess,
  ApiReference,
  ApiSymbol,
  ApiSymbolKind,
  ApiWarning,
} from "../doxygen/schema";
import type { ModuleSnapshot } from "../sources/manifest";

export type QualityTone = "success" | "warning" | "danger" | "neutral";

export function apiStatusLabel(status: ApiReference["status"]): string {
  switch (status) {
    case "complete":
      return "文档完整";
    case "sparse":
      return "文档稀疏";
    case "empty":
      return "无公开 API";
    case "failed":
      return "提取失败";
  }
}

export function apiSymbolKindLabel(kind: ApiSymbolKind): string {
  switch (kind) {
    case "namespace":
      return "命名空间";
    case "class":
      return "类";
    case "struct":
      return "结构体";
    case "union":
      return "联合体";
    case "function":
      return "函数";
    case "enum":
      return "枚举";
    case "typedef":
      return "类型定义";
    case "variable":
      return "变量";
    case "define":
      return "宏定义";
    case "file":
      return "文件";
  }
}

export function apiAccessLabel(access: ApiAccess): string {
  switch (access) {
    case "public":
      return "公开";
    case "protected":
      return "受保护";
    case "private":
      return "私有";
  }
}

export function apiVirtualLabel(virtual: NonNullable<ApiSymbol["member"]>["virtual"]): string {
  switch (virtual) {
    case "none":
      return "";
    case "virtual":
      return "虚函数";
    case "pure":
      return "纯虚函数";
  }
}

export function snapshotWarningMessage(warning: ModuleSnapshot["warnings"][number]): string {
  switch (warning.code) {
    case "LICENSE_MISSING":
      return "同步模块中未发现上游许可证文件。";
    case "PACKAGE_MANIFEST_MISSING":
      return "同步模块中未发现 cpkg.toml 软件包清单。";
    case "README_MISSING":
      return "同步模块中未发现上游 README。";
  }
}

export function apiWarningMessage(reference: ApiReference, warning: ApiWarning): string {
  switch (warning.code) {
    case "API_INPUT_MISSING":
      return `${reference.displayName} 没有归属的已同步 C/C++ 输入文件。`;
    case "API_SYMBOLS_MISSING":
      return `${reference.displayName} 未发现公开 API 符号。`;
    case "API_DOCUMENTATION_SPARSE":
      return `${reference.symbolCount - reference.documentedSymbolCount} / ${reference.symbolCount} 个公开 API 符号没有说明。`;
    case "DOXYGEN_OUTPUT_MISSING":
    case "DOXYGEN_PROCESS_FAILED":
    case "DOXYGEN_TARGET_FAILED":
    case "DOXYGEN_XML_INVALID":
    case "DOXYGEN_XML_MISSING":
      return `${warning.code}：${reference.displayName} 的 API 提取失败，其他参考内容仍可使用。`;
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
