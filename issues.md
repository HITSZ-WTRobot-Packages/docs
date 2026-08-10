# 项目问题记录

本文档记录架构门禁和上游文档缺陷。只有当开放问题的“影响”明确指出其会改变架构选择时，该问题才会阻塞实施。

## 问题模板

```markdown
## ISSUE-ID：简短标题

- 状态：open | monitoring | resolved | accepted
- 范围：architecture | upstream-content | tooling | deployment
- 负责人：GitHub 用户名或角色
- 证据：可复现命令、URL、文件路径和观察结果
- 影响：无法完成的事项或将发生变化的架构决策
- 规避措施：当前有边界的规避措施，或 `none`
- 关闭条件：关闭问题所需的客观证据
- 最近验证：YYYY-MM-DD

补充上下文和解决记录。
```

## 开放问题

## DEPLOYMENT-001：GitHub Pages 管理状态尚未获批

- 状态：open
- 范围：deployment
- 负责人：`HITSZ-WTRobot-Packages/docs` 仓库管理员
- 证据：仓库远程地址指向
  `HITSZ-WTRobot-Packages/docs`，但当前环境在 2026-08-10 对 GitHub 仓库/Pages 状态执行只读 API 探测时返回 HTTP
  404。仓库中不存在部署工作流或 `CNAME`。
- 影响：可以为默认项目站点地址构建并完整验证产物，但在管理员确认 Pages 来源、目标域名、Actions 策略、受保护的
  `github-pages` 环境、审核者和 `main`
  分支规则之前，无法启用生产部署。该问题不改变静态快照或 base-path 架构。
- 规避措施：保持部署禁用，以 `SITE_URL=https://hitsz-wtrobot-packages.github.io BASE_PATH=/docs/`
  作为默认发布契约，并在后续部署任务中遵循 `docs/deployment.md`。
- 关闭条件：管理员记录选定的域名/地址组合，启用 GitHub
  Actions 作为 Pages 来源，配置分支/环境保护及所需权限，并且首次、重复、回滚演练和部署后检查清单全部通过。
- 最近验证：2026-08-10

## DEPLOYMENT-002：Netlify 生产设置尚未完成管理员验收

- 状态：open
- 范围：deployment
- 负责人：Netlify 项目管理员与 `HITSZ-WTRobot-Packages/docs` 仓库管理员
- 证据：2026-08-10 的 Netlify 构建日志显示项目已连接仓库，但使用控制台命令
  `bun run build`，镜像只提供 Doxygen 1.9.8，因与 `.doxygen-version`
  要求的 1.16.1 不一致而失败。仓库现已定义 `netlify.toml`
  和固定工具链入口，但无法从仓库内确认 production branch、主域名、deploy lock、auto
  publishing、预览策略或保留期限。
- 影响：可以可复现地构建并验证 Netlify 候选产物；在管理员记录主域名、确认
  `main`、锁定生产发布并完成首次/重复/回滚演练前，不得把候选视为批准的正式部署。该问题不阻塞 deploy
  preview。
- 规避措施：保持 production deploy lock；以 Netlify `URL` 和 `BASE_PATH=/` 构建候选，在手动
  `Validation` 与部署后检查通过后由管理员发布。
- 关闭条件：管理员记录 Netlify 项目主域名与 production branch，确认预览/branch
  deploy 策略和保留期限，完成首次、重复、回滚及部署后检查，并明确是否启用 auto publishing。
- 最近验证：2026-08-10

## UPSTREAM-001：ArmController 缺少软件包清单、README 和许可证文件

- 状态：open
- 范围：upstream-content
- 负责人：ArmController 维护者
- 证据：在上游提交 `967f6e0c5a1e211ffc45b7af80efece89252f685` 执行
  `bun run sync --module ArmController --dry-run` 时，选中七个 C/C++ 文件，并报告
  `PACKAGE_MANIFEST_MISSING`、`README_MISSING` 和 `LICENSE_MISSING`。
- 影响：门户可以为该模块生成源码 API 视图，但无法发现 cpkg 软件包、渲染上游使用说明或声明源码许可证。该问题不改变快照架构；源码仓库和文档仓库属于同一组织所有者，门户必须将缺失许可证显示为未知，而不能自行推断。
- 规避措施：保留已验证的纯源码快照，显示全部三项警告，并生成模块级降级内容，不虚构软件包或 README 元数据。
- 关闭条件：后续同步的 ArmController 修订版本至少包含一个
  `cpkg.toml`、一个 README 和一个许可证文件，且三个清单警告全部消失。
- 最近验证：2026-08-10
