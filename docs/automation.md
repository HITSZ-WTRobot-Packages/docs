# 自动化

本仓库将允许访问网络的快照同步、跨仓库请求和常规离线验证分离。这些工作流都不会部署站点或启用 GitHub
Pages。

## 验证工作流

`.github/workflows/validation.yml` 只能通过 `workflow_dispatch` 手动运行。操作者必须在 GitHub
Actions 中选择要验证的 ref；推送到 `main`、拉取请求和快照机器人提交都不会自动启动它。工作流只有
`contents: read` 权限，检出时不保留凭据，并且从不调用同步命令或访问上游模块仓库。

离线质量作业执行冻结依赖安装、约定检查、格式检查、lint、Astro 类型检查、单元/集成测试，以及已提交的软件包目录、README 和 API 目录验证。它不安装或运行 Doxygen。站点矩阵分别使用不同的示例源站构建
`/`、`/docs/` 和 `/products/wtr/docs/`。每个变体都会验证 canonical
URL、robots、sitemap、Pagefind、必需资源、重复 base path、递归 clean
URL、片段和 CSS 引用。根路径和产品路径变体还会运行桌面/移动 Playwright 与 axe 检查。`PLAYWRIGHT_REUSE_ARTIFACT=1`
使这些浏览器作业预览已经检查过的 `dist/`，而不是用第二次构建替换它。

## 快照同步

`.github/workflows/sync-snapshots.yml` 没有 push 或定时触发器。运行会被串行化，只能通过
`workflow_dispatch` 或类型为 `sync-snapshots` 的 `repository_dispatch` 事件启动。

手动输入如下：

| 输入      | 可选值                     | 默认值    | 约定                           |
| --------- | -------------------------- | --------- | ------------------------------ |
| `mode`    | `changed`、`all`、`module` | `changed` | 映射到本地同步 CLI 模式        |
| `module`  | manifest 中已有的模块名    | 空        | 仅在 `module` 模式下必填       |
| `dry_run` | 布尔值                     | `true`    | 验证但不写入 `sources/`        |
| `commit`  | 布尔值                     | `false`   | 将验证通过的变更提交到默认分支 |

`dry_run: true` 与 `commit: true`
同时出现、模块不在已提交索引中、模式未知或模块输入冲突时，必须在同步前失败。`repository_dispatch`
不复用这些手动输入；它只接受由调用仓库上下文产生的 discovery 载荷：

```json
{
  "event_type": "sync-snapshots",
  "client_payload": {
    "source_repository": "HITSZ-WTRobot-Packages/Sensors",
    "source_default_branch": "main"
  }
}
```

接收端只接受 `HITSZ-WTRobot-Packages/<module>`，从仓库名推导模块 ID，并自行构造 GitHub HTTPS clone
URL。载荷不能提供任意 URL、同步模式或提交开关；合法事件固定映射为一次非试运行的单仓库同步并在验证后提交。首次成功同步会把仓库加入
`sources/manifest.json`，失败则不留下索引、目录或部分快照。后续全量、changed-only 和单模块同步都从该 manifest 还原仓库配置，不枚举 GitHub 组织，也不读取代码中的仓库名单。

事件适配器使用参数数组调用 `bun run sync`，不会把工作流表达式插值到命令中。同步在临时克隆内发现
`cpkg.toml`
和源码，使用锁定的 Doxygen 生成规范化目录，并只将文档、资源、许可证和目录 JSON 写入快照。变更检测包括已跟踪修改、删除和新的未跟踪快照文件。无变化的运行报告 no-op 且不创建提交。有变化的运行必须通过完整离线门禁、嵌套站点构建、产物/链接检查以及 Playwright/axe，之后才允许执行可选提交。该提交只暂存
`sources/`，使用 GitHub Actions 机器人身份，并在提交消息中包含
`[snapshot-sync]`。工作流没有 push 触发器，因此机器人提交不会递归启动另一次同步，也不会自动启动
`Validation`；需要验证该提交时，操作者必须为对应 ref 手动运行 `Validation`。

所有 workflow 的仓库 `GITHUB_TOKEN` 都保持
`contents: read`。同步 workflow 只有在已验证 diff 需要提交时，才在该步骤通过 `GH_TOKEN` 使用
`DOCS_SYNC_TOKEN`
配置 Git 凭据并 push；checkout 不持久化凭据。仓库或分支规则仍可能阻止其推送；该失败会保留远程分支不变，并由提交步骤报告。不提交的运行只在 runner 生命周期内保留其已验证差异。

## 驱动仓库接入

`.github/workflows/request-docs-sync.yml` 是供同一组织驱动仓库引用的 reusable
workflow。组织管理员创建 `DOCS_SYNC_TOKEN` Actions secret：使用 fine-grained personal access
token，仅授权 `HITSZ-WTRobot-Packages/docs` 的
`Contents: write`，并向 docs 仓库和获准初始化文档的驱动仓库开放。调用方自带的 `GITHUB_TOKEN`
仅对调用方仓库有效，不能替代该 token；docs 同步也使用此 token 推送 snapshot
commit，使该 push 能被仓库外部既有构建服务观察。

每个驱动仓库添加以下薄工作流。`@main`
是有意选择的滚动引用：每次新运行都采用 docs 默认分支上的最新 reusable
workflow，因此中央修正不需要逐仓库更新 SHA；相应地，docs 必须保持该调用契约向后兼容。

```yaml
name: Update package documentation

on:
  push:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  documentation:
    uses: HITSZ-WTRobot-Packages/docs/.github/workflows/request-docs-sync.yml@main
    secrets: inherit
```

被调用工作流从调用方 `github.repository`
和默认分支构造 discovery 事件，并在非默认分支运行时跳过 dispatch，调用仓库不能覆盖目标模块。调用方在 GitHub
API 接受事件后即成功，不等待 docs 的同步结果；克隆、Doxygen、质量门禁和提交结果在 docs 的
`Synchronize snapshots`
运行中查看。重复 push 会被 docs 的串行同步组依次处理，相同上游修订最终成为 no-op。

docs 接收 workflow 只在 `sources/` 有变化时创建 snapshot
commit；无变化时不会 push，也就没有新的默认分支 commit 可供外部构建服务观察。该 commit 使用
`DOCS_SYNC_TOKEN` 推送，而不是会抑制派生 workflow/Pages 事件的仓库
`GITHUB_TOKEN`。本仓库不为此启用本地 push build：`Validation` 保持纯
`workflow_dispatch`，正式部署仍由独立流程管理。

## 固定工具链

外部第三方 Actions 均引用完整提交 SHA；组织内的 dispatch reusable workflow 按上述中央更新契约使用
`@main`。本地 setup Action 根据软件包契约安装 Bun 1.3.14，执行
`bun install --frozen-lockfile`，并按需安装 Chromium。只有同步作业通过固定到完整提交 SHA 的
`ssciwr/doxygen-install` Action 安装 `.doxygen-version` 指定的 Doxygen
1.16.1；同步 CLI 会在读取上游前再次验证其完整版本输出。验证、构建和部署作业均不安装 Doxygen。

修改工作流结构时运行：

```text
bun test tests/unit/action-request.test.ts tests/unit/workflows.test.ts
bun run typecheck
bun run check
```

在可用时运行 actionlint。修改固定工作流依赖或自动化契约时，必须在同一变更中更新 Action
SHA 注释、发布产物校验和、测试、本文档和适用的 `AGENTS.md`。
