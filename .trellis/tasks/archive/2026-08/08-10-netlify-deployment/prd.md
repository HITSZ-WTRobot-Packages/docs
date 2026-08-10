# 支持 Netlify 并列部署

## Goal

在保留既有 GitHub Pages 发布计划的同时，为静态 Astro 站点增加可复现的 Netlify
构建与部署入口，解决 Netlify 镜像预装 Doxygen 1.9.8 与仓库锁定 1.16.1 不一致导致的构建失败。

## Requirements

- 提交 `netlify.toml`，以仓库配置定义 Bun 版本、冻结依赖安装、构建命令和 `dist/` 发布目录。
- 共享一个受校验的 Doxygen 发布描述与安装器，由 GitHub Actions 和 Netlify 共同使用。
- 安装器必须交叉校验 `.doxygen-version`、发布版本、SHA-256 和已安装二进制版本。
- Netlify 使用 `NETLIFY_CACHE_DIR` 缓存工具链；没有缓存目录时退回操作系统临时目录。
- Netlify production 使用 `URL` 作为 `SITE_URL`，其他部署上下文使用 `DEPLOY_PRIME_URL`；所有 Netlify 构建使用 `BASE_PATH=/`。
- Netlify 构建依次安装工具链、构建站点、检查静态产物并检查链接，任一步失败均阻止发布。
- 普通构建、生成、测试继续只消费已提交的 `sources/`；不得同步或访问上游模块仓库。
- 更新部署文档、工程契约和问题记录，使 GitHub Pages 与 Netlify 成为并列部署目标。

## Acceptance Criteria

- [x] `bun run build:netlify` 在有效 Netlify production 和 preview 环境中选择正确地址并构建、验证同一份 `dist/`。
- [x] 缺少或非法 Netlify URL 时构建在 Astro 启动前失败，不回退到 localhost。
- [x] Netlify 清缓存构建会下载并校验 Doxygen 1.16.1，缓存命中仍验证可执行文件版本。
- [x] GitHub setup Action 继续安装同一版本与校验和，不再维护独立下载常量。
- [x] `netlify.toml` 使用 Bun 1.3.14、冻结锁文件、`bun run build:netlify` 和 `dist`。
- [x] Netlify 路径不执行同步，不把工具链、缓存、源码或凭据放入部署产物。
- [x] 单元、集成、格式、lint、类型、生成、构建、产物和链接检查通过。

## Definition of Done

- 测试覆盖安装器边界、Netlify 地址选择与配置契约。
- 文档说明管理员配置、发布锁、预览、回滚和部署后检查。
- `AGENTS.md` 与 `.trellis/spec/` 中受影响的工具链和部署约定保持一致。
- 保留 GitHub Pages 契约及 `DEPLOYMENT-001`，另行记录 Netlify 管理状态。

## Technical Approach

在 `scripts/toolchain/` 中实现 Bun/Node 可执行的共享安装逻辑：用 Web API 下载固定归档、Node
crypto 校验摘要、Execa 运行 `tar` 与 `doxygen --version`，并通过临时目录加原子重命名避免半安装缓存。
Netlify 专用 CLI 准备环境并以 Execa 顺序调用现有 package scripts。GitHub composite Action
只负责调用共享 CLI 并把返回的 `bin` 目录写入 `GITHUB_PATH`。

## Decision (ADR-lite)

**Context**: Netlify 只提供 Doxygen 1.9.8，且仓库必须使用 1.16.1；把下载命令复制到
`netlify.toml` 会与 GitHub Action 的版本和摘要漂移。

**Decision**: 使用仓库拥有的共享安装器和 provider-specific 编排入口，不引入 Astro Netlify adapter、Functions 或插件。

**Consequences**: 部署准备阶段允许访问固定的 Doxygen Release 资源；普通构建仍离线。Netlify
与 Pages 必须针对各自地址分别构建，产物不可跨地址复用。

## Out of Scope

- 不启用或修改 GitHub Pages 部署工作流。
- 不自动同步 `sources/`，不访问或修改上游模块仓库。
- 不增加 Netlify Functions、Edge Functions、表单、身份认证或运行时 adapter。
- 不硬编码 Netlify 项目 ID、账号 ID、默认子域名、自定义域名或访问令牌。
- 不代表管理员启用生产自动发布；首次上线保持 deploy lock 并手动发布已验证候选。

## Research References

- [`research/netlify-deployment.md`](research/netlify-deployment.md) — Netlify 工具链、配置与部署上下文约束。

## Technical Notes

- 相关仓库契约：`.doxygen-version`、`.github/actions/setup-docs-toolchain/action.yml`、
  `src/lib/paths/site-config.ts`、`tests/unit/workflows.test.ts`、`docs/deployment.md`。
- 站点为 Astro `output: "static"`，无需 Netlify 运行时 adapter。
