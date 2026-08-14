# Changelog

本项目所有重要变更都会记录在此。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 修复

- 导入兼容「直接压缩宠物文件夹」的 zip（含顶层目录条目 `folder/`）：修复 `写入失败: EEXIST`（`normalizeZipEntries` 去公共前缀时不再被裸目录条目拦住，写入时跳过目录条目）。新增文件夹包裹/混合 zip 回归测试（核心 23 项 + 路由 14 项全 PASS）。

## [0.2.1] - 2026-08-14

### 修复

- 修正安装命令：`dsh plugin add dsh-codex-pet` → `dsh plugin --profile web add dsh-codex-pet`（`dsh plugin` 需要必填 `--profile` 参数）；同步更新仓库与 npm 包内 README。

## [0.2.0] - 2026-08-14

### 新增

- 设置中调整宠物大小：全局缩放滑块（50%~200%，步进 5%），宿主侧 `.prefs.json` 持久化、跨重启保留，缩放带平滑过渡（CSS transform，避免横向抖动/串帧）。
- 新接口 `POST /api/pets/scale`；`GET /api/pets` 返回体新增 `scale` 字段。
- 测试新增：全局缩放设置/读取/越界拒绝（核心 20 项 + 路由 14 项全 PASS）。

## [0.1.0] - 2026-08-14

首个发布版 🐾

### 新增

- 精灵图序列帧播放（格式 A：单 WebP、逐帧毫秒时长、行=动画：idle/running/waiting/review/failed/移动/挥手/跳跃）。
- 悬浮浮层：拖拽（视口钳制 + 位置持久化）、点击挥手、空闲随机小动作。
- 图库管理页（设置 → 宠物图库）：zip 上传 / URL 导入 / 启用 / 停用 / 删除 / 首帧预览。
- Agent 状态联动：工作中→跑动（常驻）；审批/提问→等待、任务完成→得意、任务失败→沮丧（脉冲一次）。
- 深/浅主题自适应（全部 `--dsw-*` 令牌）。
- 测试：核心 16 项 + 路由 10 项（零依赖，运行时合成 WebP）。

### 打包 / 发布

- npm 包 `dsh-codex-pet@0.1.0` 已发布。
- GitHub tag `v0.1.0` + Release。

[0.2.1]: https://github.com/skr311/dsh-codex-pet/releases/tag/v0.2.1
[0.2.0]: https://github.com/skr311/dsh-codex-pet/releases/tag/v0.2.0
[0.1.0]: https://github.com/skr311/dsh-codex-pet/releases/tag/v0.1.0
