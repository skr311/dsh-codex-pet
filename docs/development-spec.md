# dsh-codex-pet —— 开发规范（Development Spec）

> 标准文件：开发规范 · 状态：v0.1 · **每次编码前必读**
> 关联：技术设计 [technical-design.md](technical-design.md) · 开发需求 [requirements.md](requirements.md)

## 1. 适用范围与总原则

- 本项目所有代码（宿主半 + 客户端半 + 打包/构建）必须遵守本文档及 DSH 官方插件规范。
- 总原则：**最小改动、窄入口、规范优先于便利、文档与代码同步**。

## 2. DSH 插件设计规范（本项目遵循项）

### 2.1 客户端 Slot 注册
- 先查询实际 Slot 契约（实现期以 `ctx.get('slots')` 实测为准），再 `slots.inject(name, () => slots.register(...))` 注册。
- 本项目使用槽位：
  - `shell.overlay`（list，scope root）——宠物浮层。**默认点击穿透**，浮层内容必须显式 `pointer-events: auto` 才能接收拖拽/点击。
  - `settings.section`（additive）——图库管理页。注册 `{ name, id, order, label, locale, inject, children }`。
- **禁止**：注册到会被整体替换的 root/sidebar/conversation/details 等整块槽位；不得覆盖产品 UI。

### 2.2 主题令牌
- 颜色/阴影/字体一律用 `--dsw-*` 令牌（`--dsw-alias-*`、`--dsw-specific-*`、`--dsw-shadow-*`、`--dsw-font-*`），**不写死色值**，深浅色自适应。
- CSS 经 client 打包内联注入（`data-plugin-css` style 标签），不覆盖产品级样式。

### 2.3 组件
- 优先复用 `@deepseek-ai/dsh-client-ui-primitives`。
- 自定义组件用 `React.createElement(...)`（打包产物为 CJS 工厂：**不支持 JSX/TypeScript/import**）。

### 2.4 生命周期
- 所有订阅/定时器/路由/槽位注册必须持有 disposer 并随 fiber 卸载。
- 定时器一律走 `timer` 服务并声明 `inject: ['timer']`。
- **禁止**模块级/页面级全局副作用（document.body/window 操作、全局 setTimeout 等）。

### 2.5 客户端→宿主通道
- 本项目采用宿主 `webServer` HTTP 路由（同源 fetch），见 [technical-design.md](technical-design.md) §3.4。
- 参数与返回仅 JSON 标量/结构；二进制走 HTTP body 或静态资产路由。

### 2.6 宿主 bundle patch
- `dsh.bundle.patch` 指向 `cordis.patch.yml`，以 `- insert:` 添加插件行；除非明确需要，不改动既有行的 config。

## 3. 工程约束（关键）

| 项 | 值 |
| --- | --- |
| GUI 地址 | http://127.0.0.1:3080 |
| DSH 安装/依赖（仅查阅/扩展 DSH 本身） | path/to/dsh-install |
| 客户端插件生效 | 需重建 web 产物：本 checkout 下 `pnpm run dev:web`（热更）或 rebuild + 刷新页面 |
| 验证方式 | 启动 watcher → 刷新 GUI → 确认插件 bundle 进入 `__DSH_BOOT__` 图 |
| dev:web 未运行时 | 改动不会自动生效，**不要承诺自动更新** |

## 4. 代码规范

- TypeScript（erasable-only：无 enum/namespace）；客户端产物为 CJS 工厂格式。
- 数据：只取最小叶子字段；**不**对内部对象 JSON.stringify/structuredClone；RPC 只传 JSON。
- 错误：宿主侧返回结构化错误（`{ code, message }`）；客户端给出可读提示。
- 命名：宿主服务/路由/方法按 [technical-design.md](technical-design.md) §3 约定；文件/组件 kebab/lowercase。
- 格式：2 空格缩进；注释说明"为什么"而非"是什么"。

## 5. 目录与命名规范

见 [technical-design.md](technical-design.md) §2（`packages/dsh-codex-pet` 结构：src/host 与 src/client 分离）。

## 6. 文档同步规范

- 任何改动影响需求/设计/规范时，同步更新对应 docs/*.md 并记录到该文件的变更记录表。
- `AGENTS.md` 保持索引与工作说明最新。
- 文档优先级：标准文件 > 代码注释 > 口头约定。

## 7. 安全与性能规范

- zip 白名单解包、路径穿越防护、上传大小上限（默认 50MB）、URL 下载仅 http/https。
- 动画仅在启用且可见时运行定时器；隐藏即停止。

## 8. 变更记录

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v0.1 | 文档整理 | 初版：从 DSH 源码/内置 skill 提取的规范要点固化为标准文件 |
