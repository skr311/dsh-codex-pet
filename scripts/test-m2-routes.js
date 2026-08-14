/**
 * M2 路由层隔离测试：假 ctx/webServer 捕获路由，假 req/res 驱动，端到端验证。
 * 运行：node scripts/test-m2-routes.js
 * 注：开源仓库不提交真实精灵图；spritesheet 用运行时构造的合法 VP8X 头合成。
 */
import { Readable, Writable } from "node:stream";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:http";
import { apply } from "../packages/dsh-codex-pet/lib/index.js";
import { buildSampleZip } from "./synth-fixture.js";

const root = process.cwd();
const petsRoot = join(root, ".tmp-test", "routes-pets");
await rm(petsRoot, { recursive: true, force: true });

const routes = new Map();
const fakeWebServer = {
  register(route) { routes.set(route.kind + "|" + route.path, route.handler); return () => routes.delete(route.kind + "|" + route.path); },
};
// 复刻 dsh-host-webserver 的 match 语义（exact 优先，prefix 最长匹配且要求 startsWith(prefix + "/")）
function matchPath(pathname) {
  if (routes.has("exact|" + pathname)) return { route: routes.get("exact|" + pathname), kind: "exact" };
  let best = null, bestLen = -1;
  for (const [key, route] of routes) {
    if (!key.startsWith("prefix|")) continue;
    const prefix = key.slice(7);
    if (pathname !== prefix && !pathname.startsWith(prefix + "/")) continue;
    if (prefix.length > bestLen) { best = route; bestLen = prefix.length; }
  }
  return best ? { route: best, kind: "prefix" } : null;
}
let dispose = null;
const ctx = {
  get(name) { return name === "webServer" ? fakeWebServer : undefined; },
  effect(fn) { dispose = fn(); },
  logger: { warn: () => {}, info: () => {} },
};
apply(ctx, { petsRoot, maxUploadBytes: 52428800 });

const results = [];
function ok(name, cond, extra = "") {
  results.push((cond ? "PASS" : "FAIL") + "  " + name + (extra ? "  [" + extra + "]" : ""));
  if (!cond) process.exitCode = 1;
}

async function drive(method, path, body) {
  const handler = routes.get("exact|" + path);
  const req = Object.assign(Readable.from(body ? [body] : []), { url: path, method });
  const chunks = [];
  const res = new Writable({ write(c, e, cb) { chunks.push(Buffer.from(c)); cb(); } });
  res.writeHead = (status, headers) => { res._status = status; res._headers = headers || null; };
  res._status = null; res._headers = null;
  const done = new Promise((r) => res.on("finish", r));
  await handler(req, res);
  await done;
  let text = Buffer.concat(chunks).toString("utf8");
  let jsonBody = null;
  try { jsonBody = JSON.parse(text); } catch {}
  return { status: res._status, headers: res._headers, text, json: jsonBody, bytes: Buffer.concat(chunks) };
}

async function driveAsset(path) {
  const m = matchPath(path);
  const handler = m ? m.route : null;
  if (!handler) return { status: "NO-MATCH", headers: null, bytes: Buffer.alloc(0) };
  const req = Object.assign(Readable.from([]), { url: path, method: "GET" });
  const chunks = [];
  const res = new Writable({ write(c, e, cb) { chunks.push(Buffer.from(c)); cb(); } });
  res.writeHead = (status, headers) => { res._status = status; res._headers = headers || null; };
  res._status = null; res._headers = null;
  const done = new Promise((r) => res.on("finish", r));
  await handler(req, res);
  await done;
  return { status: res._status, headers: res._headers, bytes: Buffer.concat(chunks) };
}

// 0) 路由注册数量
ok("路由已注册 8 条", routes.size === 8, String(routes.size));

// 1) health
const h = await drive("GET", "/api/pets/health");
ok("health 200 ok", h.status === 200 && h.json && h.json.ok === true, h.text.slice(0, 60));

// 2) 上传合成 sample-pet.zip
const { zipBuf, sheetLen } = await buildSampleZip(root);
const up = await drive("POST", "/api/pets/upload", zipBuf);
ok("upload 200 id=sample-pet", up.status === 200 && up.json && up.json.ok && up.json.pet.id === "sample-pet", JSON.stringify(up.json && up.json.pet && { id: up.json.pet.id, frame: up.json.pet.frame }));

