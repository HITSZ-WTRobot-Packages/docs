# 完整回退 Netlify 支持并降级 Doxygen

## Goal

完整撤销提交 `b56a8a7 feat: add Netlify deployment support`，恢复仓库原有的普通 Astro
构建路径；随后将项目、GitHub Actions 和测试要求的 Doxygen 精确版本从 1.16.1 降到
1.9.8，以匹配 Netlify 构建镜像提供的版本。

## Requirements

- 完整反向撤销 `b56a8a7` 的全部 19 个文件改动，不只删除 `netlify.toml`。
- 保留该提交之后的 Trellis 归档、开发日志及其他历史提交。
- `.doxygen-version`、GitHub Actions 下载地址与摘要、测试和当前文档统一使用 1.9.8。
- GitHub Actions 继续从 Doxygen 官方 Release 下载归档，验证 SHA-256，并在加入 `PATH`
  前执行精确版本检查。
- 不修改 Doxygen XML 解析、符号 ID、Doxyfile 或快照内容。
- 本地验证优先使用临时目录中的隔离 Doxygen 1.9.8，不降级 Arch Linux 系统包。
- 若 1.9.8 无法取得或不能在当前 Arch 环境运行，记录证据并跳过依赖真实 Doxygen 的
  本地检查；其余可运行门禁仍须执行。
- 完成后创建工作提交，运行 `trellis-finish-work`，并以普通非强制方式推送
  `origin main`。

## Acceptance Criteria

- [x] `b56a8a7` 的完整反向补丁已应用，仓库不再包含 Netlify 专用配置、命令、安装器和测试。
- [x] 所有非历史版本锁、CI 配置、测试断言和文档统一要求 Doxygen 1.9.8。
- [x] GitHub Actions 中的 1.9.8 官方归档具有固定且验证过的 SHA-256。
- [x] 可用时，Doxygen 1.9.8 下的检查、生成、三种 base-path 构建、产物、链接和浏览器门禁通过。
- [x] Doxygen 1.9.8 可在本机运行，未使用跳过本地验证的例外。
- [ ] 工作树在收尾后干净，所有工作、任务归档和日志提交均已普通推送到 `origin/main`。

## Definition of Done

- 完整回退与版本降级采用可审阅的独立工作提交。
- 测试和文档与最终工具链行为一致。
- Trellis 任务已归档并记录开发日志。
- `git push origin main` 成功；不使用 force push。

## Technical Approach

先用 Git 创建 `b56a8a7` 的完整 revert 提交，再基于恢复后的原始内联 GitHub Actions
安装步骤替换 1.16.1 的版本、Release URL 和 SHA-256。真实 1.9.8 验证通过临时 `PATH`
注入，不改动 `/usr/bin/doxygen` 或 Arch 包数据库。

## Decision (ADR-lite)

**Context**: Netlify 自带 Doxygen 1.9.8，而新增的 1.16.1 官方二进制在 Netlify
提取后无法通过运行验证。

**Decision**: 撤销整个 Netlify 支持提交，并把仓库统一锁定到 1.9.8，继续由现有精确版本门禁
保证构建确定性。

**Consequences**: Netlify 回落到控制台的 `bun run build`/`dist` 配置；项目接受 Doxygen
1.9.8 的解析结果，不再提供仓库内 Netlify 专用构建与工具下载入口。

## Out of Scope

- 不修复或保留 `build:netlify`、共享 Doxygen 安装器或 Netlify URL 映射逻辑。
- 不修改 Netlify 控制台设置或等待远端部署结果。
- 不强制降级本机 Arch Linux 的系统级 Doxygen 包。

## Technical Notes

- 回退目标：`b56a8a7dabad1ace9da780d1f0a945e947d8f585`。
- 本机是 Arch Linux，当前 `/usr/bin/doxygen` 为 1.16.1；隔离工具用于避免旧 Arch 包与
  当前共享库产生系统级依赖冲突。
- 非历史 1.16.1 引用原本位于 `.doxygen-version`、本地 setup Action、
  `docs/automation.md` 和 Doxygen/工作流测试。

## Validation Results

- 官方归档大小为 50,500,806 字节；MD5 与发布页面的
  `aec78d9c9e6668258d17de94520a63a7` 一致；固定 SHA-256 为
  `dda773bdc62384b7d796fe8b6c5029daad72483e4c8ad4abf6ee9fb98b649388`。
- 官方二进制输出 `1.9.8 (c2fe5c3e4986974eb2a97608b24086683502f07f)`；版本门禁现仅额外接受该
  官方 40 位提交后缀形式，并把目录版本规范化为 `1.9.8`。
- `bun run check` 通过：72 个测试，0 失败；`bun run generate` 产生 43 个 API reference、
  2,134 个符号、0 个失败 reference。
- `/`、`/docs/`、`/products/wtr/docs/` 三个变体均通过构建、产物和 102 个内部链接检查；
  根路径和深路径各通过 12 个桌面/移动 Playwright 与 axe 测试。
- `actionlint` 在本机不可用；工作流 YAML 已由单元测试使用 `yaml` 和 Zod 解析并验证。
