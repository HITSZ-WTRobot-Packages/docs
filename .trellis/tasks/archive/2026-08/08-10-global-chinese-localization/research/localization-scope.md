# 中文化范围调研

## 现状

- `astro.config.ts` 未配置 Starlight locale，因此生成的 HTML 和 Starlight 内置控件默认使用英文。
- Starlight 0.41.7 自带 `zh-CN` 翻译；将根 locale 配置为 `zh-CN` 可同时设置 HTML `lang`、默认界面翻译和 Pagefind 索引语言。
- Starlight 自带的简体中文翻译未覆盖全部 Pagefind 文案，且标题锚点的无障碍标签仍为英文，需要通过 `src/content/i18n/zh-CN.json` 补齐。
- 仓库自有页面的英文文案分布在 `src/pages/`、`src/components/`、`src/lib/site/view-models.ts`、Markdown 降级模板和 Doxygen/快照警告消息中。
- `README.md`、`docs/automation.md`、`docs/deployment.md`、`issues.md` 均为仓库自有英文文档。
- 端到端测试直接断言英文可见文本；本次迁移必须同步更新断言，并增加 HTML 语言标记检查。

## 边界

- `sources/` 是带 SHA-256 清单的上游快照，工程合同要求逐字节保留，不能翻译。
- 包名、模块名、API、README、Doxygen、C/C++、命名空间、命令、路径、环境变量和诊断码属于技术标识，应保留原样。
- 源码内部错误消息和 CLI 输出不属于站点展示层；只有确实渲染到门户中的快照/API 质量消息需要中文化。
- `.trellis/` 工作流、归档任务和技能是内部基础设施，不属于产品文档迁移范围；仅更新持久化的语言规范。

## 建议方案

采用单一简体中文根 locale，并在各文案源头完成中文化：

1. 在 Starlight 配置声明根语言为 `zh-CN`，用项目 i18n 文件补齐内置翻译缺口。
2. 翻译 Astro 模板、交互脚本、展示状态映射和生成式降级文档，保留稳定的路由、枚举值、查询参数和数据契约。
3. 翻译仓库自有的 README、运维、部署与问题文档。
4. 更新工程约定和自动化测试，构建后检查 HTML `lang`、页面文案、布局、搜索、无障碍及发布产物契约。

该方案无需引入运行时国际化层，也不会产生 `/zh-CN/` 路由前缀；根路径即为唯一中文站点。
