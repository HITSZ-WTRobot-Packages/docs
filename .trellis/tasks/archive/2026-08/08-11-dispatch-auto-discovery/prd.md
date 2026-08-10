# 基于 Dispatch 的仓库自动发现

## Goal

让 HITSZ-WTRobot-Packages 下的新驱动仓库在初始化后，通过引用 docs 仓库提供的统一 CI 触发文档同步。仓库不再硬编码在 docs 源码中；首次成功同步时才原子地加入持久化索引。

## Requirements

- 删除静态 `MODULES` 仓库列表，生产同步的模块集合从已提交的 `sources/manifest.json` 还原。
- 保留当前六个已提交模块并视为已发现索引；本次不加入或同步 `VelocityProfile`。
- 新增可跨仓库引用的 `workflow_call` 工作流。它从调用方 GitHub 上下文读取仓库完整名和默认分支，不允许调用方自由指定模块名、URL、同步模式或提交行为。
- 调用方使用组织级 `DOCS_SYNC_TOKEN` 向 docs 发送 `sync-snapshots` repository dispatch；接收端固定执行单仓库、非 dry-run、成功后提交。
- 自动发现只接受 `HITSZ-WTRobot-Packages/<repository>`，由接收端构造 HTTPS clone URL；拒绝任意 URL、非法仓库名、额外载荷和不安全分支。
- 首次发现使用现有同步事务。候选快照、包/API 目录和完整跨模块图全部验证成功后才写入模块目录与 manifest；失败时不得留下索引或部分快照。
- 后续 `all`、`changed` 和 `module` 模式从 manifest 获取已发现模块。相同 dispatch 必须幂等。
- 同名模块映射到不同仓库时失败；同一仓库默认分支变化可在同步成功后更新。
- 保留 `VelocityProfile::SCurve` 的外部依赖兜底。未来 VelocityProfile 自动发现后，内部依赖解析优先级使它自动变为内部链接。
- 更新 README、自动化文档、AGENTS.md 和 Trellis backend 规范，使其描述自动发现与信任边界。

## Acceptance Criteria

- [x] 生产代码中没有静态驱动仓库集合。
- [x] 空 manifest 能通过首次 discovery 同步注册一个仓库。
- [x] 发现失败、dry-run 和无变化重跑均满足原子性/幂等性契约。
- [x] 当前六个模块、42 个包和现有页面继续离线生成，VelocityProfile 不出现在提交差异中。
- [x] reusable workflow 使用调用仓库身份构造受限 dispatch，并且调用方只需一个薄 push/manual workflow。
- [x] workflow、CLI、action request、同步器和真实快照测试覆盖新行为。
- [x] convention、format、lint、typecheck、unit、integration、generation、build、artifact、link、browser 和 accessibility 检查按变更面通过。

## Technical Approach

将 manifest 中每个 `ModuleSnapshot` 转换为 `ModuleConfig`，并允许同步请求携带一个经过边界验证的 discovery 配置。同步器把 discovery 候选与 manifest 模块合并后再选择单模块，沿用现有 candidate/manifest 原子提交。Action 事件解析对 workflow_dispatch 和 repository_dispatch 使用不同的严格 Zod schema；后者只接受源仓库标识和默认分支，并生成 CLI 参数数组。

## Decision

**Context**: 静态允许列表导致新增仓库需要修改 docs 代码，并直接造成 VelocityProfile 未进入构建。

**Decision**: `sources/manifest.json` 是唯一的持久化仓库索引，repository dispatch 是唯一的自动注册入口；代码不枚举组织仓库，也不保存另一份仓库配置。

**Consequences**: 新仓库只有在完整同步成功后才可见；仓库删除、转移、重命名和退役不自动处理。调用方 dispatch 成功只表示请求已受理，最终结果在 docs Actions 查看。

## Out of Scope

- 本次不触发 VelocityProfile 的首次发现。
- 不清空或重新同步当前六个快照。
- 不实现组织仓库定时扫描、GitHub API 枚举、自动退役、仓库重命名迁移、结果轮询或部署。

## Technical Notes

- `GITHUB_TOKEN` 仅限调用方仓库；跨仓库 dispatch 使用仅授权 docs 且只向指定调用仓库开放的组织级 fine-grained PAT。
- repository dispatch 的目标仍是现有 `sync-snapshots` 工作流，串行 concurrency 与完整离线门禁保持不变。
- 被引用的 reusable workflow 在调用方仓库中使用时必须固定到完整 docs 提交 SHA。
