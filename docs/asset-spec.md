# dsh-codex-pet —— 资产包格式规范（Asset Spec）

> 标准文件：资产包格式 · 状态：**v1.1 定稿**（动画约定已依据 openai/codex 源码确认）
> 关联：开发需求 [requirements.md](requirements.md) §4 · 技术设计 [technical-design.md](technical-design.md) §5
> 依据：样例 manifest `examples/pets/sample-pet/pet.json`（仅 JSON 格式示例；**精灵图素材因版权不随仓库分发**）+ openai/codex 仓库（行→动画、帧时长依据）
> `codex-rs/tui/src/pets/{catalog,model,ambient}.rs`（官方读取器/动画约定）

## 1. 总则

- 一个 zip/目录 = 一只宠物。
- **主格式（已确认）：格式 A —— `pet.json` + 单张 spritesheet WebP**。
- **兼容 zip 内带顶层文件夹包裹**（含 `folder/` 目录条目，如直接压缩宠物文件夹所得）：导入时自动去掉公共目录前缀、跳过目录条目（2026-08-14 修复 EEXIST）。
- 原草案"逐动画 PNG + 富 manifest"降级为可选扩展（格式 B，未经验证）。

## 2. 格式 A：pet.json + spritesheet（主格式）

### 2.1 pet.json 完整 schema（来自 codex CLI `model.rs` PetFile）

| 字段 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | string | 否* | 目录名 | 唯一标识（样例宠物含 `spriteVersionNumber`，CLI 不读取、仅信息字段） |
| `displayName` | string | 否* | id | 显示名称 |
| `description` | string | 否 | "" | 描述 |
| `spritesheetPath` | string | 否 | "spritesheet.webp" | 相对路径，必须在宠物目录内（防穿越） |
| `frame.width` | number | 否 | 192 | 帧宽 |
| `frame.height` | number | 否 | 208 | 帧高 |
| `frame.columns` | number | 否 | 8 | 列数 |
| `frame.rows` | number | 否 | 9 | 行数 |
| `animations.<name>.frames` | number[] | 否 | 默认表 | 精灵帧索引（= 行×列数+列） |
| `animations.<name>.fps` | number | 否 | 8.0 | 统一帧率（0<x≤60）；与逐帧时长二选一 |
| `animations.<name>.loop` | bool | 否 | true | loop_start=0 |
| `animations.<name>.fallback` | string | 否 | "idle" | 单次动画结束后的回退动画 |

* 实际最少只需 `spritesheetPath`；其余均有默认。真实样例：
```json
{"id":"sample-pet","displayName":"示例宠物","description":"示例精灵图序列帧宠物，用于演示资产包格式。","spriteVersionNumber":2,"spritesheetPath":"spritesheet.webp"}
```

### 2.2 spritesheet 布局（官方约定 + 实测确认）

- 格式：WebP（建议无损 VP8L），**带 alpha 透明通道**。
- 帧单元：**192 × 208**；**8 列**；帧索引 = 行×8 + 列（行优先）。
- 标准网格：**9 行** → 1536 × 1872（codex CLI 默认**且内置宠物硬校验**：`validate_app_spritesheet_dimensions` 要求恰好此尺寸）；**扩展网格**：行数可变（样例宠物为 11 行 → 1536 × 2288，行 9/10 为 codex 目录未定义的额外行）。
- **每行 = 一个动画**；各行动画帧数不固定，行内右侧空单元 = 该动画帧数不足整行（渲染器按帧数截断）。
- 样例宠物实测各行帧数：**[7, 8, 8, 4, 5, 8, 6, 6, 6, 8, 8]**（行 0 标准 idle 用 6 帧，第 7 格为冗余）。

### 2.3 动画约定（定稿，来自 codex CLI `default_animations`）

| 动画名 | 别名 | 行 | 帧数 | 帧时长 ms（末帧） | 结构/说明 |
| --- | --- | --- | --- | --- | --- |
| idle | — | 0 | 6 | 1680/660/660/840/840/1920 | 循环（loop_start=0），常驻默认 |
| running-right | move_right | 1 | 8 | 120（末 220） | 向右移动 |
| running-left | move_left | 2 | 8 | 120（末 220） | 向左移动 |
| waving | wave | 3 | 4 | 140（末 280） | 挥手/打招呼 |
| jumping | bounce | 4 | 5 | 140（末 280） | 跳跃 |
| failed | sad | 5 | 8 | 140（末 240） | 失败/沮丧 |
| waiting | — | 6 | 6 | 150（末 260） | 等待/需输入 |
| running | — | 7 | 6 | 120（末 220） | 运行中/思考 |
| review | — | 8 | 6 | 150（末 280） | 就绪/待审阅 |
| （非 codex）jump-down | — | 9 | 8 | — | 11 行样例特有；codex 目录未定义，本播放器可选扩展：下坠 |
| （非 codex）jump-up | — | 10 | 8 | — | 11 行样例特有；codex 目录未定义，本播放器可选扩展：弹起 |

