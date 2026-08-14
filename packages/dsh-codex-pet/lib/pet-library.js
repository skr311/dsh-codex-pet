/**
 * dsh-codex-pet —— 宠物图库核心（宿主半，纯 Node 可独立测试）
 *
 * 职责：宠物存储管理（petsRoot 目录）、zip 导入/校验、URL 下载导入、
 * 资产安全解析、列表/删除/启用。校验错误码遵循 docs/asset-spec.md §4。
 *
 * 安全红线（asset-spec §4 / 技术设计 §4.2）：
 * - id 白名单 ^[A-Za-z0-9._-]+$；
 * - zip 条目拒绝绝对路径 / '..' 穿越 / 符号链接逃逸；
 * - 总解压体积上限 maxUploadBytes（防 zip 炸弹）；
 * - 资产读取经 resolveSafe 归一化并强制落在 petsRoot 内。
 */
import { mkdir, writeFile, readFile, readdir, stat, rm, rename } from "node:fs/promises";
import { join, dirname, basename, normalize, isAbsolute, sep } from "node:path";
import { unzipSync, strFromU8 } from "./vendor/fflate.mjs";

/** 校验错误码（asset-spec.md §4）。 */
export const ERR = {
  ASSET_MISSING_FIELD: "ASSET_MISSING_FIELD",
  ASSET_FILE_MISSING: "ASSET_FILE_MISSING",
  ASSET_BAD_SPRITESHEET: "ASSET_BAD_SPRITESHEET",
  ASSET_BAD_FRAME: "ASSET_BAD_FRAME",
  ASSET_BAD_ANIMATION: "ASSET_BAD_ANIMATION",
  ASSET_OVER_SIZE: "ASSET_OVER_SIZE",
  ASSET_INVALID: "ASSET_INVALID",
  ASSET_BAD_ID: "ASSET_BAD_ID",
  ASSET_PATH_TRAVERSAL: "ASSET_PATH_TRAVERSAL",
};

export const ID_RE = /^[A-Za-z0-9._-]+$/;
const FRAME_W = 192;
const FRAME_H = 208;

/** 全局宠物大小上下限（设置页滑块 50%~200%）。 */
export const SCALE_MIN = 0.5;
export const SCALE_MAX = 2.0;

/** 构造 AssetError，携带错误码。 */
export class AssetError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "AssetError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

/** 解析 WebP 尺寸（支持 VP8 / VP8L / VP8X 头）。 */
export function webpSize(buf) {
  if (!buf || buf.length < 30) return null;
  const c = (o) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
  if (c(0) !== "RIFF" || c(8) !== "WEBP") return null;
  const fourcc = c(12);
  if (fourcc === "VP8X") {
    const w = buf[24] | (buf[25] << 8) | (buf[26] << 16);
    const h = buf[27] | (buf[28] << 8) | (buf[29] << 16);
    return { width: w + 1, height: h + 1 };
  }
  if (fourcc === "VP8L") {
    const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
    const w = 1 + (b0 | ((b1 & 0x3f) << 8));
    const h = 1 + (((b1 & 0xc0) >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10));
    return { width: w, height: h };
  }
  if (fourcc === "VP8 ") {
    const w = buf[26] | (buf[27] << 8);
    const h = buf[28] | (buf[29] << 8);
    return { width: w & 0x3fff, height: h & 0x3fff };
  }
  return null;
}

/** 校验 pet.json 语义；返回规范化后的元数据。 */
export function validatePetJson(json, fallbackId) {
  if (typeof json !== "object" || json === null) throw new AssetError(ERR.ASSET_MISSING_FIELD, "pet.json 不可解析");
  const id = typeof json.id === "string" && json.id ? json.id : fallbackId;
  if (!id || !ID_RE.test(id)) throw new AssetError(ERR.ASSET_BAD_ID, "id 非法（仅允许字母数字 . _ -）");
  const spritesheetPath = typeof json.spritesheetPath === "string" && json.spritesheetPath ? json.spritesheetPath : "spritesheet.webp";
  const displayName = typeof json.displayName === "string" && json.displayName ? json.displayName : id;
  const description = typeof json.description === "string" ? json.description : "";
  return { id, displayName, description, spritesheetPath, json };
}

/** 安全拼接：把 id/relPath 解析到 root 内绝对路径，拒绝穿越。 */
export function resolveSafe(root, id, relPath) {
  if (!ID_RE.test(id)) throw new AssetError(ERR.ASSET_BAD_ID, "id 非法");
  if (typeof relPath !== "string" || !relPath) throw new AssetError(ERR.ASSET_FILE_MISSING, "路径为空");
  const parts = [];
  for (const seg of relPath.split(/[\\/]+/)) {
    const dec = safeDecode(seg);
    if (dec === "" || dec === ".") continue;
    if (dec === ".." || isAbsolute(dec) || dec.includes(":")) throw new AssetError(ERR.ASSET_PATH_TRAVERSAL, "非法路径段");
    parts.push(dec);
  }
  const target = normalize(join(root, id, ...parts));
  const rootNorm = normalize(root) + sep;
  if (!target.startsWith(rootNorm)) throw new AssetError(ERR.ASSET_PATH_TRAVERSAL, "路径逃逸");
  return target;
}

