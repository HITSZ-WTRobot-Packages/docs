# 按发布内容抑制无效站点重构

## Goal

将模块同步的发布判定从“上游 SHA 或生成器指纹是否变化”调整为“站点实际消费的规范化发布内容是否变化”。内容等价时保留原快照和发布 SHA，使 `sources/` 字节不变、不产生默认分支 commit，也不触发仓库外部站点构建。

## Requirements

- 模块同步仍需解析并完整验证最新上游候选，包括文件选择、包目录、Doxygen API、依赖图、大小和校验和。
- 使用规范化发布投影比较候选与现有快照：模块配置、已提交内容、警告、引用、许可证、规范化包数据和 API 数据均属于发布内容。
- `sha`、`shortSha`、`producerFingerprint`、派生字节数以及仅由 revision 元数据导致的 artifact 校验和不单独构成发布变化。
- 内容等价且现有快照完整时，丢弃候选并保留原 manifest、模块目录、发布 SHA、package catalog 和 API catalog。
- 内容变化、首次发现或现有快照损坏时，原子提交候选并将发布 SHA 推进到本次观察到的上游 SHA。
- 同步结果区分 observed SHA 与 published SHA，并通过 `retained` 状态说明已检查但保留旧发布快照。
- observed SHA 只输出到 GitHub Actions 日志和 Job Summary，不写入默认分支，不创建审计 commit。
- docs 自身代码、依赖、Doxygen 锁定版本和站点配置变化不纳入模块上游内容等价的去重承诺。

## Acceptance Criteria

- [ ] 上游仅修改 CI、仓库配置或未改变规范化发布内容的源码实现时，同步结果为 `retained`，`sources/` 树摘要及 Git diff 完全不变。
- [ ] README、资源、许可证、包语义、API 内容、模块配置或质量状态变化时，同步结果为 `changed`，新 SHA 成为发布 SHA。
- [ ] 首次发现和损坏快照不能被等价判断跳过。
- [ ] 多模块聚合只使用最终保留或提交的 package/API catalog，不混用 observed 与 published revision。
- [ ] dry-run 使用相同判定且不写文件。
- [ ] 同步日志明确显示 observed/published SHA，Actions Summary 记录相同信息。
- [ ] 全部相关格式、lint、类型、单元、集成、离线生成、构建、artifact 和链接检查通过。

## Definition of Done

- 同步器、报告接口和 workflow 输出实现发布等价语义。
- 覆盖 revision-only、producer-only、实现-only、真实内容变化、首次发现、损坏修复、dry-run 和多模块场景。
- `.trellis/spec/`、自动化文档和 `AGENTS.md` 与新契约保持一致。
- 工作树中无无关改动，变更按 Trellis 质量流程验证。

## Technical Approach

候选全部生成后，加载现有 package/API artifacts，构造不含 revision/producer 派生元数据的规范化发布投影。先分类 retained/changed，再以 retained 的旧快照和 changed 的新快照重新构造最终 manifest、package 聚合和 API 校验输入。仅 changed 候选进入现有原子替换函数；全部 retained 时不写 `sources/`，由 workflow 现有的 `git diff --cached --quiet` 阻止 commit 和 push。

同步结果增加 `observedSha`、`publishedSha`、`retained` 状态及计数。`publishedSha` 继续驱动页面 revision 标签、资源路由和固定源码链接；它表示当前已发布内容的精确来源提交。`observedSha` 只用于本次运行的可观测性。

## Decision (ADR-lite)

**Context**: 当前完整 `ModuleSnapshot` 比较把任何上游 SHA 变化视为发布变化，导致 CI-only 提交更新 manifest/package revision 并触发外部站点构建。

**Decision**: 以规范化发布内容而不是上游分支头作为发布边界；等价时保留旧发布 SHA，observed SHA 仅进入 Actions 运行记录。

**Consequences**: 站点不会因无发布内容变化的提交重构，发布链接保持可复现。因为旧 producer fingerprint 也被保留，后续同步可能再次生成候选；接受同步计算成本以避免更昂贵的站点重构。下一次真实内容变化会把 SHA 和 fingerprint 一并推进到最新候选。

## Out of Scope

- 不回退已经存在的历史 snapshot commit。
- 不新增默认分支内的 observed-SHA 台账。
- 不通过预构建并比较两份 `dist/` 来决定是否提交。
- 不修改仓库外部构建服务配置，也不新增本地 push 构建触发器。
- 不重新设计 docs 自身代码或 Doxygen 工具版本升级的发布流程。

## Technical Notes

- 主要实现位于 `scripts/sync/synchronizer.ts`，报告位于 `scripts/sync/reporter.ts` 和 Actions 适配器。
- 当前 package catalog 在 `moduleSha` 上与 manifest 强绑定；发布比较必须比较去除该字段后的包语义，而持久化格式继续保持现状。
- 当前 API catalog 已在 revision-only 场景保持字节稳定，可直接作为发布投影的一部分。
- 现有 workflow 已通过暂存后的空 diff 退出；核心保证是 retained 路径不得写任何 `sources/` 字节。
