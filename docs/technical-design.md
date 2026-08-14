# dsh-codex-pet —— 详细技术设计文档

> 版本：v0.1（与 requirements.md v0.1 配套，已评审）
> 关联：开发需求 [requirements.md](requirements.md) · 开发规范 [development-spec.md](development-spec.md) ·
> 资产规范 [asset-spec.md](asset-spec.md) · 执行步骤 [execution-steps.md](execution-steps.md)
> DSH 版本：@deepseek-ai/dsh 0.1.0-rc.6
> 依据：DSH 安装包源码核查（dsh-client-modules / dsh-client-runtime / dsh-client-ui-layout /
> dsh-client-ui-settings-plugins / dsh-cordis-host-runner / dsh-host-webserver / dsh-base 等）

---

## 1. 架构总览

打包插件 = **一个 npm 包**，同时声明两个半：
- **宿主半（Host）**：`dsh.bundle.patch` → 一段 `cordis.patch.yml`，向 profile 组合树 `- insert:` 一个插件行。职责：宠物存储、zip 校验、URL 下载、HTTP 路由（上传/资产服务/管理 API）。
- **客户端半（Client）**：`dsh.client`（inject + platform: "web"），打包为 `window.__ModuleLoader__.load({ id, factory })` 产物。职责：`shell.overlay` 宠物浮层、`settings.section` 图库页、序列帧渲染、交互、状态联动。

### 数据流
```
[Client UI (slots)] --HTTP fetch(同源)--> [Host webServer routes] --> [pet-library service] --> [磁盘 $DSH_HOME/pets]
       ^                                                          |                            |
       |<--- JSON / 资产二进制 <-----------------------------------+----------------------------+
[Client 状态联动] <--useSessions/useProjection 或 host 事件(remote.$on)-- [Agent/Session 宿主状态]
```

### 客户端→宿主通道选择（已定）
不依赖动态插件 harness 机制；打包插件采用 **宿主 webServer HTTP 路由** 作为主通道：
- 同源 fetch（页面即 http://127.0.0.1:3080），上传二进制/下载资产/列表/删除都走 JSON + 原始字节，天然无对象序列化问题。
- `webServer.register(route)` 已核实可用（exact 与 prefix 两类路由，重复路径报错，disposer 随 fiber 卸载）。
- 事件订阅：需要时用 `ctx.remote.$on` 订阅宿主转发事件（见 §6 开放项）。

---

## 2. 仓库/包结构（建议）

```
path/to/dsh-codex-pet\          (workspace 根)
├── requirements.md
├── docs/
│   └── technical-design.md               (本文档)
├── packages/
│   └── dsh-codex-pet/
│       ├── package.json                  # name: dsh-codex-pet；dsh.bundle + dsh.client 声明
│       ├── cordis.patch.yml              # 宿主半插件行（webServer + pet-library）
│       ├── tsdown.config.ts              # 客户端半打包为 ModuleLoader 产物
│       ├── src/
│       │   ├── host/
│       │   │   ├── index.ts              # 宿主插件 apply(ctx)
│       │   │   ├── petLibrary.ts         # 核心服务（纯逻辑，可单测）
│       │   │   ├── storage.ts            # 磁盘布局：写/删/索引/资产读取
│       │   │   ├── zipImport.ts          # zip 解包 + manifest 校验
│       │   │   └── routes.ts             # webServer 路由注册（upload/list/remove/url/static）
│       │   └── client/
│       │       ├── index.ts              # apply(ctx)：注册 slots、styles、locale
│       │       ├── slots/petOverlay.ts   # shell.overlay 注册（宠物浮层）
│       │       ├── slots/petLibraryPage.ts # settings.section 注册（图库页）
│       │       ├── PetPlayer.tsx         # 序列帧播放器（React.createElement，无 JSX 构建约束）
│       │       ├── usePetState.ts        # Agent 状态联动（含降级策略）
│       │       ├── useDrag.ts            # 拖拽 hook（指针事件 + 偏好持久化）
│       │       ├── styles.css            # 主题令牌样式（--dsw-*）
│       │       └── locales/{en.ts, zh.ts}
│       └── README.md
└── examples/
    └── pets/                             # 演示宠物资产（待真实样例，先放自造示例）
```

