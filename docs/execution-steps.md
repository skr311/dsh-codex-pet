# dsh-codex-pet —— 执行步骤（Execution Steps）

> 标准文件：执行步骤 · 状态：进行中
> 当前：**M0–M5 全部完成并验证通过（含深/浅主题、重启持久化）——项目可交付/开源**；
> M6（新需求）：设置中调整宠物大小（全局缩放，宿主侧持久化）——进行中
> 关联：技术设计 [technical-design.md](technical-design.md)（含 §6 开放项/§7 里程碑）

## 1. 当前状态

- [x] 开发需求确认（requirements.md v0.1）
- [x] 技术设计评审（technical-design.md v0.1）
- [x] 真实 codex 资产样例到位（样例宠物，用户提供）
- [x] M0 资产格式分析（按真实样例校准 asset-spec.md v1.0）
- [x] 动画命名/FPS 约定（已从 openai/codex 源码确认并定稿 asset-spec.md v1.1）
- [x] M1 插件骨架 + 打包链路（代码完成、node 校验通过）
- [x] M1 live 激活验证（host 通道 / boot 图 / HMR 热更 + 浮层视觉确认）
- [x] M2 宿主半（pet-library + 7 路由 + vendored fflate；隔离测试 26 项 + 线上实测通过）
- [x] M3 客户端 PetPlayer（样例宠物渲染视觉确认通过）
- [x] M4 图库管理页（settings.section：列表/预览/启用/停用/删除/上传/URL 导入 + 事件桥联动）
- [x] M5 Agent 状态联动 + 持久化 + 主题（sessions.list 快照 + 常驻/脉冲模型；深/浅主题、位置持久化、重启保留全部验证通过）

## 2. 前置 Spike（S0–S4）

| # | 事项 | 完成标志 |
| --- | --- | --- |
| S0 | 客户端打包格式复刻 | 从安装包 `lib/client.js` 复刻 ModuleLoader 产物 + CSS 内联；tsdown 配置通过并产出同格式 bundle |
| S1 | 客户端→宿主 HTTP 通道 | `webServer.register` 在 web profile 可用；同源 fetch 上传/静态资产链路通 |
| S2 | Agent 状态数据源实测 | `useSessions`/`jobsBySession` 可用字段确认；无则启用降级策略并定型 |
| S3 | 客户端插件接入 web 构建 | `pnpm run dev:web` 热更链路全通；`__DSH_BOOT__` 图包含本插件 bundle |
| S4 | 资产格式定稿 | 以真实样例校准 asset-spec.md |

## 3. 里程碑 M0–M5

### M0 资产格式定稿（✅ 基本完成，剩动画约定）
- 步骤：读取用户真实样例（样例宠物）→ 实测 pet.json 字段与 spritesheet 网格（192×208、8×11、行=动画、帧数 [7,8,8,4,5,8,6,6,6,8,8]）→ 校准 asset-spec.md v1.0。
- 剩余：无（动画约定已从 openai/codex `model.rs`/`ambient.rs` 源码确认，定稿于 asset-spec.md §2.3/§2.4）。
- 已完成：样例 manifest `examples/pets/sample-pet/pet.json`（格式示例；**精灵图素材因版权已删除，不随仓库分发**；测试用 `scripts/synth-fixture.js` 运行时合成 WebP）。

