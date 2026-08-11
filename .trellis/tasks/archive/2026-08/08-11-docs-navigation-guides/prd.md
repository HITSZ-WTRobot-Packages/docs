# 重组文档导航并预留指南页面

## Goal

将门户导航调整为面向驱动使用者的框架型信息架构，在保留现有驱动库 README、软件包和 API 路由的同时，为快速开始、使用指南和未来开发指南建立稳定的 Markdown 页面入口。

## Requirements

- 左侧导航依次提供“快速开始”“使用指南”“驱动包”“开发指南”“参考”页面组。
- “快速开始”包含概览、安装和首个工程；“使用指南”和“开发指南”各包含一个概览入口。
- 新指南页面使用仓库自有的 Starlight Markdown 内容，只保留必要的简体中文 frontmatter，正文留空并设置 `pagefind: false`。
- “驱动包”根据 catalog 动态列出模块标题，标题直接链接现有 `/modules/<module>/` 页面，不显示“模块概览”子项，也不展开软件包。
- “驱动包”仅是导航名称；站内其他位置继续使用现有“模块”术语。
- “参考”包含软件包目录、搜索和文档质量入口。
- Markdown 页面与自定义 Astro 门户路由使用同一导航构造器，并保持 `BASE_PATH` 安全。
- 保留现有模块、软件包、API、补充文档、搜索和质量路由及行为。
- 更新 README、`AGENTS.md` 和适用的前端 Trellis 规范，记录新的内容与导航约定。

## Acceptance Criteria

- [ ] 生成 `/getting-started/`、`/getting-started/installation/`、`/getting-started/first-project/`、`/user-guide/` 和 `/development-guide/`。
- [ ] 新页面正文为空、使用简体中文标题且不进入 Pagefind。
- [ ] 所有页面呈现相同顺序的导航组。
- [ ] “驱动包”组只含模块级链接，且没有“模块概览”或软件包链接。
- [ ] 根路径和嵌套 `BASE_PATH` 构建、产物、链接、浏览器和无障碍检查通过。

## Definition of Done

- 相关集成、产物和 Playwright 测试已更新。
- 格式、lint、typecheck、测试及静态站点质量门禁通过。
- README、项目指令和前端规范与实现一致。

## Technical Approach

由一个共享导航构造器组合静态指南入口和 catalog 模块入口。Astro 配置在构建期离线加载已提交 catalog，将同一导航传给 Starlight 内容页；自定义 `PortalPage` 路由继续调用相同构造器。指南使用 `src/content/docs/` 下的 Markdown 占位文件，不扩展同步或文档 bundle Schema。

## Decision (ADR-lite)

**Context**: 当前导航按模块展开全部软件包，缺少站点级学习入口；上游快照只保证 README，并不具备每个驱动库多页教程的契约。

**Decision**: 公共指南由本站 Markdown 内容集合维护；驱动库仍以模块根 README 为唯一主文档，并在一个扁平“驱动包”导航组中展示。

**Consequences**: 导航更接近成熟框架文档且可逐步补充正文，不引入上游格式迁移；软件包详情改由首页目录和模块页面进入，而不再占用全局导航。

## Out of Scope

- 编写 cpkg 安装、工程接入、构建或验证教程正文。
- 将单个驱动库拆分成多篇文档。
- 修改上游仓库约定、同步快照、catalog 或 API Schema。
- 全站替换“模块”术语。

## Technical Notes

- 指南路由使用英文稳定路径，界面标签使用简体中文。
- Starlight sidebar 链接保持站点相对形式，由框架应用 Astro base。
- 空白占位页必须显式排除 Pagefind，避免无内容搜索结果。