> 打包/构建规格（spike S0）：客户端半产物必须复刻现成 `lib/client.js` 的
> `window.__ModuleLoader__.load({ id, factory })` 格式（含 CSS 内联 `data-plugin-css` style 标签）。
> 已在安装包中看到完整格式样例，可直接作为打包目标复刻；具体 tsdown 配置在实现期对齐。

---

## 3. 宿主半设计

### 3.1 `cordis.patch.yml`（bundle patch）
```yaml
- insert:
    - id: dsh-pet
      name: 'dsh-codex-pet'
      config:
        # 可选配置项
        petsRoot: !!js dshHomePath('pets')   # 默认 $DSH_HOME/pets
        maxUploadBytes: 52428800             # 50MB
        allowedMimeTypes: [image/png, image/jpeg, image/webp, image/gif]
```

### 3.2 pet-library 服务
`ctx.provide('petLibrary', …)`，方法（全部返回 JSON 安全的标量/结构）：

| 方法 | 入参 | 返回 | 说明 |
| --- | --- | --- | --- |
| `list()` | — | `PetMeta[]` | 已导入宠物元数据（id/name/author/来源/大小/启用态/缩略图 url/动画组清单） |
| `importZip(buffer, meta?)` | zip 字节 | `PetMeta` | 解包→校验 manifest→写入磁盘→索引 |
| `importFromUrl(url)` | url | `PetMeta` | 宿主下载 zip→同 importZip |
| `remove(id)` | id | `{ok}` | 删除宠物目录与索引项 |
| `setActive(id|null)` | id | `{ok}` | 设置当前启用宠物（全局唯一） |
| `getManifest(id)` | id | `PetManifest` | 读取并校验 manifest |
| `assetUrl(id, file)` | id, file | url 字符串 | 生成资产访问 URL（静态路由） |

`PetMeta`：`{ id, name, author?, format, frame, animations: string[], scale, source: 'upload'|'url', sizeBytes, importedAt, active }`
`PetManifest`：见 §5 资产包规范。

### 3.3 存储布局（磁盘）
```
$DSH_HOME/pets/
├── index.json                 # 索引：PetMeta[] + active 指向
└── <pet-id>/
    ├── manifest.json
    └── sprites/…
```
- pet-id 由 manifest.id 规范化（`[a-z0-9-]`，重复导入按"更新覆盖"策略并提示）。
- 资产访问：静态 prefix 路由 `/pet-assets/<pet-id>/<path>` 由 webServer 注册，仅放行 `pets/<pet-id>` 目录内文件（防路径穿越）。

### 3.4 HTTP 路由（webServer.register）
| 方法/路径 | kind | 说明 |
| --- | --- | --- |
| `POST /api/pets/upload` | exact | multipart 或 raw body zip；返回 PetMeta |
| `POST /api/pets/from-url` | exact | `{url}`；宿主下载后导入 |
| `GET /api/pets` | exact | 列表 |
| `POST /api/pets/remove` | exact | `{id}` |
| `POST /api/pets/active` | exact | `{id|null}` |
| `GET /pet-assets/<pet-id>/<path>` | prefix | 资产静态服务 |

### 3.5 校验与安全
- zip 结构白名单校验（仅 manifest.json + sprites/ 下图片），拒绝任意文件（防 zip-slip）。
- manifest 必填字段校验；动画组至少含 idle；帧参数（width/height/fps）为正数。
- 上传大小上限（默认 50MB）、MIME 白名单。
- URL 下载：仅 http/https，宿主侧限流/超时，下载后按同一套校验。

---

## 4. 客户端半设计

### 4.1 `package.json` 的 dsh.client 声明（对齐现成插件惯例）
```jsonc
{
  "dsh": {
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-connection",   // fetch 同源 + 事件
        "@deepseek-ai/dsh-client-runtime",      // client ctx 服务
        "@deepseek-ai/dsh-client-locale",       // i18n（en/zh）
        "@deepseek-ai/dsh-client-ui-slots",     // slots 服务（由依赖插件声明）
        "@deepseek-ai/dsh-client-ui-settings"   // settings.section 声明来源
      ],
      "platform": "web"
    }
  }
}
```
> 具体 inject 集合在 spike S1 以 `ctx.get` 实测为准；`inject` 只列硬依赖。

