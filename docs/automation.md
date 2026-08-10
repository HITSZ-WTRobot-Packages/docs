# 自动化

本仓库将允许访问网络的快照同步与常规离线验证分离。两个 GitHub
Actions 工作流都不会部署站点或启用 GitHub Pages；Netlify 使用独立的已提交配置构建静态站点。

## 验证工作流

`.github/workflows/validation.yml` 只能通过 `workflow_dispatch` 手动运行。操作者必须在 GitHub
Actions 中选择要验证的 ref；推送到 `main`、拉取请求和快照机器人提交都不会自动启动它。工作流只有
`contents: read` 权限，检出时不保留凭据，并且从不调用同步命令或访问上游模块仓库。

离线质量作业执行冻结依赖安装、约定检查、格式检查、lint、Astro 类型检查、单元/集成测试，以及全部目录、README 和 Doxygen 生成器。站点矩阵分别使用不同的示例源站构建
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
| `module`  | 允许列表中的一个模块名     | 空        | 仅在 `module` 模式下必填       |
| `dry_run` | 布尔值                     | `true`    | 验证但不写入 `sources/`        |
| `commit`  | 布尔值                     | `false`   | 将验证通过的变更提交到默认分支 |

`dry_run: true` 与 `commit: true`
同时出现、模块不在允许列表中、模式未知或模块输入冲突时，必须在同步前失败。默认仓库 dispatch 是仅检查变更的试运行：

```json
{
  "event_type": "sync-snapshots",
  "client_payload": {}
}
```

允许提交的显式单模块更新如下：

```json
{
  "event_type": "sync-snapshots",
  "client_payload": {
    "mode": "module",
    "module": "Sensors",
    "dry_run": false,
    "commit": true
  }
}
```

事件适配器使用参数数组调用
`bun run sync`，不会把工作流表达式插值到命令中。变更检测包括已跟踪修改、删除和新的未跟踪快照文件。无变化的运行报告 no-op 且不创建提交。有变化的运行必须通过完整离线门禁、嵌套站点构建、产物/链接检查以及 Playwright/axe，之后才允许执行可选提交。该提交只暂存
`sources/`，使用 GitHub Actions 机器人身份，并在提交消息中包含
`[snapshot-sync]`。工作流没有 push 触发器，因此机器人提交不会递归启动另一次同步，也不会自动启动
`Validation`；需要验证该提交时，操作者必须为对应 ref 手动运行 `Validation`。

同步工作流是唯一拥有 `contents: write`
的工作流。仓库或分支规则仍可能阻止其推送；该失败会保留远程分支不变，并由提交步骤报告。不提交的运行只在 runner 生命周期内保留其已验证差异。

## 固定工具链

外部 Actions 均引用完整提交 SHA。本地 setup Action 根据软件包契约安装 Bun 1.3.14，执行
`bun install --frozen-lockfile`，并调用 `bun run setup:doxygen`。共享安装器从
`.doxygen-release.json` 读取官方 Doxygen 1.16.1 Linux 产物地址与 SHA-256，要求其版本等于
`.doxygen-version`，提取前验证摘要，进入执行路径前验证二进制版本。Netlify 使用同一安装器和发布描述，避免平台配置漂移。只有运行 Playwright 的 GitHub 作业会安装 Chromium。

修改工作流结构时运行：

```text
bun test tests/unit/action-request.test.ts tests/unit/workflows.test.ts
bun run typecheck
bun run check
```

在可用时运行 actionlint。修改固定工作流依赖或自动化契约时，必须在同一变更中更新 Action
SHA 注释、发布产物校验和、测试、本文档和适用的 `AGENTS.md`。
