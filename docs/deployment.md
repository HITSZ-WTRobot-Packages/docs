# 部署计划

本仓库已具备发布条件，但有意不包含已启用的部署工作流。首次生产部署是一项独立且需要管理员批准的变更。本计划选定使用自定义 Actions 工作流的 GitHub
Pages 作为目标，并定义该变更必须执行的检查。

## 地址契约

仓库远程地址为 `HITSZ-WTRobot-Packages/docs`。在组织自有域名获批前，部署目标是 GitHub
Pages 项目站点地址：

| 目标           | `SITE_URL`                                 | `BASE_PATH` |
| -------------- | ------------------------------------------ | ----------- |
| 默认项目站点   | `https://hitsz-wtrobot-packages.github.io` | `/docs/`    |
| 未来自定义域名 | 获批且不带路径的 HTTPS 源站                | `/`         |

`SITE_URL` 和 `BASE_PATH` 是构建输入，不是运行时设置。canonical
URL、sitemap 条目、robots 指令、导航、Pagefind 资源、Markdown 资源和依赖图链接都针对该确切组合编译。不得将产物部署到与构建和验证时所用值不同的源站或路径。

对于由 Actions 发布的 Pages 站点，应在仓库 Pages 设置和 DNS 提供商处配置自定义域名。GitHub 不需要也不会使用上传的 Actions 产物中的
`CNAME`
文件。更改 DNS 前先在 Pages 设置中添加自定义域名，验证组织域名，避免通配符 DNS，等待证书签发并启用 HTTPS 强制跳转，然后再将
`SITE_URL` 切换到自定义源站。子域名 CNAME 指向 `HITSZ-WTRobot-Packages.github.io`，不包含 `/docs`。

参考资料：