### 4.2 Slot 注册

**宠物浮层 —— `shell.overlay`（list，scope: root，已核实）**
```js
ctx.slots.inject('shell.overlay', () => ctx.slots.register(
  { name: 'shell.overlay', id: 'dsh-pet', order: 100, label: 'Pet' },
  PetOverlay
))
```
- overlay 是**列表槽位、默认点击穿透**：浮层容器自身必须显式 `pointer-events: auto` 才能接收拖拽/点击。
- 浮层内部：仅渲染当前启用宠物（来自 `/api/pets` 的 active）；无宠物或未启用时渲染 null（不占位）。
- 位置/显隐偏好：走宿主 settings 文档（见 4.5），重启保留。

**图库页 —— `settings.section`（additive，已核实）**
```js
ctx.slots.inject('settings.section', () => ctx.slots.register(
  {
    name: 'settings.section',
    id: 'pets',
    order: 60,
    label: () => t('nav'),
    locale: NS,
    inject: (/* close 等 */) => ({ /* face */ }),
  },
  PetLibraryPage
))
```
- 页面内容：宠物列表（缩略图/名称/来源/动画组）、预览播放、启用/停用、删除、上传按钮、URL 输入。
- 只用本插件自有槽位内部结构，不覆盖其他 section。

### 4.3 序列帧播放器 `PetPlayer.tsx`
- 渲染对象：单张 WebP spritesheet（格式 A）。帧单元 192×208、8 列；帧索引 = 行×8+列；行 = 动画（行数按 [asset-spec.md](asset-spec.md) §5 策略：`frame.rows` → 高度推断 → 默认 9）。
- 播放：单 `<img>` + `background-position` 切片，按**逐帧 ms 时长**推进（[asset-spec.md](asset-spec.md) §2.3），不依赖全局 fps；**隐藏或未启用时停止定时器**（省 CPU）。
- 动画组切换：`usePetState` 输出语义状态 → 按 [asset-spec.md](asset-spec.md) §2.4 映射动画名（idle/running/waiting/review/failed/move/wave/jump）；缺失回退 idle。
- 动作动画（非 idle）：按 §2.3 结构播放主序列 1-3 次后落回 idle。
- 定时器一律走 client 的 timer 服务（`inject: ['timer']`），随生命周期清理，不产生全局定时器。

### 4.4 交互
- **拖拽**：浮层上 pointer 事件（pointerdown/move/up），限制在视口内；结束写入偏好（宿主 settings，防抖）。
- **点击反应**：点击宠物触发一次随机非 idle 动画后回 idle。
- **随机动作**：空闲时按间隔（如 15–30s 随机）播放一次随机动作。
- （说话气泡已移除，用户决定不做。）

### 4.5 偏好持久化（遵循 DSH 规范）
- 宠物位置/显隐/当前启用 id：写入宿主 settings 文档（`settings.section` 页面可改），重启保留；
- 不走 localStorage 明文散落（与 DSH 现有偏好机制一致）。

### 4.6 Agent 状态联动（含降级）
- 目标：空闲/工作(思考)/等待/完成/失败 → idle/running/waiting/review/failed（见 [asset-spec.md](asset-spec.md) §2.4）。
- 状态源候选（spike S2 实测确定）：
  1. 会话槽位标准 props（`useSessions` / `useProjection`）中可用的会话/Agent 状态字段；
  2. 客户端 runtime 的会话服务（`sessions` 相关）读取；
  3. 宿主转发事件 `ctx.remote.$on`（需宿主在转发白名单登记，见 §6）。
- **降级策略**：若实现期确认当前版本无可靠"思考中"状态，则：工作中=有未结算 tool/job 活动（jobsBySession 已确认存在），空闲=无活动；并叠加随机动作，保证体验不空洞。

