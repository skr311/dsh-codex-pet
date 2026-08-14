# Contributing

Thanks for your interest in dsh-codex-pet!

## Prerequisites

- Node.js ≥ 20, pnpm (for DSH install), a DeepSeek Harness (DSH) web profile.
- Local dev loop: client bundle changes hot-reload via DSH client HMR (no restart); host-side changes need a DSH web GUI restart.

## Project layout

- `packages/dsh-codex-pet/` — the plugin package (host half `lib/index.js` + `pet-library.js`; client half `lib/client.js`; vendored `lib/vendor/fflate.mjs`).
- `docs/` — standard docs (Chinese): requirements, technical design, development spec, asset spec, execution steps.
- `scripts/` — tests (`test-m2.js`, `test-m2-routes.js`, synthetic fixture `synth-fixture.js`), install helper (`install-plugin.ps1`).
- `examples/pets/sample-pet/pet.json` — manifest format example (no sprite bundled; copyright).

## Running tests

Zero dependencies (Node built-ins + vendored fflate):

```sh
node scripts/test-m2.js
node scripts/test-m2-routes.js
```

## Guidelines

- Read `docs/development-spec.md` before coding (DSH plugin conventions: narrow slot entry, `--dsw-*` theme tokens, lifecycle disposal, JSON-only RPC).
- Keep the repo open-source clean: no copyrighted sprite assets, no machine-specific paths, no private pet names.
- Update the standard docs when behavior changes (see `docs/` and `AGENTS.md`).

## Commits

- Conventional Commits style (e.g., `feat:`, `fix:`, `docs:`).

## License

MIT — see [LICENSE](LICENSE).