- [GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Pages 自定义域名](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [GitHub Pages HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
- [Astro 部署到 GitHub Pages](https://docs.astro.build/en/guides/deploy/github/)

## 管理前置条件

添加部署工作流前，组织或仓库管理员必须完成并记录以下选择：

- 将 Pages 的 **Build and deployment > Source** 设置为 GitHub Actions。
- 确认 Actions 可使用所需的官方 Actions 和仓库本地 setup
  Action。所有外部 Action 必须固定到完整提交 SHA。
- 保护 `main`，并将针对目标 ref 手动运行且成功的 `Validation` 记录作为发布前置证据。
- 保护 `github-pages` 环境，仅允许 `main` 使用，并为首次部署、域名变更和回滚运行配置审核者。
- 同步与部署保持分离；同步可由手动请求或驱动仓库 discovery dispatch 启动。部署构建只消费已提交的
  `sources/`，永不调用 `bun run sync`。
- 在 `issues.md` 中使用选定域名、Pages 设置、环境审核者和分支规则解决 `DEPLOYMENT-001`。

构建作业只需要 `contents: read`。独立的部署作业只需要 `pages: write` 和
`id-token: write`，依赖成功的构建作业，并以受保护的 `github-pages`
环境为目标。不需要检出凭据、仓库写入令牌、上游令牌或部署密钥。使用单一 `pages` 并发组和
`cancel-in-progress: false`，避免新运行中断正在进行的部署。

## 未来工作流契约

后续部署任务必须分离构建、保留发布产物和部署职责：

1. 从 `main` 检出显式提交，并通过 `.github/actions/setup-docs-toolchain`
   使用冻结依赖和 Chromium 完成安装。
2. 基于已提交快照运行 `bun run check` 和 `bun run generate`，不得执行同步或安装 Doxygen。
3. 使用选定的生产 `SITE_URL` 和 `BASE_PATH` 只构建一次。
4. 对同一地址配置运行 `bun run check:artifacts`、`bun run check:links` 和
   `PLAYWRIGHT_REUSE_ARTIFACT=1 bun run test:e2e`。该变量使 Playwright 预览已有
   `dist/`，而不是重新构建。
5. 在不包含符号链接或硬链接的前提下打包已验证的
   `dist/`。上传 Pages 产物，并上传第二份以源码提交和地址契约哈希命名的保留产物。将其 SHA-256、源码提交、`SITE_URL`
   和 `BASE_PATH` 保存在部署文件旁边但不放入部署文件中。
6. 在独立的受保护作业中部署已经验证的 Pages 产物。部署作业不得重新构建。

Pages 产物必须满足 GitHub 的格式和大小契约：一个小于 10
GB 的 gzip 压缩 tar 归档，且不含符号链接或硬链接。保留发布产物至少 30 天，使回滚演练能使用上一版本的确切字节。部署使用的外部 Action 必须固定到完整提交 SHA；Doxygen 只属于同步生产阶段，不是部署工具链的一部分。

初始工作流应支持使用显式提交 SHA 手动 dispatch。只有首次、重复和回滚演练通过后，才能启用 `main`
自动部署。启用后，只能部署具有同一提交成功记录的 `main` 提交；该记录必须来自手动 dispatch 的
`Validation`。快照机器人提交遵循相同的手动验证路径，不享受部署例外。

## 部署前门禁

从干净提交运行以下矩阵。构建和生成器必须在无法访问上游网络时完成；只有 Linkinator 的本地预览和 Playwright 的回环服务器可以使用网络。

| 变体           | `SITE_URL`                                 | `BASE_PATH`           | 必需检查                                      |
| -------------- | ------------------------------------------ | --------------------- | --------------------------------------------- |
| 根路径         | `https://release-root.example.invalid`     | `/`                   | 构建、产物、链接、桌面/移动 Playwright 和 axe |
| 仓库路径       | `https://hitsz-wtrobot-packages.github.io` | `/docs/`              | 构建、产物、链接                              |
| 深层自定义路径 | `https://release-nested.example.invalid`   | `/products/wtr/docs/` | 构建、产物、链接、桌面/移动 Playwright 和 axe |

运行矩阵前，执行 `bun install --frozen-lockfile`、`bun run check` 和
`bun run generate`。`bun run check:artifacts`
必须报告每个模块、软件包和 API 参考；验证 README 或降级内容、软件包修订元数据、API 源码分支、依赖项、稳定的软件包/API 路由和 Pagefind 覆盖范围；拒绝临时路径、Git 元数据、虚拟环境、凭据、符号链接、原始
`sources/` 或未获批准的上游资源。

在上传 Pages 产物前保留最终生产地址对应的
`dist/`。在发布记录中保存提交、地址组合、文件数、字节大小、Pagefind 页面数、SHA-256 和验证运行 URL。

## 发布演练

### 首次部署

1. 要求环境批准，并部署选定 `main` 提交的已验证产物。
2. 在解除批准保留前运行以下全部部署后测试。
3. 记录 Pages 部署 ID、工作流运行、源码提交、产物摘要、地址组合、DNS 状态和测试人员。

### 重复部署

重新部署相同提交和地址组合。生成文件集合及保留产物摘要必须与首次运行一致。canonical
URL 和 Pagefind 结果必须保持不变，新的部署不得创建同步提交。

### 快照更新

使用 `commit: true` 运行手动同步。确认机器人提交只修改 `sources/`，随后手动运行对应 ref 的
`Validation`
并确认通过。部署重新构建必须使用同一机器人提交且不访问上游仓库。验证受影响的软件包修订版本和固定源码链接已更新，未受影响的稳定路由仍然有效。

### 旧产物回滚

1. 根据部署记录而非仅凭文件名选择最后一个已知正常的保留产物。
2. 验证其 SHA-256、源码提交、`SITE_URL` 和 `BASE_PATH`；配置不匹配时拒绝使用。
3. 在新的受保护手动工作流运行中下载该确切产物，基于匹配的源码提交重新运行产物和链接检查，将其包装为当前运行的 Pages 产物并部署。
4. 运行全部部署后测试并记录回滚部署 ID。

如果保留产物已过期或验证失败，检出最后一个已知正常提交，使用记录的地址组合离线重建，通过完整矩阵后部署新验证的字节。取消发布是紧急可用性操作，不等同于回滚；必须成功执行新部署才能恢复站点。

## 部署后测试

在首次部署、重复部署、回滚、域名变更和任何快照更新后，对已部署的 HTTPS URL 运行以下检查清单。

| 范围     | 测试                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| 传输     | HTTP 重定向到 HTTPS；证书与主机匹配；不发生混合内容请求。                                                         |
| 元数据   | 首页和深层页面使用选定的 canonical 源站/base；`robots.txt` 指向已部署 sitemap；每个 sitemap URL 均成功响应。      |
| 错误处理 | 未知路由返回自定义 404；直接刷新软件包、API 锚点和补充文档页面成功。                                              |
| 路径     | 根路径或配置的嵌套导航、Astro 资源、favicon、Markdown 资源和所有侧边栏链接恰好保留一个 base 前缀。                |
| 搜索     | Pagefind worker、WASM、元数据、片段和索引均成功响应；桌面/移动符号搜索在刷新后恢复搜索词和筛选条件。              |
| 软件包   | 从每个模块抽样的软件包显示预期修订版本、安装命令、README/降级内容、依赖项、反向依赖、API 状态和固定版本源码链接。 |
| API      | 直接 API URL 和符号锚点可访问；显示预期源码分支；中文及超长 C/C++ 标识符换行且不被裁切。                          |
| 依赖图   | 直接、传递和反向模式在桌面/移动端均非空，保持键盘操作和 URL 状态。                                                |
| 无障碍   | 键盘焦点顺序和名称有效；axe 不报告严重或关键问题；减少动态效果行为稳定。                                          |
| 外部链接 | 抽样的软件包源码/许可证链接指向固定修订版本，API 源码链接指向默认分支；外部失败不破坏内部导航。                   |
| 运维     | 部署历史指向预期提交和环境；没有同步循环或意外机器人提交。                                                        |

至少探测
`/`、`/search/`、`/quality/`、一个模块、一个软件包、一个软件包 API 页面、一个 API 锚点、`/robots.txt`、`/sitemap-index.xml`、`/pagefind/pagefind-worker.js`
和一个未知路由。每个路径都使用配置的 base 前缀。将目录、搜索、软件包依赖图和 API 页面的桌面/移动截图与发布记录一同保存。

## 停止条件

如果任何质量作业失败、缺少产物或地址元数据、保留产物摘要不匹配、目标提交不在受保护的 `main`
中、Pages 权限超出规定、自定义域名未验证、HTTPS 不可用或 DNS 与批准记录不同，则不得部署。将证据记录到
`issues.md`，保持最后一个正常部署继续运行，并在重试前解决问题。
