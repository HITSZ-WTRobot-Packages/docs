# HITSZ-WTRobot-Packages 文档

`HITSZ-WTRobot-Packages` 为哈尔滨工业大学（深圳）南工问天（英文名
`HITSZ WTRobot`）维护的可复用 STM32 软件包提供静态、可搜索的文档。

站点从 `sources/`
下已提交的文件构建。常规构建、测试和预览不会访问上游仓库；网络访问仅限显式执行的同步命令。

## 项目约定

- Bun 是唯一的 JavaScript 运行时和软件包管理器。提交 `bun.lock`，不要创建 npm、pnpm 或 Yarn 锁文件。
- Astro 和 Starlight 生成静态站点。`SITE_URL` 和 `BASE_PATH` 是仅有的部署地址输入。
- 需要 Python 时，使用 uv，并保持其默认项目 `.venv` 和全局缓存行为。
- 优先使用维护良好的库，不要自行实现解析器、渲染器、搜索索引或图布局算法。
- 不得从本仓库修改任何上游模块仓库。
- 将上游内容或架构问题记录到 `issues.md`。

## 仓库结构

| 路径             | 用途                                                 |
| ---------------- | ---------------------------------------------------- |
| `src/`           | Astro 页面、组件、构建期加载器和共享 TypeScript 契约 |
| `scripts/`       | 用于同步、生成和验证的 Bun CLI                       |
| `sources/`       | 纳入版本控制的上游快照及其清单                       |
| `tests/`         | 单元、集成、浏览器、无障碍和夹具测试                 |
| `public/`        | 本仓库拥有的静态资源                                 |
| `docs/`          | 运维和部署文档                                       |
| `.trellis/spec/` | 面向贡献者和智能体的可执行约定                       |

## 命令约定

仓库提供以下 Bun 命令。CI 和贡献者文档调用相同命令，不在工作流 Shell 中重复实现其逻辑。

```text
bun install --frozen-lockfile
bun run dev
bun run sync [--module <name> | --changed] [--dry-run]
bun run generate:catalog
bun run generate:readme
bun run generate:api
bun run generate
bun run lint
bun run typecheck
bun run test
bun run test:e2e
bun run check:artifacts
bun run check:links
bun run check
bun run build
```

根路径构建使用 `SITE_URL=https://example.invalid` 和 `BASE_PATH=/`。`BASE_PATH` 也可以是
`/products/wtr/docs/` 等嵌套路径；代码中不得包含仓库专用的部署前缀。

## 源码同步

`bun run sync`
是仓库中唯一允许访问网络的命令。它将六个允许同步的模块仓库浅克隆到操作系统临时目录，将各分支解析为完整提交 SHA，并在修改已跟踪文件前验证完整候选快照。

```text
bun run sync                         # 刷新所有允许同步的模块
bun run sync --module MotorDrivers   # 刷新单个模块
bun run sync --changed               # 跳过 SHA 完整且未变化的模块
bun run sync --changed --dry-run     # 只验证和报告，不写入 sources/
```

同步闭包包含可用的 `cpkg.toml`、README、README 传递引用的 Markdown/资源、C/C++
Doxygen 输入和许可证文件。本地 Markdown 引用必须留在所属模块内；符号链接、缺失目标、不安全路径或超出配置大小限制都会导致操作失败。缺失软件包清单、README 或许可证会作为明确的上游质量警告保留，使纯源码模块仍具有可复现快照。

每次成功同步的快照保存在 `sources/modules/<module>/`。`sources/manifest.json` 使用
`formatVersion: 1`，记录模块仓库、分支、完整及缩写 SHA、总字节数、警告、许可证路径，以及每个选中文件的路径、类型、字节数和 SHA-256。所有数组均稳定排序，清单不含时间戳，因此相同输入再次运行后工作树逐字节不变。试运行或验证失败时保留最后一份完整快照。

## 软件包目录

`bun run generate:catalog` 验证所有已同步的
`cpkg.toml`，并在不访问网络、不产生已跟踪输出的情况下在内存中构建共享目录。软件包发现以快照清单为准，因此同步后会自动纳入新增的上游软件包。

目录接受省略 `format_version` 或使用 `format_version = 1`
的当前清单，并严格验证软件包标识、语义版本格式、依赖名称、快照校验和与路径。内部依赖解析为稳定的软件包 slug 和反向依赖项；允许的外部依赖集合严格限定为
`FreeRTOS`、`stm32cubemx` 和
`VelocityProfile::SCurve`。名称或 slug 重复以及其他未解析依赖都会导致生成失败。源码链接固定到模块快照的完整 SHA，显示的修订版本采用
`<version>+<short-sha>`。

## README 文档

`bun run generate:readme`
完全基于已提交快照验证和渲染模块、软件包以及 README 引用的补充 Markdown。模块和软件包 README 构成其主页面；缺少 README 的软件包使用由 cpkg 数据确定性生成的降级内容。

