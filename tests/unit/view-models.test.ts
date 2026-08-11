import { describe, expect, test } from "bun:test";

import type { ApiReference, ApiSymbolKind, ApiWarning } from "../../src/lib/doxygen/schema";
import type { ModuleSnapshot } from "../../src/lib/sources/manifest";
import {
  apiAccessLabel,
  apiStatusLabel,
  apiSymbolKindLabel,
  apiVirtualLabel,
  apiWarningMessage,
  snapshotWarningMessage,
} from "../../src/lib/site/view-models";

const reference: ApiReference = {
  targetKind: "package",
  targetId: "fixture",
  displayName: "Fixture::Demo",
  moduleId: "FixtureModule",
  packageSlug: "fixture--demo",
  sourceBranch: "main",
  inputPaths: [],
  status: "sparse",
  warnings: [],
  symbols: [],
  inheritanceRelations: [],
  symbolCount: 5,
  documentedSymbolCount: 2,
};

describe("Chinese portal view models", () => {
  test("translates API states and symbol kinds without changing stable values", () => {
    const statuses: ApiReference["status"][] = ["complete", "sparse", "empty", "failed"];
    expect(statuses.map(apiStatusLabel)).toEqual([
      "文档完整",
      "文档稀疏",
      "无公开 API",
      "提取失败",
    ]);

    const kinds: ApiSymbolKind[] = [
      "namespace",
      "class",
      "struct",
      "union",
      "function",
      "enum",
      "typedef",
      "variable",
      "define",
      "file",
    ];
    expect(kinds.map(apiSymbolKindLabel)).toEqual([
      "命名空间",
      "类",
      "结构体",
      "联合体",
      "函数",
      "枚举",
      "类型定义",
      "变量",
      "宏定义",
      "文件",
    ]);
    expect((["public", "protected", "private"] as const).map(apiAccessLabel)).toEqual([
      "公开",
      "受保护",
      "私有",
    ]);
    expect((["none", "virtual", "pure"] as const).map(apiVirtualLabel)).toEqual([
      "",
      "虚函数",
      "纯虚函数",
    ]);
  });

  test("translates every snapshot warning code", () => {
    const warnings: ModuleSnapshot["warnings"] = [
      { code: "LICENSE_MISSING", message: "upstream message" },
      { code: "PACKAGE_MANIFEST_MISSING", message: "upstream message" },
      { code: "README_MISSING", message: "upstream message" },
    ];
    expect(warnings.map(snapshotWarningMessage)).toEqual([
      "同步模块中未发现上游许可证文件。",
      "同步模块中未发现 cpkg.toml 软件包清单。",
      "同步模块中未发现上游 README。",
    ]);
  });

  test("translates API warnings from stable codes and reference counts", () => {
    const warnings: ApiWarning[] = [
      { code: "API_INPUT_MISSING", message: "source message" },
      { code: "API_SYMBOLS_MISSING", message: "source message" },
      { code: "API_DOCUMENTATION_SPARSE", message: "source message" },
      { code: "DOXYGEN_OUTPUT_MISSING", message: "source message" },
      { code: "DOXYGEN_PROCESS_FAILED", message: "source message" },
      { code: "DOXYGEN_TARGET_FAILED", message: "source message" },
      { code: "DOXYGEN_XML_INVALID", message: "source message" },
      { code: "DOXYGEN_XML_MISSING", message: "source message" },
    ];
    expect(warnings.map((warning) => apiWarningMessage(reference, warning))).toEqual([
      "Fixture::Demo 没有归属的已同步 C/C++ 输入文件。",
      "Fixture::Demo 未发现公开 API 符号。",
      "3 / 5 个公开 API 符号没有说明。",
      "DOXYGEN_OUTPUT_MISSING：Fixture::Demo 的 API 提取失败，其他参考内容仍可使用。",
      "DOXYGEN_PROCESS_FAILED：Fixture::Demo 的 API 提取失败，其他参考内容仍可使用。",
      "DOXYGEN_TARGET_FAILED：Fixture::Demo 的 API 提取失败，其他参考内容仍可使用。",
      "DOXYGEN_XML_INVALID：Fixture::Demo 的 API 提取失败，其他参考内容仍可使用。",
      "DOXYGEN_XML_MISSING：Fixture::Demo 的 API 提取失败，其他参考内容仍可使用。",
    ]);
  });
});
