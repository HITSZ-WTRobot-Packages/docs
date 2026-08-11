# 优化 API 面向对象关系展示

## Goal

将当前按符号种类平铺的 API 页面重构为类型详情优先的 C/C++ API 参考页，使用户能直接理解类和结构体的继承关系、成员归属与公开接口。

## Requirements

- API catalog 升级到 formatVersion 3，显式记录继承关系和成员修饰信息。
- 继承关系保留基类名称、可解析的目标符号、访问级别和虚继承标记。
- 成员保留访问级别、static、virtual/pure virtual 和 const 信息，并继续以 parentId 表达归属。
- 页面以命名空间和类型为主导航，类型详情按继承、构造函数、成员函数、成员变量和嵌套类型组织。
- 提供只包含类和结构体的继承关系视图；外部基类显示名称但不生成失效链接。
- 桌面端提供类型导航和详情布局，移动端保持可用；全部关系提供非 Canvas 的语义化内容。
- 保留现有 package/module API 路由和稳定符号锚点。
- 无类型目标回退到普通函数、枚举、类型定义、变量、宏和文件列表。
- 页面文案使用简体中文，技术标识保持原样。

## Acceptance Criteria

- [x] Doxygen XML 单继承、多继承、访问级别、虚继承、纯虚函数和外部基类均被确定性归一化。
- [x] API schema 拒绝无效继承端点和无效成员修饰数据。
- [x] 类型导航、继承链接、成员分组和无类型回退均正确渲染。
- [x] 关系视图可通过键盘和无脚本语义结构访问，并尊重 reduced motion。
- [x] catalog、artifact、Pagefind、响应式和可访问性校验通过。
- [x] 已提交的 sources API artifacts 全部迁移到 v3，普通构建保持离线。

## Technical Approach

- 在 ApiReference 增加 inheritanceRelations；在 ApiSymbol 增加 member 元数据。
- 从 Doxygen compounddef/basecompoundref 与 memberdef 属性提取关系和成员修饰信息。
- 在 Astro 构建阶段派生类型树、反向派生类关系和成员分组，不引入客户端全局状态。
- API 页面采用类型目录加详情内容；继承总览使用已有 Cytoscape.js，并提供等价的语义化关系列表。
- references 字段保留，但第一版不将其解释为组合、聚合、依赖或调用关系。

## Decision (ADR-lite)

**Context**: 当前 parentId 能表达成员归属，但 references 混合多种 Doxygen refid，无法可靠解释为具体对象关系。

**Decision**: 第一版显式建模继承关系并保留成员归属，页面以类型详情为首要视角，关系图为辅助视图。

**Consequences**: 继承与成员结构可靠可测；组合、聚合、参数依赖和调用图留待后续基于更精确的数据模型实现。

## Out of Scope

- 组合、聚合、参数或返回类型依赖推断。
- 函数调用与被调用关系图。
- 独立的单类型路由。
- API catalog v2/v3 运行时双版本兼容。

## Technical Notes

- 主要实现位于 src/lib/doxygen、src/components/documentation 和 API 页面共享组件。
- 必须使用 Bun 命令、Astro 静态输出、Zod 边界验证和现有 Cytoscape.js 依赖。
- 同步后的 API JSON 是提交产物，生成与站点构建不得重新运行 Doxygen。
