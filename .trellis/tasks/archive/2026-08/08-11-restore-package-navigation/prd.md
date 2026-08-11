# 恢复驱动包三级导航

## Goal

在现有框架型全站导航中恢复 module 下的软件包列表，使驱动使用者可以通过三级侧栏直接进入 package 文档，同时保留模块 README 入口。

## Requirements

- 保留顶层“驱动包”页面组。
- “驱动包”下按 module 建立可折叠分组。
- 每个 module 分组的第一个条目为 `README`，链接现有模块主文档。
- `README` 后按 `pkgname` 确定性排序列出该 module 的全部 package，并链接现有 package 主页面。
- module 分组默认折叠；访问 module README 或 package 页面时由 Starlight 自动展开当前分组。
- 保持快速开始、使用指南、开发指南和参考组不变。
- 继续使用 Starlight 原生 sidebar 数据结构，不复制或覆盖框架 Sidebar 组件。
- 更新集成、Playwright、README、`AGENTS.md` 和前端规范中的导航契约。

## Acceptance Criteria

- [x] 导航层级为“驱动包 → module → README/package”。
- [x] 六个 module 均具有 README 入口，42 个 package 均在所属 module 下出现一次。
- [x] package 路由使用站点相对链接并支持所有 `BASE_PATH`。
- [x] package 页面自动展开所属 module 并高亮当前 package。
- [x] 桌面和移动端无文本重叠、横向溢出或严重/关键 axe 问题。

## Definition of Done

- 格式、lint、typecheck、单元、集成、产物、链接和浏览器检查通过。
- 项目文档和前端规范与三级导航一致。

## Technical Approach

在共享 `buildPortalSidebar` 中按 module 建立 package 索引。每个 catalog module 输出一个 Starlight group，items 由 module README 链接和按 `pkgname` 排序的 package 链接组成。Starlight 原生 group 标题不支持同时作为 link，因此使用明确的 `README` 子项保留模块主文档入口。

## Out of Scope

- 自定义或复制 Starlight Sidebar 组件。
- 修改 module、package 或 API 公开路由。
- 修改 catalog、同步快照或文档 Schema。
