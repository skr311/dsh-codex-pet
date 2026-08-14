/**
 * 合成测试夹具：开源仓库不提交任何真实精灵图素材（无版权风险）。
 * 运行时构造"仅含合法 VP8X 头"的合成 WebP（webpSize 可解析），并组装示例 zip。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { zipSync } from "../packages/dsh-codex-pet/lib/vendor/fflate.mjs";

/** 构造一个仅含合法 RIFF/WEBP/VP8X 头的合成 WebP（任意尺寸，webpSize 可解析）。 */
export function synthWebP(width, height) {
  const buf = new Uint8Array(30);
  const set4 = (o, s) => { for (let i = 0; i < 4; i++) buf[o + i] = s.charCodeAt(i); };
  set4(0, "RIFF");
  buf[4] = 30 - 8; buf[5] = 0; buf[6] = 0; buf[7] = 0; // RIFF size
  set4(8, "WEBP");
  set4(12, "VP8X");
  buf[16] = 10; buf[17] = 0; buf[18] = 0; buf[19] = 0; // chunk size
  const w = width - 1, h = height - 1;
  buf[24] = w & 0xff; buf[25] = (w >> 8) & 0xff; buf[26] = (w >> 16) & 0xff;
  buf[27] = h & 0xff; buf[28] = (h >> 8) & 0xff; buf[29] = (h >> 16) & 0xff;
  return buf;
}

/** 读取样例 manifest（仅 JSON 格式示例，无图片素材）。 */
export async function samplePetJson(root) {
  return JSON.parse(await readFile(join(root, "examples", "pets", "sample-pet", "pet.json"), "utf8"));
}

/** 构造合成示例 zip（pet.json + 合成 spritesheet.webp）。 */
export async function buildSampleZip(root, opts = {}) {
  const width = opts.width || 1536;
  const height = opts.height || 2288;
  const petJson = await samplePetJson(root);
  const sheet = synthWebP(width, height);
  const zipBuf = zipSync({
    "pet.json": new TextEncoder().encode(JSON.stringify(petJson)),
    "spritesheet.webp": new Uint8Array(sheet),
  });
  return { petJson, sheet, sheetLen: sheet.length, zipBuf };
}
