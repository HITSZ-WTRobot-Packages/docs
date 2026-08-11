import type { StarlightPageProps } from "@astrojs/starlight/props";

import type { PackageCatalog } from "../catalog/schema";
import { sitePath } from "../paths/site-config";

export type PortalSidebar = NonNullable<StarlightPageProps["sidebar"]>;

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function buildPortalSidebar(catalog: PackageCatalog): PortalSidebar {
  return [
    {
      label: "快速开始",
      items: [
        { label: "概览", link: sitePath("/", "getting-started") },
        { label: "安装", link: sitePath("/", "getting-started", "installation") },
        { label: "首个工程", link: sitePath("/", "getting-started", "first-project") },
      ],
    },
    {
      label: "使用指南",
      collapsed: true,
      items: [{ label: "概览", link: sitePath("/", "user-guide") }],
    },
    {
      label: "驱动包",
      items: catalog.modules
        .toSorted((left, right) => compareStrings(left.displayName, right.displayName))
        .map((module) => ({
          label: module.displayName,
          link: sitePath("/", "modules", module.slug),
        })),
    },
    {
      label: "开发指南",
      collapsed: true,
      items: [{ label: "概览", link: sitePath("/", "development-guide") }],
    },
    {
      label: "参考",
      items: [
        { label: "软件包目录", link: sitePath("/") },
        { label: "搜索", link: sitePath("/", "search") },
        { label: "文档质量", link: sitePath("/", "quality") },
      ],
    },
  ];
}
