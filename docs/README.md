# docs —— 项目标准文件索引

本目录是 dsh-codex-pet 项目的**标准文件集合**（单一事实来源）。任何开发/评审/交接先读 [../AGENTS.md](../AGENTS.md)，再按需查阅下列文件。

## 文件清单

| 文件 | 职责 | 何时阅读 | 状态 |
| --- | --- | --- | --- |
| [requirements.md](requirements.md) | 开发需求：目标、已确认决策、功能需求 FR-1~6、非功能需求 | 需求评审、变更评估 | v0.1 已确认 |
| [technical-design.md](technical-design.md) | 技术设计：双半架构、宿主/客户端设计、数据流、路由、状态联动 | 实现前、架构调整 | v0.1 已评审 |
| [development-spec.md](development-spec.md) | 开发规范：DSH 插件设计规范、工程约束、代码规范、文档同步 | **每次编码前必读** | v0.1 |
| [asset-spec.md](asset-spec.md) | 资产包格式规范：zip 结构、manifest 字段与校验 | 导入功能实现、资产制作 | v0.2 草案（待样例定稿） |
| [execution-steps.md](execution-steps.md) | 执行步骤：spike 清单、里程碑 M0~M5、任务状态、验收标准 | 规划任务、查看进度 | 进行中 |

## 阅读顺序建议

1. 新成员/交接 → [../AGENTS.md](../AGENTS.md) → [requirements.md](requirements.md)
2. 开始编码 → [development-spec.md](development-spec.md) + [technical-design.md](technical-design.md)
3. 做资产/导入 → [asset-spec.md](asset-spec.md)
4. 规划/验收 → [execution-steps.md](execution-steps.md)

## 文档维护约定

- 需求/设计/规范变更必须同步更新对应文件，并记录到各文件的变更记录表。
- 任何实现改动若影响其他文档描述，必须在同一改动中更新受影响文档。
- 文档优先级：标准文件 > 代码注释 > 口头约定。
