# AGENTS.md —— 项目工作指引（Agent Working Guide）

> 标准文件入口。进入本仓库的 Agent 应先读本文件，再按需查阅 docs/ 下标准文件。

## 项目一句话

dsh-codex-pet：DeepSeek Harness（DSH）桌面宠物插件。导入/上传 codex 生成的**精灵图序列帧宠物**，在 DSH Web GUI 以 `shell.overlay` 悬浮浮层渲染，含图库管理页、基础交互与 Agent 状态联动。UI 严格遵循 DSH 插件设计规范（见 docs/development-spec.md）。

## 关键路径

| 项 | 值 |
| --- | --- |
| 工作区根 | `path/to/dsh-codex-pet` |
| 标准文件目录 | `./docs/` |
| DSH 安装/依赖（仅用于查阅/扩展 DSH 本身） | `path/to/dsh-install` |
| GUI 地址 | http://127.0.0.1:3080 |

## 标准文件索引（进入项目先读此表）

| 文件 | 职责 | 何时阅读 |
| --- | --- | --- |
| [docs/README.md](docs/README.md) | docs 目录索引与阅读顺序 | 进入项目时 |
| [docs/requirements.md](docs/requirements.md) | 开发需求：目标、已确认决策、功能需求 FR-1~6 | 需求评审、变更评估 |
| [docs/technical-design.md](docs/technical-design.md) | 技术设计：双半架构、宿主/客户端设计、HTTP 路由、状态联动 | 实现前、架构调整 |
| [docs/development-spec.md](docs/development-spec.md) | 开发规范：DSH 插件设计规范、工程约束、代码规范、文档同步 | **每次编码前必读** |
| [docs/asset-spec.md](docs/asset-spec.md) | 资产包格式规范：zip 结构、manifest 字段与校验 | 导入功能实现、资产制作 |
| [docs/execution-steps.md](docs/execution-steps.md) | 执行步骤：spike S0~S4、里程碑 M0~M5、任务状态、验收标准 | 规划任务、查看进度 |

## 工作约定

1. **动手前必读**：编码先读 [docs/development-spec.md](docs/development-spec.md)；涉及架构先读 [docs/technical-design.md](docs/technical-design.md)。
2. **文档同步**：任何改动影响需求/设计/规范时，同步更新对应标准文件并记录到该文件的变更记录表；保持本文件索引最新。
3. **客户端插件生效链路**（关键约束）：
   - 客户端插件改动需重建 web 产物：在 DSH checkout（上表）下 `pnpm run dev:web` 启动热更 watcher，或 rebuild + 刷新页面；
   - 刷新 http://127.0.0.1:3080，确认插件 bundle 进入 `__DSH_BOOT__` 图；
   - **watcher 未运行时，改动不会自动生效，不要承诺自动更新**。
4. **变更先行**：需求/设计变更先改标准文件再实现；实现按 [docs/execution-steps.md](docs/execution-steps.md) 的 M0→M5 顺序推进。
5. **规范红线**：Slot 窄入口（不覆盖产品 UI）、`--dsw-*` 主题令牌、复用 primitives、生命周期清理（disposer）、JSON-only RPC。

## 当前状态与下一步

- 已完成：M0 资产格式定稿（asset-spec v1.3）、M1 插件骨架/安装/激活、M2 宿主半（pet-library + 7 路由 + vendored fflate）、M3 PetPlayer（样例宠物渲染确认）、M4 图库管理页（settings.section + 事件桥联动）、M5 Agent 状态联动（sessions.list 快照 + 常驻/脉冲模型）+ 开源清理（样例更名 sample-pet、私有路径泛化）。
- **当前状态**：**M0–M5 全部完成并验证通过（深/浅主题、重启持久化均确认）——项目可交付/开源。** M6（宠物大小滑块）已完成；M7（宠物默认初始位置改为左下角·侧边栏边上）已完成并验证通过。
- 推进方式：按 [docs/execution-steps.md](docs/execution-steps.md) 继续；**客户端 bundle 改完即热更（junction + dsh-client-hmr），免重启**；宿主/插件集变更需重启 GUI（见工作约定 3）。

## 命令速查

```text
# 查看 GUI
浏览器打开 http://127.0.0.1:3080

# 启动 web 热更（在 DSH checkout 目录下）
pnpm run dev:web

# 安装插件到 web profile
dsh plugin --profile web add <pkg>

# 查阅 DSH 源码/文档
path/to/dsh-install\node_modules\@deepseek-ai\dsh
```

## 变更记录

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v0.1 | 文档整理 | 初版：标准文件索引 + 工作约定 |
