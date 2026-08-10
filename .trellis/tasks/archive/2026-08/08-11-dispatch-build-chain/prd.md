# 修正跨仓库同步与构建触发链

## Goal

使驱动仓库调用一个只在调用方运行的 docs reusable workflow，并跟随 docs 默认分支上的工作流更新；docs
收到 dispatch 后只同步对应模块，仅在 `sources/` 有变化时提交，再由仓库外部既有构建服务观察该提交并重新构建。

## What I Already Know

- `request-docs-sync.yml` 只有 `workflow_call`，不会在 docs 中独立触发；被调用时的 `github` context
  属于调用仓库。
- 当前调用文档固定到完整提交 SHA，不满足调用方自动跟随 docs workflow 更新。
- 当前 repository dispatch 已固定映射为单模块、非 dry-run、成功后提交；同步 workflow 已检查
  `sources/` diff，无变化时不提交。
- 当前同步提交使用 docs 的 `GITHUB_TOKEN` 推送。GitHub 不会为该 push 创建后续 workflow run，也不会触发
  Pages build。
- 当前 `Validation` 仅支持 `workflow_dispatch`；用户明确要求继续保持纯手动且不启用本地 commit/push build
  workflow。
- 本仓库明确把正式 Pages 部署作为独立、需管理员批准的任务。

## Assumptions

- `DOCS_SYNC_TOKEN` 继续是仅授权 docs `Contents: write` 的组织级 fine-grained PAT，并同时开放给 docs
  仓库与获准调用的驱动仓库。
- “跟随本仓库更新”表示调用方使用 `@main`，接受该分支相对于完整 SHA 的供应链风险。

## Requirements

- dispatch 请求 workflow 保持只有 `workflow_call`，不增加 docs 内的 push、手动或 repository dispatch
  触发器。
- 驱动仓库通过 `HITSZ-WTRobot-Packages/docs/.github/workflows/request-docs-sync.yml@main`
  引用，并继续从调用方 context 推导仓库和默认分支。
- repository dispatch 继续只同步载荷指定的一个已发现/待发现模块。
- 同步后只有 `sources/` 真正变化且完整预提交门禁通过时才创建、推送 snapshot commit。
- snapshot commit 必须使用能触发后续 Actions 的 `DOCS_SYNC_TOKEN` 推送，而不是 docs `GITHUB_TOKEN`。
- 无变化同步不得产生 commit，也不得启动重新构建。
- 本仓库不新增或启用 commit/push build workflow；`validation.yml` 必须保持只有
  `workflow_dispatch`。
- 重新构建由仓库外部既有服务观察默认分支 snapshot commit 后完成，不属于本仓库 workflow 的职责。
- 更新 workflow 契约测试、自动化文档、README、AGENTS.md 和 Trellis backend 规范。

## Acceptance Criteria

- [x] workflow 测试证明 request workflow 的唯一触发器仍是 `workflow_call`。
- [x] 调用示例使用 `@main`，不存在 `<DOCS_WORKFLOW_COMMIT_SHA>` 或跨仓库完整 SHA 要求。
- [x] repository dispatch 仍解析为一个 module sync，并只在 diff 非空时提交。
- [x] sync workflow 使用 `DOCS_SYNC_TOKEN` 认证 push，且只暂存 `sources/`。
- [x] `GITHUB_TOKEN` 不再承担需要派生平台事件的 snapshot push。
- [x] Validation 仍只有手动触发，sync workflow 仍没有 push 触发器，且不新增本地 build workflow。
- [x] 无差异路径没有 commit，因此外部构建服务没有新的默认分支 commit 可观察。
- [x] workflow 单元测试、format、lint、typecheck、unit/integration 和 actionlint（可用时）通过。

## Definition of Done

- 触发链在代码、测试、文档和项目规范中一致。
- 凭据最小权限和 `@main` 滚动更新风险有明确文档。
- 外部构建与仓库内同步保持分离，Validation 保持未启用状态。

## Research References

- [`research/github-actions-trigger-chain.md`](research/github-actions-trigger-chain.md) — GitHub
  官方 reusable workflow ref、caller context 和 `GITHUB_TOKEN` 事件抑制规则。

## Technical Approach

保持 `request-docs-sync.yml` 为 callable-only，调用示例改用 `@main`。同步 workflow checkout 时显式使用
`DOCS_SYNC_TOKEN`，使其经过完整门禁后产生的 `sources/` commit 成为可由外部构建服务观察的真实默认分支
push。Validation 保持纯手动，不新增本地 build workflow。

## Decision

**Context**: 当前 SHA 固定不跟随 reusable workflow 更新，而 `GITHUB_TOKEN` 提交不会触发后续 build。

**Decision**: 调用方显式采用 `@main` 滚动引用；使用限定范围的 PAT 推送 snapshot commit；外部既有服务由该
commit 触发重新构建，本仓库不新增 build trigger。

**Consequences**: 中央 workflow 更新自动传播，但必须保持兼容；PAT 成为产生可观察默认分支 push 的受控凭据；
仓库内无法报告外部构建最终结果。

## Out of Scope

- 不改变自动发现、manifest 索引、依赖解析或快照格式。
- 不让同步 workflow 响应 push，避免递归同步。
- 不新增本地 commit/push build、Pages 部署、环境审批或生产域名发布。