相对 Markdown 页面、标题、图片和附件通过快照文件索引解析。页面与资源路由使用共享 base-path 辅助函数，上游源码链接固定到完整模块 SHA。GFM 和原始 HTML 通过 unified/remark/rehype 管线及显式净化 Schema 处理。引用缺失、校验和不匹配或越出模块根目录会携带源码上下文使生成失败，而不会产生损坏页面。

## Doxygen API 参考

`bun run generate:api` 验证所有已同步的 C/C++ 文件，检查已安装 Doxygen 版本是否与 `.doxygen-version`
一致，并在操作系统临时目录中生成 XML。每个软件包使用显式临时 Doxyfile 调用一次 Doxygen；同时位于多个软件包路径下的文件归属最深的软件包，未被软件包认领的模块源码生成模块级参考。生成过程不会编译固件、输出 Doxygen
HTML 或创建源码浏览器。

XML 管线使用 `fast-xml-validator` 验证语法、`fast-xml-parser`
解析，并将文件、命名空间、类和结构体、函数、枚举、类型定义、变量、宏定义、说明、位置、固定版本源码链接和符号关系规范化为带版本的 TypeScript 目录。缺失输入或符号会成为明确的空状态，缺失注释会成为文档稀疏状态，单个目标提取失败不会屏蔽其他软件包。Doxygen 可执行文件缺失或版本不匹配属于全局可复现性错误，必须先解决才能生成。

## 文档门户

生产构建将软件包目录、渲染后的 Markdown 和规范化 Doxygen 数据组合为静态 Astro 路由。主要路由如下：

| 路由                    | 内容                                               |
| ----------------------- | -------------------------------------------------- |
| `/`                     | 模块摘要和完整软件包目录                           |
| `/modules/<module>/`    | 模块 README、软件包和模块级 API 状态               |
| `/packages/<slug>/`     | 修订版本、安装命令、源码、手册、依赖项和 API 状态  |
| `/packages/<slug>/api/` | 按命名空间组织的 Doxygen 符号和固定版本源码位置    |
| `/search/`              | 带模块、命名空间和结果类型筛选条件的 Pagefind 搜索 |
| `/quality/`             | 快照和 API 文档质量状态                            |

软件包页面提供延迟加载的 Cytoscape 依赖关系浏览器，支持直接、传递和反向模式。非默认模式可通过
`?graph=transitive` 或 `?graph=reverse` 分享；禁用 JavaScript 时仍可使用静态的直接和反向依赖列表。

Pagefind 由生产构建生成，因此应依次执行 `bun run build` 和 `bun run preview`
验证搜索。开发服务器没有生成后的 Pagefind 索引，会显示范围明确的不可用状态和重试命令。搜索词与筛选状态编码在 URL 中。所有门户链接、Pagefind 资源和依赖图链接均由
`BASE_PATH` 派生，并通过 Playwright 覆盖根路径和嵌套部署前缀。

发布产物通过 `check:artifacts` 和 `check:links` 后，运行
`PLAYWRIGHT_REUSE_ARTIFACT=1 bun run test:e2e`
测试这些确切字节。省略该变量时，Playwright 会执行常规独立构建后再预览。

## 自动化

`.github/workflows/validation.yml`
基于已提交快照运行离线质量门禁和静态站点矩阵。`.github/workflows/sync-snapshots.yml`
是唯一允许访问网络的工作流：它必须显式触发、验证事件载荷、调用本地使用的同一个 `bun run sync`
CLI，并且仅在请求提交且内容发生变化时提交 `sources/`。两个工作流都不会部署站点。

工作流输入、`repository_dispatch` 载荷、权限、无变更行为、固定工具链和失败语义详见
[docs/automation.md](docs/automation.md)。

## 部署准备状态

`bun run check:artifacts`
是可执行的发布产物契约。除 canonical、robots、sitemap、404 和 Pagefind 资源外，它还会依据目录、README/降级内容、修订版本、依赖项和 API 数据验证每个模块/软件包路由，并拒绝临时路径、原始快照、Git 元数据、虚拟环境、凭据、符号链接以及生成允许列表之外的上游资源。

未来选定的目标是使用 `SITE_URL=https://hitsz-wtrobot-packages.github.io` 和 `BASE_PATH=/docs/`
构建的 GitHub
Pages 项目站点。自定义域名需要新的根路径构建；不同地址组合之间不能复用生产产物。本仓库当前没有启用部署工作流。确切权限、环境保护、自定义域名流程、保留产物回滚、发布演练、停止条件和部署后检查清单见
[docs/deployment.md](docs/deployment.md)。

## 架构问题

如果快照大小、许可证、跨根目录引用、Doxygen 工具可用性、GitHub
Actions 权限、库可用性或静态 base-path 行为会改变架构，请在 `issues.md`
中记录证据并暂停该决策。常规上游文档缺陷不会阻塞无关工作。
