/**
 * dsh-codex-pet —— 宿主半（M2：宠物图库 + HTTP 路由）
 *
 * 路由：
 *   GET  /api/pets/health      健康检查
 *   GET  /api/pets             宠物列表 + 当前启用
 *   POST /api/pets/upload      zip 上传（raw body，大小受限）
 *   POST /api/pets/from-url    URL 下载导入（JSON {url}）
 *   POST /api/pets/remove      删除（JSON {id}）
 *   GET/POST /api/pets/active  读取/设置启用宠物
 *   GET  /pet-assets/<id>/<path>  静态资产（安全解析）
 *
 * 遵循开发规范：ctx.effect 注册 + disposer 清理、JSON-only 响应、错误码化。
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { PetLibrary, AssetError, resolveSafe } from "./pet-library.js";

export const name = "dsh-codex-pet";
export const inject = ["webServer"];

export const config = {
  petsRoot: null, // 由 cordis.patch.yml 的 dshHomePath('pets') 注入
  maxUploadBytes: 52428800,
};

const MIME = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".json": "application/json; charset=utf-8",
};

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

function pathOf(req) {
  return new URL(req.url ?? "/", "http://x").pathname;
}

async function readBody(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new AssetError("ASSET_OVER_SIZE", "请求体超过大小上限");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req, maxBytes) {
  const buf = await readBody(req, maxBytes);
  try { return JSON.parse(buf.toString("utf8")); } catch { throw new AssetError("ASSET_INVALID", "JSON 不可解析"); }
}

function resolvePetsRoot(cfg) {
  if (cfg.petsRoot) return cfg.petsRoot;
  const home = process.env.DSH_HOME || join(homedir(), ".dsh");
  return join(home, "pets");
}

function fail(res, e) {
  if (e instanceof AssetError) { json(res, 400, { ok: false, error: { code: e.code, message: e.message } }); return; }
  console.error("[dsh-pet] route error:", e);
  json(res, 500, { ok: false, error: { code: "ASSET_INVALID", message: (e && e.message) || String(e) } });
}

export function apply(ctx, cfg) {
  const webServer = ctx.get("webServer");
  if (webServer === undefined) return;
  const maxBytes = (cfg && cfg.maxUploadBytes) || 52428800;
  const petsRoot = resolvePetsRoot(cfg || {});
  const library = new PetLibrary(petsRoot, { maxUploadBytes: maxBytes });

  ctx.effect(() => {
    library.init().catch((e) => ctx.logger?.warn?.("[dsh-pet] init failed: " + e));
    const offs = [];

    offs.push(webServer.register({
      kind: "exact", path: "/api/pets/health",
      handler: async (_req, res) => json(res, 200, { ok: true, plugin: "dsh-codex-pet", phase: "M2", time: Date.now() }),
    }));

    offs.push(webServer.register({
      kind: "exact", path: "/api/pets",
      handler: async (_req, res) => {
        try {
          const [pets, active] = await Promise.all([library.list(), library.getActive()]);
          json(res, 200, { ok: true, pets, active });
        } catch (e) { fail(res, e); }
      },
    }));

    offs.push(webServer.register({
      kind: "exact", path: "/api/pets/upload",
      handler: async (req, res) => {
        try {
          const buf = await readBody(req, maxBytes);
          const pet = await library.importZip(buf);
          json(res, 200, { ok: true, pet });
        } catch (e) { fail(res, e); }
      },
    }));

    offs.push(webServer.register({
      kind: "exact", path: "/api/pets/from-url",
      handler: async (req, res) => {
        try {
          const body = await readJsonBody(req, maxBytes);
          const url = typeof (body && body.url) === "string" ? body.url : "";
          const pet = await library.importFromUrl(url);
          json(res, 200, { ok: true, pet });
        } catch (e) { fail(res, e); }
      },
    }));

    offs.push(webServer.register({
      kind: "exact", path: "/api/pets/remove",
      handler: async (req, res) => {
        try {
          const body = await readJsonBody(req, maxBytes);
          const id = typeof (body && body.id) === "string" ? body.id : "";
          await library.remove(id);
          json(res, 200, { ok: true, id });
        } catch (e) { fail(res, e); }
      },
    }));

    offs.push(webServer.register({
      kind: "exact", path: "/api/pets/active",
      handler: async (req, res) => {
        try {
          if (req.method === "GET" || req.method === "HEAD") {
            json(res, 200, { ok: true, id: await library.getActive() });
            return;
          }
          const body = await readJsonBody(req, maxBytes);
          const id = typeof (body && body.id) === "string" ? body.id : null;
          await library.setActive(id);
          json(res, 200, { ok: true, id });
        } catch (e) { fail(res, e); }
      },
    }));

    offs.push(webServer.register({
      kind: "prefix", path: "/pet-assets", // 注意：前缀不带尾斜杠（match 要求 startsWith(prefix + "/")）
      handler: async (req, res) => {
        try {
          const pathname = pathOf(req);
          const rel = pathname.slice("/pet-assets/".length);
          const slash = rel.indexOf("/");
          if (slash <= 0) { json(res, 400, { ok: false, error: { code: "ASSET_FILE_MISSING", message: "缺少 id/路径" } }); return; }
          const id = decodeURIComponent(rel.slice(0, slash));
          const rest = rel.slice(slash + 1);
          const file = resolveSafe(petsRoot, id, rest);
          const st = await stat(file);
          if (!st.isFile()) { json(res, 404, { ok: false, error: { code: "ASSET_FILE_MISSING", message: "文件不存在" } }); return; }
          const ext = ((file.match(/\.([a-zA-Z0-9]+)$/) || [])[1] || "").toLowerCase();
          res.writeHead(200, {
            "content-type": MIME["." + ext] || "application/octet-stream",
            "content-length": st.size,
            "cache-control": "public, max-age=3600",
          });
          createReadStream(file).pipe(res);
        } catch (e) {
          if (e && e.code === "ENOENT") { json(res, 404, { ok: false, error: { code: "ASSET_FILE_MISSING", message: "文件不存在" } }); return; }
          fail(res, e);
        }
      },
    }));

    return () => offs.forEach((f) => f());
  }, "dsh-pet: routes");
}