- 非 idle 动画结构（官方，`app_state_animation`）：主序列 ×3 → 衔接 idle 尾部，`loop_start = 3×帧数`，`fallback=idle`（动作播放后落回 idle）。
- 渲染器简化策略：播放主序列（可循环 1-3 次）后落回 idle；时长采用**逐帧 ms**（非全局 fps），`fps` 字段仅作统一时长捷径。
- **重要（行 9/10）**：codex 官方 `default_animations` 仅定义行 0-8，内置宠物硬校验为 9 行（1536×1872）。行 9/10 不出现在任何 codex 动画定义中，仅是 11 行样例精灵图多出的行；本播放器把行 9/10 映射为 jump-down/jump-up（目测为跳跃帧）作为**可选扩展**，非 codex 行为。

### 2.4 语义状态→动画映射（来自 `ambient.rs` PetNotificationKind）

| 语义状态 | 动画名 | 行 |
| --- | --- | --- |
| 空闲/无活动 | idle | 0 |
| 工作中/思考中（Running） | running | 7 |
| 等待输入/阻塞中（Waiting） | waiting | 6 |
| 就绪/待审阅（Review） | review | 8 |
| 失败/出错（Failed） | failed | 5 |
| 交互：移动/拖拽 | running-right / running-left | 1 / 2 |
| 交互：点击/打招呼 | waving | 3 |
| 交互：跳跃/兴奋 | jumping | 4 |

**本插件实际行为（web UI 版，v1.3 定稿）——常驻 base + 一次性脉冲：**

- 常驻 base（循环）：`idle`(0) / `running`(7，工作中)。
- 一次性脉冲（状态跳变时播一遍，随后落回 base 动画）：
  - 等待（`pendingInteraction` 出现：审批/提问/plan-review）→ `waiting`(6) 一次 → 回 `running`(7)（任务仍在跑）。
  - 完成（会话 `running true→false` 跳变）→ `review`(8) 一次 → 回 `idle`(0)。
  - 失败（任一 job `status="failed"` 出现）→ `failed`(5) 一次 → 回 `idle`(0)；失败持续存在时不重复播放。
- 优先级：失败 > 等待 > 完成；同一次跳变只播一个脉冲。
- 数据源：`sessions.list` 快照 store（manager 维护 `byId` 的 running/pendingInteraction + `jobsBySession`）。
- 交互（拖拽/点击/随机动作）仅在 base 动画上触发，不打断脉冲。

## 3. 格式 B：逐动画 PNG（扩展/可选，原草案）

- 结构：`manifest.json` + `sprites/<anim>.png`（sprite sheet）或 `<anim>/*.png`（逐帧）。
- 状态：无真实样例验证；优先级低于格式 A。

## 4. 导入校验（错误码）

| 错误码 | 触发条件 |
| --- | --- |
| ASSET_MISSING_FIELD | pet.json 不可解析 / 必填（spritesheetPath）缺失 |
| ASSET_FILE_MISSING | spritesheetPath 文件缺失或逃逸出宠物目录 |
| ASSET_BAD_SPRITESHEET | 非 WebP / 无 alpha / 尺寸与网格不符（宽必须整除 192、高必须整除 208；若 manifest 提供 `frame` 则必须精确覆盖） |
| ASSET_BAD_FRAME | frame 字段非法（0 值、溢出、帧数 >256） |
| ASSET_BAD_ANIMATION | animations 引用了越界帧索引 / fps 非法 / fallback 不存在 |
| ASSET_OVER_SIZE | 超过上传大小上限（默认 50MB） |
| ASSET_INVALID | 其他 |

## 5. 渲染器取值策略

- 行数：优先 `frame.rows`；否则由 spritesheet 高度推断（高/208，必须整除）；否则默认 9。
- 动画：优先 manifest `animations`；否则用 §2.3 默认表（行 0-8），11 行扩展表自动附加 jump-down/jump-up。
- **用户缩放**：全局宠物大小（设置页滑块 50%~200%，见 requirements.md FR-2.3）是**渲染端用户偏好**，不属于资产字段，渲染时对帧单元/贴图整体等比缩放，叠加在资产基准尺寸之上。

## 6. 变更记录

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v1.5 | 修复 | 兼容含顶层目录条目 `folder/` 的文件夹包裹 zip（导入去公共前缀 + 跳过目录条目，修复 EEXIST） |
| v1.4 | 需求变更 | 新增说明：全局用户缩放为渲染端偏好（非资产字段），叠加于资产基准尺寸之上 |
| v1.3 | 源码复核 | 修正行 9/10 标注：codex `default_animations` 仅定义行 0-8，内置宠物硬校验 9 行（1536×1872）；行 9/10 为 11 行样例特有、codex 不触发，jump-down/jump-up 仅为本播放器可选扩展 |
| v1.2 | 开源整理 | 样例宠物更名为通用名 `sample-pet`（原专用名仅用于本地校准）；全文样例引用泛化，去除具体宠物名与本机路径 |
| v1.1 | 源码核对后 | 动画约定定稿：依据 openai/codex `model.rs`/`ambient.rs` 确认行→动画、帧时长、loop/fallback、状态映射；补充完整 pet.json schema 与扩展行支持 |
| v1.0 | 样例到位后 | 按样例宠物校准主格式；实测帧网格 192×208、8×11 |
| v0.2 | 文档整理 | 草案（逐动画 PNG） |
| v0.1 | 需求阶段 | 初版草案 |