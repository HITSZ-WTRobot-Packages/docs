# 精简同步工作流并稳定 Doxygen 产物

## Goal

缩短 dispatch 快照同步耗时：移除同步工作流中的完整离线、站点、链接和浏览器验证，最大化复用 Bun 与 Doxygen 缓存；同时消除 API catalog 因上游提交 SHA 单独变化产生的大面积差异。

## Requirements

- 保留 `workflow_dispatch` 的 all/changed/module、dry-run、commit 输入及现有 `repository_dispatch` 契约。
- 同步工作流只负责检出、准备带缓存的工具链、执行同步 CLI 和按请求提交 `sources/`。
- 删除同步后的 check/generate/build/artifact/link/Playwright 验证、Chromium 安装、独立变更检测和冗余报告步骤。
- Bun 包缓存使用固定 SHA 的 actions/cache v4.2.0，缓存 `~/.bun/install/cache`，安装保持 frozen 并优先离线。
- Doxygen 按 OS、架构、锁定版本和安装 Action SHA 缓存可执行文件，仅在未命中时运行安装 Action。
- API catalog 升级为 v2，以 manifest 默认分支作为稳定源码引用；移除逐 reference 的 module SHA 和 SHA 型 revision label。
- API 源码 URL 使用 `blob/<branch>`；package catalog、manifest 和其他快照 URL 继续固定到提交 SHA。
- 一次性迁移全部已提交 API catalog，并更新 manifest 中的 artifact 校验元数据。
- 独立手动 Validation 继续承担完整发布验证；同步 CLI 内部的 schema、版本、校验和、模块图和原子性检查保持不变。
- 同步更新自动化文档、后端质量规范和 AGENTS.md 工程契约。

## Acceptance Criteria

- 同步 workflow 不包含 check、generate、build、artifact/link、Playwright 或 Chromium 步骤。
- 无变化且要求 commit 的同步通过 `git diff --cached --quiet` 安静退出，不创建提交。
- Bun 和 Doxygen 缓存键覆盖所有会影响缓存有效性的版本输入，所有外部 Action 固定为 40 位 SHA。
- 相同 branch、包版本、源码与 API 输入在仅 module SHA 不同时，序列化 API catalog 字节一致。
- API 源码链接指向配置的默认分支；branch 不匹配的 catalog 被拒绝。
- 全部 committed API artifacts 使用 formatVersion 2，manifest 中的 bytes、sha256 和 totalBytes 与文件一致。
- workflow contract tests、Doxygen/synchronizer tests、typecheck、check、generate、build、artifact/link checks 通过；actionlint 可用时通过。

## Technical Approach

- 在共享 setup composite Action 内显式 restore/install/save Bun cache。
- 在 sync workflow 内显式 restore/install/copy/save Doxygen cache，缓存目录加入 GITHUB_PATH。
- 用 `sourceBranch` 替换 API reference 的 `moduleSha` 与 `revisionLabel`；Doxygen package project number 使用包版本，module target 使用 branch。
- 增加 branch-based upstream URL helper，保留现有 SHA-pinned helper 给其他消费者。
- 通过结构化迁移重写当前 API JSON 并重新计算 manifest artifact 元数据；不修改同步的上游内容选择规则。

## Out of Scope

- 不修改 reusable dispatch 调用方载荷和 `@main` 引用。
- 不增加 push、PR、schedule 或部署工作流。
- 不缓存临时上游 Git clone 或 `node_modules`。
- 不移除同步 CLI 自身的正确性校验。

## Decision (ADR-lite)

API 源码链接接受跟随模块默认分支移动，以换取稳定的大型 API 产物。精确上游 revision 仍由 manifest 和 package catalog 保存。格式迁移在本次变更中一次完成，避免未来逐模块出现迁移噪声。