// 3) 列表
const list = await drive("GET", "/api/pets");
ok("list 1 pet + active", list.json && list.json.ok && list.json.pets.length === 1 && list.json.active === null, JSON.stringify(list.json && { n: list.json.pets.length, active: list.json.active }));

// 3b) 全局宠物大小 scale：默认 1.0 → 设置 1.5 → 列表回读 1.5；越界拒绝
ok("list 默认 scale 1.0", list.json && list.json.scale === 1, JSON.stringify(list.json && list.json.scale));
const setSc = await drive("POST", "/api/pets/scale", Buffer.from(JSON.stringify({ scale: 1.5 })));
ok("set scale 200 ok=1.5", setSc.status === 200 && setSc.json && setSc.json.ok && setSc.json.scale === 1.5, JSON.stringify(setSc.json));
const listSc = await drive("GET", "/api/pets");
ok("list 回读 scale 1.5", listSc.json && listSc.json.scale === 1.5, JSON.stringify(listSc.json && listSc.json.scale));
const badSc = await drive("POST", "/api/pets/scale", Buffer.from(JSON.stringify({ scale: 9.9 })));
ok("set scale 越界 -> ASSET_INVALID", badSc.status === 400 && badSc.json && badSc.json.error && badSc.json.error.code === "ASSET_INVALID", JSON.stringify(badSc.json && badSc.json.error));

// 4) 资产服务（合成 spritesheet 字节一致）
const asset = await driveAsset("/pet-assets/sample-pet/spritesheet.webp");
ok("asset 200 webp 与原文件一致", asset.status === 200 && asset.headers["content-type"] === "image/webp" && asset.bytes.length === sheetLen, asset.status + " " + (asset.headers && asset.headers["content-type"]) + " len=" + asset.bytes.length + " expect=" + sheetLen);

// 5) 资产穿越
const trav = await driveAsset("/pet-assets/sample-pet/../../package.json");
ok("asset 穿越 400", trav.status === 400, String(trav.status));

// 6) active
const setA = await drive("POST", "/api/pets/active", Buffer.from(JSON.stringify({ id: "sample-pet" })));
const getA = await drive("GET", "/api/pets/active");
ok("active set/get", setA.status === 200 && getA.json && getA.json.id === "sample-pet", JSON.stringify(getA.json));

// 7) from-url
const server = createServer((req, res) => { if (req.url === "/sample-pet.zip") { res.writeHead(200, { "content-type": "application/zip" }); res.end(zipBuf); } else { res.writeHead(404); res.end(); } });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
await drive("POST", "/api/pets/remove", Buffer.from(JSON.stringify({ id: "sample-pet" })));
const fu = await drive("POST", "/api/pets/from-url", Buffer.from(JSON.stringify({ url: "http://127.0.0.1:" + port + "/sample-pet.zip" })));
ok("from-url 导入 ok", fu.status === 200 && fu.json && fu.json.ok && fu.json.pet.id === "sample-pet", JSON.stringify(fu.json && fu.json.pet && fu.json.pet.id));
server.close();

// 8) remove
const rmRes = await drive("POST", "/api/pets/remove", Buffer.from(JSON.stringify({ id: "sample-pet" })));
const list2 = await drive("GET", "/api/pets");
ok("remove 后为空", rmRes.status === 200 && list2.json && list2.json.pets.length === 0, JSON.stringify(list2.json && list2.json.pets.length));

// 9) 上传超大（超 52MB 上限）
const big = Buffer.alloc(53 * 1024 * 1024, 1);
const ov = await drive("POST", "/api/pets/upload", big);
ok("超大上传 -> ASSET_OVER_SIZE", ov.json && ov.json.error && ov.json.error.code === "ASSET_OVER_SIZE", JSON.stringify(ov.json && ov.json.error));

console.log("");
console.log("===== M2 route test results =====");
console.log(results.join("\n"));
const fails = results.filter((r) => r.startsWith("FAIL"));
console.log("\n" + (fails.length === 0 ? "ALL PASS (" + results.length + ")" : "FAILURES: " + fails.length));
if (dispose) dispose();