### M1 插件骨架 + 打包链路（✅ 完成并激活）
- 产物：`packages/dsh-codex-pet/`（package.json 声明 dsh.bundle + dsh.client、cordis.patch.yml、lib/index.js 宿主半、lib/client.js 客户端半 ModuleLoader 产物）→ node 语法/导入校验通过。
- S0 完成：客户端打包格式复刻（手写 ModuleLoader 工厂，与 @deepseek-ai/dsh-client-* 产物同构）。
- S3 结论：新客户端插件由 dsh-client-modules 运行时扫描宿主 Loader 条目进入 `__DSH_BOOT__` 图，**必须重启 web 应用**才生效；`pnpm run dev:web` 在本环境不存在（npx 缓存无仓库脚本）。
- 安装（用户授权升级沙箱）：pnpm 11.21.0 全局安装；`dsh plugin --profile web add` 成功（bundles 已含 dsh-codex-pet）；GUI 已由用户重启。
- **关键工程点（后续里程碑复用）**：pnpm `file:` 依赖在 profile 内是**静态副本**，已替换为 junction（node_modules/dsh-codex-pet → packages/dsh-codex-pet），使 bundle 编辑即时生效；dsh-client-hmr 每 500ms 轮询，改 bundle 自动触发 rebuilt → 新 rev → 浏览器热更，**免重启**。
- 验证：/api/pets/health 200 `{ok:true,phase:M1}`；boot 图 39 条目含 dsh-codex-pet；HMR rev c8f0dc87aa32 → 327d3caf7657（slots 写法修正已热更）。
- 客户端遵循官方 slots 模式：`inject: ['slots']` + `ctx.slots.inject('shell.overlay', ...)`。
- **剩余**：视觉确认右下角 🐱 dsh-pet 浮层（浏览器已热更；未开页面则刷新一次）。
- 验收：页面右下角出现 🐱 dsh-pet 浮层（显示“M1 链路 OK”）；无控制台错误。

### M2 宿主半（✅ 完成并激活）
- 实现：`packages/dsh-codex-pet/lib/pet-library.js`（PetLibrary 核心：zip 导入/校验/安全解析/URL 下载/激活）+ `lib/index.js`（7 条路由）+ `lib/vendor/fflate.mjs`（vendored 解压库，免新增 profile 依赖）。
- 安全：id 白名单、zip 条目穿越拒绝、总解压体积上限、资产 resolveSafe 归一化、raw-body 大小上限。
- 测试：`scripts/test-m2.js`（核心 16 项）+ `scripts/test-m2-routes.js`（路由 10 项，含真实 match 语义）全 PASS。
- 线上实测：health/list 持久化/active 保留/资产 image/webp 字节一致；**踩坑记录**：prefix 注册**不带尾斜杠**（`/pet-assets`，match 要求 startsWith(prefix+"/")），已修正并被测试锁定。
- 验收：curl 上传/列表/删除/启用通过；白名单与安全校验生效。

### M3 客户端半 · 浮层（✅ 代码完成 + HMR 热更，待视觉确认）
- 实现：`lib/client.js` → `shell.overlay` 注册 → `PetOverlay`（拉取 /api/pets，渲染启用宠物）→ `PetPlayer`：spritesheet 切片（background-position）、逐帧 ms 动画（asset-spec §2.3 缺省表 + 11 行扩展）、拖拽（指针捕获 + 视口钳制 + 位移阈值）、点击挥手、随机动作 15–30s（仅空闲）。
- 格式：格式 A 单 WebP spritesheet（asset-spec 主格式）；格式 B 逐动画 PNG 暂不实现（可选扩展）。
- 热更：HMR rev 30d8cb… → 5e2d874d8ecb；样例宠物已导入并设为启用。
- 验收：页面渲染动画；可拖拽；点击有反馈。（说话气泡已移除：用户决定不做）

### M4 图库管理页（✅ 代码完成 + HMR 热更，待用户测试）
- 实现：`settings.section` 注册（id=pet-library, order=90, label=宠物图库）→ `PetLibraryPage`：列表/预览（首帧缩略图）/启用/删除/zip 上传（raw body）/URL 导入；错误提示与 busy 态。
- 联动：模块级 `petEvents` 事件桥（emitPetChanged/onPetChanged），图库页任何变更后通知浮层重拉列表 → **启用即显示**。
- 热更：rev 5e2d874d… → 12e138d82d4e。
- 验收：图库页全功能可用；与浮层联动（启用即显示）。