function safeDecode(seg) {
  try { return decodeURIComponent(seg); } catch { return seg; }
}

/** 校验 WebP spritesheet 尺寸（asset-spec §2.2/§4）。 */
export function validateSpritesheet(bytes) {
  const size = webpSize(bytes);
  if (!size) throw new AssetError(ERR.ASSET_BAD_SPRITESHEET, "非 WebP 或头部损坏");
  const { width, height } = size;
  if (width % FRAME_W !== 0 || height % FRAME_H !== 0) {
    throw new AssetError(ERR.ASSET_BAD_SPRITESHEET, "spritesheet 尺寸 " + width + "x" + height + " 不满足 " + FRAME_W + "x" + FRAME_H + " 帧网格");
  }
  return { width, height, columns: width / FRAME_W, rows: height / FRAME_H };
}

/** 把 zip 条目扁平化：去掉公共顶层目录前缀，返回 {path -> bytes}。 */
export function normalizeZipEntries(entries) {
  const names = Object.keys(entries);
  if (names.length === 0) return {};
  const top = (n) => n.split("/")[0];
  const tops = new Set(names.map(top));
  if (tops.size !== 1) return entries;
  const prefix = [...tops][0] + "/";
  // 仅当顶层目录内确实有内容（前缀后有文件）才扁平化；兼容"直接压缩宠物文件夹"的 zip
  // （含 folder/ 目录条目 + folder/... 文件）。同时丢弃目录条目（不写成空文件）。
  if (!names.some((n) => n.startsWith(prefix) && n.length > prefix.length)) return entries;
  const out = {};
  for (const [k, v] of Object.entries(entries)) {
    if (!k.startsWith(prefix)) { out[k] = v; continue; }
    const key = k.slice(prefix.length);
    if (key === "" || key.endsWith("/")) continue; // 目录条目：由文件写入时的递归 mkdir 创建
    out[key] = v;
  }
  return out;
}
/** 宠物图库。 */
export class PetLibrary {
  constructor(root, opts = {}) {
    if (!root) throw new AssetError(ERR.ASSET_INVALID, "petsRoot 未配置");
    this.root = root;
    this.maxUploadBytes = opts.maxUploadBytes ?? 52428800;
  }

  async init() {
    await mkdir(this.root, { recursive: true });
  }

