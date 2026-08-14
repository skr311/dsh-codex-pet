# dsh-codex-pet

A **desktop pet** plugin for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness): import Codex-style sprite-sheet pets and render them in the DSH Web GUI as a floating `shell.overlay` — with a pet library, interactions, and live Agent-state linkage.

## Install

```sh
dsh plugin add dsh-codex-pet
```

Then restart the DSH Web GUI (host-side change) and refresh the page. Upload your own pet zip (see the asset format below) in **Settings → Pet Library**.

## Features

- Sprite-sheet (Format A) sequence playback: per-frame ms timing, row = animation.
- Draggable floating overlay, click to wave, idle random antics, dark/light theme (all `--dsw-*` tokens).
- Pet library: zip upload / URL import / enable / disable / delete / preview.
- Agent-state linkage: working → run; approval/question → waiting; task done → happy; task failed → sad.

## Asset format (Format A)

zip = `pet.json` + `spritesheet.webp` (192×208 frame, 8 columns, row = animation). See the full spec in the [repository docs](https://github.com/skr311/dsh-codex-pet/blob/main/docs/asset-spec.md).

## Docs

- Repo: https://github.com/skr311/dsh-codex-pet (README / README_EN / docs, Chinese primary)

## License

MIT
