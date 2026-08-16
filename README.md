<p align="center">
  <a href="./README_EN.md">English</a> · <strong>简体中文</strong>
</p>

# dsh-codex-pet

DeepSeek Harness（DSH）桌面宠物插件：导入/上传 codex 风格的**精灵图序列帧宠物**，在 DSH Web GUI 以 `shell.overlay` 悬浮浮层渲染，含图库管理、基础交互与 Agent 状态联动。

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com) [![npm downloads](https://img.shields.io/npm/dm/dsh-codex-pet.svg)](https://www.npmjs.com/package/dsh-codex-pet) [![License: MIT](https://img.shields.io/github/license/skr311/dsh-codex-pet.svg)](LICENSE)

## 📸 预览

<!-- 截图占位 ①：WebUI 页 —— 宠物浮层显示在 DSH Web GUI 左下角（贴着侧边栏，放一张 1280×800 截图） -->
![](docs/assets/screenshot-webui.png)

<!-- 截图占位 ②：设置页 —— 宠物图库（列表 / 上传 / 启用 / 停用 / 删除 / URL 导入） -->
![](docs/assets/screenshot-settings.png)

## ✨ 核心特性

- **序列帧播放**：单 WebP 精灵图（格式 A），逐帧毫秒时长，行=动画（idle / running / waiting / review / failed / 移动 / 挥手 / 跳跃）。
- **悬浮浮层交互**：左下角常驻（贴着侧边栏），可拖拽（视口钳制 + 位置持久化）、点击挥手、空闲随机小动作。
- **图库管理**：设置 → 宠物图库——zip 上传 / URL 导入 / 启用 / 停用 / 删除 / 首帧预览。
- **Agent 状态联动**：订阅 DSH 会话状态——工作中→跑动（常驻）；审批/提问→等待（脉冲一次）；任务完成→得意（脉冲一次）；任务失败→沮丧（脉冲一次）。
- **深/浅主题**：全部样式走 `--dsw-*` 主题令牌，自动适配 DSH 主题。

## 🎮 操作指南

1. 打开 DSH Web GUI（默认 http://127.0.0.1:3080）。
2. **设置 → 宠物图库** → 上传/导入宠物 zip（或从 URL 导入）→ 点「启用」。
3. 左下角出现宠物浮层（贴着侧边栏）：
   - **拖拽**：按住移动，松手后位置自动保存。
   - **点击**：宠物挥手。
   - **Agent 联动**：Agent 干活时宠物跑动；等你确认/回答时发呆一次；任务完成得意一次；失败沮丧一次。
4. 想隐藏宠物：图库页点「停用宠物」。

## 📦 安装

### 方式一：pnpm（推荐）

```sh
dsh plugin --profile web add dsh-codex-pet
```

### 方式二：GitHub clone

```sh
git clone https://github.com/skr311/dsh-codex-pet.git
cd dsh-codex-pet
dsh plugin --profile web add ./packages/dsh-codex-pet
```

安装后**重启 DSH Web GUI**（宿主半改动需重启；客户端 bundle 改完热更免重启），再刷新页面。

## 🛠️ 开发

- **项目结构**：`packages/dsh-codex-pet/`（宿主半 `lib/index.js` + `pet-library.js`；客户端半 `lib/client.js`；vendored `lib/vendor/fflate.mjs`）。
- **测试**（零依赖，纯 Node + vendored fflate）：

  ```sh
  node scripts/test-m2.js
  node scripts/test-m2-routes.js
  ```

- **开发流程**：客户端 bundle 改完 HMR 热更、免重启；宿主半改动需重启 DSH Web GUI。开发规范见 `docs/development-spec.md`，工作指引见 `AGENTS.md`。
- **参与贡献**：见 [CONTRIBUTING.md](CONTRIBUTING.md)。
## 📚 文档

- [docs/README.md](docs/README.md)：标准文件索引；`AGENTS.md`：开发工作指引；[docs/execution-steps.md](docs/execution-steps.md)：里程碑状态。
- 资产格式见 [docs/asset-spec.md](docs/asset-spec.md)。仓库不附带示例精灵图（版权），测试用运行时合成 WebP。

## License

MIT