  /** 列出所有宠物元数据。 */
  async list() {
    let names = [];
    try { names = await readdir(this.root); } catch { return []; }
    const out = [];
    for (const name of names) {
      if (!ID_RE.test(name)) continue;
      const dir = join(this.root, name);
      let st;
      try { st = await stat(dir); } catch { continue; }
      if (!st.isDirectory()) continue;
      const meta = await this.readMeta(name);
      if (meta) out.push(meta);
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  /** 读取单只宠物元数据。 */
  async readMeta(id) {
    try {
      const raw = await readFile(join(this.root, id, "pet.json"), "utf8");
      const meta = validatePetJson(JSON.parse(raw), id);
      const safe = resolveSafe(this.root, id, meta.spritesheetPath);
      const bytes = await readFile(safe);
      const geom = validateSpritesheet(bytes);
      return {
        id: meta.id,
        displayName: meta.displayName,
        description: meta.description,
        spritesheetPath: meta.spritesheetPath,
        frame: geom,
        assetBytes: bytes.length,
      };
    } catch {
      return null;
    }
  }

  /** 从 zip 字节导入一只宠物。 */
  async importZip(buffer, opts = {}) {
    if (buffer.length > this.maxUploadBytes) throw new AssetError(ERR.ASSET_OVER_SIZE, "zip 超过大小上限");
    let entries;
    try { entries = unzipSync(new Uint8Array(buffer)); } catch (e) {
      throw new AssetError(ERR.ASSET_INVALID, "zip 解析失败: " + (e && e.message));
    }
    const flat = normalizeZipEntries(entries);
    const names = Object.keys(flat);
    // zip 炸弹防护：总解压体积
    const total = names.reduce((s, n) => s + flat[n].length, 0);
    if (total > this.maxUploadBytes) throw new AssetError(ERR.ASSET_OVER_SIZE, "解压体积超过上限");
    // 条目安全校验
    for (const n of names) {
      if (isAbsolute(n) || n.split("/").includes("..")) throw new AssetError(ERR.ASSET_PATH_TRAVERSAL, "zip 条目非法: " + n);
      const segs = n.split("/").filter(Boolean);
      if (segs.some((s) => s === ".." || s.includes(":"))) throw new AssetError(ERR.ASSET_PATH_TRAVERSAL, "zip 条目非法: " + n);
    }
    // 找 pet.json
    const petEntry = names.find((n) => basename(n) === "pet.json");
    if (!petEntry) throw new AssetError(ERR.ASSET_MISSING_FIELD, "缺少 pet.json");
    let json;
    try { json = JSON.parse(strFromU8(flat[petEntry])); } catch (e) {
      throw new AssetError(ERR.ASSET_MISSING_FIELD, "pet.json 不可解析");
    }
    const fallbackId = opts.hintId ?? basename(petEntry).replace(/\\.json$/, "");
    const meta = validatePetJson(json, fallbackId);
    // 校验 spritesheet 存在
    const sheetEntry = names.find((n) => n === meta.spritesheetPath || n.endsWith("/" + meta.spritesheetPath));
    if (!sheetEntry || !(flat[sheetEntry] instanceof Uint8Array)) throw new AssetError(ERR.ASSET_FILE_MISSING, "spritesheet 缺失: " + meta.spritesheetPath);
    validateSpritesheet(flat[sheetEntry]);
    // 写入存储（先写临时目录再原子改名，避免半成品）
    const tmp = join(this.root, "." + meta.id + ".tmp");
    await mkdir(this.root, { recursive: true });
    await rm(tmp, { recursive: true, force: true });
    await mkdir(tmp, { recursive: true });
    try {
      for (const [n, bytes] of Object.entries(flat)) {
        if (!(bytes instanceof Uint8Array)) continue;
        if (n === "" || n.endsWith("/")) continue; // 目录条目：文件写入时的递归 mkdir 会创建，无需也绝不能写成文件
        const safe = resolveSafe(this.root, "." + meta.id + ".tmp", n);
        await mkdir(dirname(safe), { recursive: true });
        await writeFile(safe, bytes);
      }
      const final = join(this.root, meta.id);
      await rm(final, { recursive: true, force: true });
      await rename(tmp, final);
    } catch (e) {
      await rm(tmp, { recursive: true, force: true }).catch(() => {});
      if (e instanceof AssetError) throw e;
      throw new AssetError(ERR.ASSET_INVALID, "写入失败: " + (e && e.message), e);
    }
    return this.readMeta(meta.id);
  }

  /** 从 URL 下载 zip 并导入（流式 + 大小上限）。 */
  async importFromUrl(url, opts = {}) {
    let u;
    try { u = new URL(url); } catch { throw new AssetError(ERR.ASSET_INVALID, "URL 非法"); }
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new AssetError(ERR.ASSET_INVALID, "仅支持 http/https URL");
    const res = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new AssetError(ERR.ASSET_INVALID, "下载失败 HTTP " + res.status);
    if (!res.body) throw new AssetError(ERR.ASSET_INVALID, "响应无 body");
    const chunks = [];
    let size = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        size += value.length;
        if (size > this.maxUploadBytes) throw new AssetError(ERR.ASSET_OVER_SIZE, "下载超过大小上限");
        chunks.push(value);
      }
    }
    return this.importZip(Buffer.concat(chunks), opts);
  }

  /** 删除一只宠物。 */
  async remove(id) {
    if (!ID_RE.test(id)) throw new AssetError(ERR.ASSET_BAD_ID, "id 非法");
    const dir = join(this.root, id);
    await rm(dir, { recursive: true, force: true });
    return { ok: true, id };
  }

  /** 设置当前启用宠物。 */
  async setActive(id) {
    if (id) {
      if (!ID_RE.test(id)) throw new AssetError(ERR.ASSET_BAD_ID, "id 非法");
      const st = await stat(join(this.root, id)).catch(() => null);
      if (!st || !st.isDirectory()) throw new AssetError(ERR.ASSET_FILE_MISSING, "宠物不存在: " + id);
    }
    await writeFile(join(this.root, ".active.json"), JSON.stringify({ id: id ?? null }), "utf8");
    return { ok: true, id: id ?? null };
  }

  async getActive() {
    try {
      const raw = await readFile(join(this.root, ".active.json"), "utf8");
      const parsed = JSON.parse(raw);
      return typeof parsed.id === "string" ? parsed.id : null;
    } catch {
      return null;
    }
  }

  /** 读取全局宠物大小（默认 1.0）。 */
  async getScale() {
    try {
      const raw = await readFile(join(this.root, ".prefs.json"), "utf8");
      const parsed = JSON.parse(raw);
      const v = typeof parsed.scale === "number" && Number.isFinite(parsed.scale) ? parsed.scale : 1;
      return v >= SCALE_MIN && v <= SCALE_MAX ? v : 1;
    } catch {
      return 1;
    }
  }

  /** 设置全局宠物大小（0.5–2.0），写入 .prefs.json。 */
  async setScale(v) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < SCALE_MIN || v > SCALE_MAX) {
      throw new AssetError(ERR.ASSET_INVALID, "scale 非法（需在 " + SCALE_MIN + "–" + SCALE_MAX + " 之间）");
    }
    await writeFile(join(this.root, ".prefs.json"), JSON.stringify({ scale: v }), "utf8");
    return { ok: true, scale: v };
  }
}
