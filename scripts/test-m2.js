/**
 * M2 核心逻辑独立测试（不依赖 GUI）：合成示例 zip + 验证 PetLibrary 全部路径。
 * 运行：node scripts/test-m2.js
 * 注：开源仓库不提交真实精灵图；spritesheet 用运行时构造的合法 VP8X 头合成。
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { zipSync } from "../packages/dsh-codex-pet/lib/vendor/fflate.mjs";
import { buildSampleZip } from "./synth-fixture.js";
import {
  PetLibrary, AssetError, webpSize, validateSpritesheet, resolveSafe, ERR,
} from "../packages/dsh-codex-pet/lib/pet-library.js";

const root = process.cwd();
const petsRoot = join(root, ".tmp-test", "pets");
const results = [];
function ok(name, cond, extra = "") {
  results.push((cond ? "PASS" : "FAIL") + "  " + name + (extra ? "  [" + extra + "]" : ""));
  if (!cond) process.exitCode = 1;
}
async function rejects(promise) {
  try { await promise; return null; } catch (e) { return e; }
}

// 1) 合成示例 zip（pet.json + 合成 spritesheet，1536x2288 / 11 行）
const { petJson, sheet, zipBuf } = await buildSampleZip(root);
ok("合成 zip 就绪", zipBuf.length > 30, zipBuf.length + " bytes");

// 2) webpSize 解析合成 spritesheet（应 1536x2288）
const geom = webpSize(new Uint8Array(sheet));
ok("webpSize -> 1536x2288", geom && geom.width === 1536 && geom.height === 2288, JSON.stringify(geom));
const v = validateSpritesheet(new Uint8Array(sheet));
ok("validateSpritesheet rows=11", v.rows === 11, JSON.stringify(v));

// 3) 导入
await rm(petsRoot, { recursive: true, force: true });
const lib = new PetLibrary(petsRoot, { maxUploadBytes: 60 * 1024 * 1024 });
await lib.init();
const meta = await lib.importZip(zipBuf);
ok("importZip ok", !!meta && meta.id === "sample-pet", JSON.stringify(meta && { id: meta.id, displayName: meta.displayName, frame: meta.frame }));
const listed = await lib.list();
ok("list has 1", listed.length === 1 && listed[0].id === "sample-pet", JSON.stringify(listed.map((m) => m.id)));

// 4) 校验错误：坏 zip
const e1 = await rejects(lib.importZip(Buffer.from("not a zip")));
ok("坏 zip -> ASSET_INVALID", e1 && e1.code === ERR.ASSET_INVALID, e1 && e1.code);

// 5) 校验错误：缺 pet.json
const e2 = await rejects(lib.importZip(zipSync({ "spritesheet.webp": new Uint8Array(sheet) })));
ok("缺 pet.json -> ASSET_MISSING_FIELD", e2 && e2.code === ERR.ASSET_MISSING_FIELD, e2 && e2.code);

// 6) 校验错误：坏 id
const badJson = { ...petJson, id: "../evil" };
const e3 = await rejects(lib.importZip(zipSync({ "pet.json": new TextEncoder().encode(JSON.stringify(badJson)), "spritesheet.webp": new Uint8Array(sheet) })));
ok("坏 id -> ASSET_BAD_ID", e3 && e3.code === ERR.ASSET_BAD_ID, e3 && e3.code);

// 7) 穿越条目拒绝
const e4 = await rejects(lib.importZip(zipSync({
  "pet.json": new TextEncoder().encode(JSON.stringify(petJson)),
  "../evil.txt": new TextEncoder().encode("x"),
  "spritesheet.webp": new Uint8Array(sheet),
})));
ok("zip 穿越条目 -> ASSET_PATH_TRAVERSAL", e4 && e4.code === ERR.ASSET_PATH_TRAVERSAL, e4 && e4.code);

// 8) resolveSafe 穿越拒绝
const e5 = await rejects((async () => resolveSafe(petsRoot, "sample-pet", "../../../Windows/win.ini"))());
ok("resolveSafe 穿越拒绝", e5 && e5.code === ERR.ASSET_PATH_TRAVERSAL, e5 && e5.code);
const safePath = resolveSafe(petsRoot, "sample-pet", "sub/spritesheet.webp");
ok("resolveSafe 正常解析", safePath.startsWith(petsRoot) && safePath.includes("sub"), safePath);

// 9) active 设置/读取
await lib.setActive("sample-pet");
ok("setActive/getActive", (await lib.getActive()) === "sample-pet");
const e6 = await rejects(lib.setActive("nope"));
ok("setActive 不存在 -> ASSET_FILE_MISSING", e6 && e6.code === ERR.ASSET_FILE_MISSING, e6 && e6.code);

// 10) remove
await lib.remove("sample-pet");
ok("remove 后 list 为空", (await lib.list()).length === 0);

// 11) URL 导入（起本地 http 服务供 zip）
import { createServer } from "node:http";
const server = createServer((req, res) => {
  if (req.url === "/sample-pet.zip") { res.writeHead(200, { "content-type": "application/zip" }); res.end(zipBuf); }
  else { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const m2 = await lib.importFromUrl("http://127.0.0.1:" + port + "/sample-pet.zip");
ok("importFromUrl ok", !!m2 && m2.id === "sample-pet", m2 && m2.id);
const e7 = await rejects(lib.importFromUrl("file:///etc/passwd"));
ok("URL 协议限制", e7 && e7.code === ERR.ASSET_INVALID, e7 && e7.code);
server.close();

console.log("");
console.log("===== M2 core test results =====");
console.log(results.join("\n"));
const fails = results.filter((r) => r.startsWith("FAIL"));
console.log("\n" + (fails.length === 0 ? "ALL PASS (" + results.length + ")" : "FAILURES: " + fails.length));