### 4.7 主题令牌清单（全部用 `--dsw-*`，深浅色自适应）
- 浮层背景：`--dsw-specific-*`、`--dsw-alias-fill-l2`
- 文字：`--dsw-alias-label-primary/secondary/tertiary`
- 边框：`--dsw-alias-border-l2`
- 阴影：`--dsw-shadow-lv3`
- 圆角/间距：对齐 primitives 组件默认
- CSS 经 client 打包内联注入（`data-plugin-css` style 标签），不覆盖产品级样式。

---

## 5. 资产包规范（v0.2 草案，最终以真实样例校准）

一个 zip = 一只宠物。支持两种贴图组织方式：

```
pet.zip
├── manifest.json
└── sprites/
    ├── idle.png                # 方式 A：sprite sheet（rows x cols 网格）
    └── work/                   # 方式 B：逐帧目录（文件名数字序）
        ├── 1.png … N.png
        └── …
```

`manifest.json`：
```jsonc
{
  "id": "unique-pet-id",        // [a-z0-9-]，必填
  "name": "显示名称",            // 必填
  "author": "作者",              // 可选
  "format": "sprite-sheet" | "frame-sequence",  // 必填
  "frame": { "width": 128, "height": 128, "fps": 12 },  // 必填（fps>0）
  "animations": {
    "idle":  { "file": "sprites/idle.png", "rows": 1, "cols": 8 },   // idle 必填
    "work":  { "file": "sprites/work.png",  "rows": 1, "cols": 6 },
    "happy": { "file": "sprites/happy.png", "rows": 1, "cols": 6 },
    "talk":  { "file": "sprites/talk.png",  "rows": 1, "cols": 4 }
    // frame-sequence 时：{ "dir": "sprites/work", "count": 6 }
  },
  "scale": 1.0,                 // 可选，渲染基准缩放
  // (sayings 气泡文案池已移除：用户决定不做气泡)
}
```
- 动画组约定：idle 必填；work/happy/talk 可选，缺省回退 idle。
- **等待用户提供真实 codex 资产样例后按实际字段校准**（v0.1 草案字段可调整）。

---

## 6. 开放项 / 实现前 spike（S0–S3）

| 编号 | 事项 | 说明 |
| --- | --- | --- |
| S0 | 客户端打包格式复刻 | 从安装包 `lib/client.js` 复刻 ModuleLoader 产物 + CSS 内联格式；确认 tsdown 配置与入口 |
| S1 | 客户端→宿主通道 | 验证 `webServer.register` 在 web profile 下的可用性与路由前缀约定；确认同源 fetch 路径（是否需要走 api-proxy/鉴权） |
| S2 | Agent 状态数据源 | 用 `useSessions`/会话服务实测可用的"思考/工作/完成"字段；无则启用降级策略（jobsBySession + 随机） |
| S3 | 客户端插件接入 web 构建 | 确认新客户端插件如何进入 `__DSH_BOOT__` 图：验证 dev:web watcher 是否在跑；安装+重建+刷新 http://127.0.0.1:3080 的全链路 |
| S4 | 资产包格式定稿 | 待用户真实 codex 资产样例 |

## 7. 里程碑与验收

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| M0 | 样例资产到位（用户提供或自造示例） | manifest 定稿 |
| M1 | 包骨架 + 打包链路 + S0/S1/S3 | dev:web 热更后页面出现插件占位 |
| M2 | 宿主半：storage/import/url/routes | curl 上传/列表/删除通过，路径穿越防护生效 |
| M3 | 客户端半：浮层 + 播放器 + 拖拽/点击/随机动作 | 页面渲染宠物动画，可拖拽，点击有反馈 |
| M4 | 图库页（settings.section） | 列表/预览/启用/删除/上传/URL 导入可用 |
| M5 | 状态联动 + 持久化 + 收尾 | 工作/空闲切换动画；重启保留偏好 |

**验收主线（端到端）**：上传/URL 导入一只宠物 → 浮层动画播放 → 拖拽/点击/随机动作 → 图库管理 → Agent 工作/空闲切换动画 → 重启 DSH 后宠物与偏好仍在 → 深色/浅色主题下样式正常。
