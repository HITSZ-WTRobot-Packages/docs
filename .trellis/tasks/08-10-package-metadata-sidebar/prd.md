# 软件包文档前置信息右侧栏

## Goal

将普通软件包详情页调整为宽屏三栏布局：左侧保留 Starlight 导航，中间 `main`
保留面包屑、安装提示和文档正文，右侧使用 Starlight 原生 `PageSidebar` 展示补充的
软件包信息。

## Requirements

- 仅处理 `/packages/<package>/`；`/packages/<package>/api/` 和其他页面保持现状。
- 将状态和 API 入口、`PackageMetadata`、依赖列表及依赖图从 `main` 移入 Starlight
  原生右侧栏。
- 面包屑和隐藏的 `PagefindMetadata` 保留在 `main`，分别维持目录层级导航和搜索索引
  元数据归属。
- 将 `cpkg add <package>` 安装提示及复制按钮从元数据组件拆出，放在面包屑之后、
  `DocumentationContent` 正文之前；固定版本源码链接继续留在右栏。
- 宽屏沿用 Starlight 的 `72rem` 分栏断点、右栏宽度、固定定位和独立纵向滚动。
- 宽屏右栏显示“软件包信息”标题；元数据、依赖列表、图谱工具栏和画布使用适合窄栏的
  紧凑布局。
- 低于 `72rem` 时，同一个信息实例出现在页面开头，以原生 `<details>` 默认折叠；
  键盘和指针均可展开，展开后可继续操作内层依赖图。
- 安装命令、复制按钮、模块链接和固定版本源码链接保持可用；长标识符不得裁切或造成页面横向滚动。
- 打印时软件包信息静态展开并可见，避免从原有打印内容中丢失。
- 非软件包详情路由继续使用 Starlight 默认 `PageSidebar` 行为。

## Acceptance Criteria

- [x] 桌面端软件包页按左导航、文档 `main`、右侧软件包信息栏的顺序横向排列。
- [x] 操作、元数据、依赖列表和依赖图均不再位于 `main`，但仍可见、可用；面包屑留在
  文档正文上方。
- [x] `cpkg add` 安装提示位于 `main` 的面包屑之后、文档正文之前，且不在右侧栏重复出现。
- [x] 移动端软件包信息位于 `main` 前，初始关闭且可通过键盘展开。
- [x] 软件包 API 页不出现软件包信息右栏，API 状态仍位于正文。
- [x] 桌面、移动和打印布局无裁切、重叠或意外横向滚动。
- [x] 格式、lint、类型检查、测试、构建、产物、链接、浏览器和 axe 检查通过。

## Definition of Done

- 更新共享页面接口、Starlight 组件覆盖、软件包详情路由、样式和 E2E 回归测试。
- 运行与改动表面相称的完整质量检查。
- 评估是否需要更新项目规范并按 Trellis 流程完成收尾。

## Technical Approach

为 `PortalPage` 增加默认关闭的可选右栏开关，通过 Starlight 的
`tableOfContents` 路由状态激活原生 `TwoColumnContent` 右栏。注册自定义
`PageSidebar`，精确识别 `packages/<slug>`，从缓存的门户数据中解析软件包、模块和
API 状态，并组合操作、`PackageMetadata`、`DependencyList` 和 `DependencyGraph`；
面包屑和拆出的安装提示仍由普通软件包页渲染。其他路由回退到 Starlight 默认组件。
响应式显示由同一个 `<details>` 实例和媒体查询完成，不复制信息 DOM 或客户端脚本。

## Decision (ADR-lite)

**Context**: 页面需要真实的左导航、中央 `main`、右侧 `aside` 三栏结构，同时保留
Starlight 的响应式和固定侧栏行为。

**Decision**: 使用 Starlight 原生 `PageSidebar` 扩展点，而不是在 `main` 内再嵌套一个
两栏容器。

**Consequences**: 页面结构与框架一致，但需要用自定义 `PageSidebar` 根据当前路由解析
软件包信息，并显式处理窄栏布局、移动端折叠和打印显示。

## Out of Scope

- 模块页、补充文档、目录页、质量页和搜索页的布局调整。
- `/packages/<package>/api/` 的 API 提取状态迁移。
- 折叠状态跨页面或跨会话持久化。
- 自定义右栏宽度或替换 Starlight 的布局断点。

## Technical Notes

- 相关规范：`.trellis/spec/frontend/component-guidelines.md`、
  `.trellis/spec/frontend/quality-guidelines.md`、
  `.trellis/spec/frontend/directory-structure.md`。
- 现有 `loadPortalData()` 使用进程内 Promise 缓存，可由自定义侧栏复用。
- `PackageMetadata` 和 `DependencyGraph` 均包含客户端行为，必须保持单实例渲染。
