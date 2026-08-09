import type { StarlightPageProps } from "@astrojs/starlight/props";

import type { PackageCatalog } from "../catalog/schema";
import { sitePath } from "../paths/site-config";

export type PortalSidebar = NonNullable<StarlightPageProps["sidebar"]>;

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function buildPortalSidebar(catalog: PackageCatalog): PortalSidebar {
  const packagesByModule = new Map<string, typeof catalog.packages>();
  for (const entry of catalog.packages) {
    const entries = packagesByModule.get(entry.moduleId) ?? [];
    packagesByModule.set(entry.moduleId, [...entries, entry]);
  }
  return [
    {
      label: "Browse",
      items: [
        { label: "Package catalog", link: sitePath("/") },
        { label: "Search", link: sitePath("/", "search") },
        { label: "Quality", link: sitePath("/", "quality") },
      ],
    },
    ...catalog.modules.map((module) => ({
      label: module.displayName,
      collapsed: true,
      items: [
        { label: "Module overview", link: sitePath("/", "modules", module.slug) },
        ...(packagesByModule.get(module.id) ?? [])
          .toSorted((left, right) => compareStrings(left.pkgname, right.pkgname))
          .map((entry) => ({
            label: entry.pkgname,
            link: sitePath("/", "packages", entry.slug),
          })),
      ],
    })),
  ];
}