### M5 状态联动 + 持久化 + 收尾（✅ 完成并验证）
- S2 spike 定稿：`running`/`pendingInteraction` 为宿主/manager 计算的字段，裸 RPC 缺等待/完成 → 改用 `ctx.sessions.list` 快照 store 订阅（`SnapshotStore.getSnapshot/subscribe`，manager 维护 `byId` 的 running/pendingInteraction + `jobsBySession`）。
- 最终行为（常驻 + 脉冲模型）：常驻 base = `idle`(0)/`running`(7，工作中)；一次性脉冲 = 等待（pendingInteraction 出现→row 6 一次→回 row 7）、完成（running true→false 跳变→row 8 一次→回 idle）、失败（job failed 出现→row 5 一次→回 idle，去重不反复）；优先级 失败>等待>完成。
- 交互不打断：随机小动作仅空闲且 base 动画时触发；拖拽/点击随时可用。
- 偏好持久化：拖拽位置存 `localStorage('dsh-pet:pos')`，刷新/重启保留。
- **踩坑记录**：RPC 返回 `{result:{ok,value:{items}}}` 层级；改 `inject` 声明不随 HMR 生效需刷新页面；pendingInteraction/completed 是客户端 manager 维护、不在裸 RPC。
- 验证：深/浅主题视觉检查通过；重启后宠物与拖拽位置保留；README/AGENTS/asset-spec 已定稿（v1.3）。
- **M0–M5 全部完成，项目可交付/开源。**

### M6 设置中调整宠物大小（✅ 新需求，代码完成待 GUI 验证）
- 需求（用户确认）：全局统一大小；入口在现有「宠物图库」页顶部；控件为滑块 50%~200%（步进 5%，默认 100%）；单个全局值宿主侧持久化、跨重启保留；尺寸变化带平滑过渡。
- 实现：
  - 宿主：`pet-library.js` 新增 `getScale/setScale`（`.prefs.json` 存 `{scale}`，校验 0.5–2.0）+ `index.js` 新增 `POST /api/pets/scale` 路由、`GET /api/pets` 返回体带 `scale`。
  - 客户端：`PetPlayer` 缩放用 CSS `transform: scale()`（贴图保持自然尺寸、帧动画仍瞬切，仅 `transform` 过渡；修复了 width/height/background-size 过渡与 background-position 瞬跳不同步导致的横向抖动/串帧）；视觉尺寸做视口钳制（left/top 锚点，默认右下角锚定 (24,24)）；图库页顶部滑块实时预览（模块级 scale 共享状态推给浮层）+ 300ms 防抖写宿主；`petEvents` 事件桥联动。
- 验证：隔离测试更新（路由 7→8 + scale 用例）；node 语法校验；GUI 需重启一次后拖滑块看浮层实时缩放、放大后钳制、重启保留。

## 4. 后续启动动作

1. ~~读取样例 → 校准 asset-spec.md（M0）~~ 已完成。
2. ~~确认动画命名/FPS 约定~~ 已完成（openai/codex 源码核对，asset-spec.md v1.1 定稿）。
3. 整理样例 manifest（`examples/pets/sample-pet/pet.json`）→ 启动 `packages/dsh-codex-pet` 骨架（M1）；精灵图素材不随仓库分发（版权）。
4. 启动 `pnpm run dev:web` 验证热更链路（S3）。
5. 依次推进 M2→M5，每里程碑完成即更新本文件任务勾选。

## 5. 变更记录

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v0.4 | 新需求 | M6 宠物大小调整：全局缩放（图库页滑块 50%~200%）+ 宿主 `.prefs.json` 持久化 + `POST /api/pets/scale` 路由 + 客户端统一缩放渲染/越界钳制/过渡动画 |
| v0.3 | 开源定稿 | 删除样例精灵图素材（版权原因，不随仓库分发）；测试改用运行时合成 WebP（`scripts/synth-fixture.js`） |
| v0.2 | 开源整理 | 样例宠物更名 sample-pet（zip 重生成）；去除具体宠物名与本机路径 |
| v0.1 | 文档整理 | 初版：spike 清单 + 里程碑 M0–M5 + 任务状态 |
