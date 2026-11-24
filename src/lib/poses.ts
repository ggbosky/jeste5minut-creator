// Předklíčování póz avatara (zelené pozadí #00FF00 → průhlednost). Dělá se jednou při nahrání.
import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import fs from "node:fs";
import { all, dataPath, one, run } from "./db";
import { getSettings } from "./settings";

export type PoseRow = { key: string; file_name: string; usage: string; kind: string; in_script: number; processed_file: string | null; source_file: string | null; updated_at: string | null };

export function listPoses() {
  return all<PoseRow>("SELECT * FROM poses ORDER BY CASE kind WHEN 'pose' THEN 0 WHEN 'mouth' THEN 1 WHEN 'blink' THEN 2 ELSE 3 END, rowid");
}

function minFilter1D(src: Float32Array, w: number, h: number, r: number, horizontal: boolean) {
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 1;
      for (let k = -r; k <= r; k++) {
        const xx = horizontal ? x + k : x, yy = horizontal ? y : y + k;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const v = src[yy * w + xx];
        if (v < m) m = v;
      }
      out[y * w + x] = m;
    }
  return out;
}
function boxBlur1D(src: Float32Array, w: number, h: number, r: number, horizontal: boolean) {
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = horizontal ? x + k : x, yy = horizontal ? y : y + k;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        s += src[yy * w + xx];
        n++;
      }
      out[y * w + x] = s / n;
    }
  return out;
}

/** Chroma key: prahy 15–70, eroze 5 px, rozmazání 1,2 px, despill. Výstup PNG výšky 1000 px. */
export async function keyPose(srcFile: string, outFile: string) {
  const r = getSettings("render");
  const img = await loadImage(fs.readFileSync(srcFile));
  const targetH = Math.min(1000, img.height);
  const scale = targetH / img.height;
  const w = Math.round(img.width * scale), h = targetH;
  const cv = createCanvas(w, h);
  const ctx = cv.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  let alpha = new Float32Array(w * h);
  const lo = r.chroma_low, hi = r.chroma_high;
  for (let i = 0; i < w * h; i++) {
    const R = d[i * 4], G = d[i * 4 + 1], B = d[i * 4 + 2];
    const green = G - Math.max(R, B);
    alpha[i] = 1 - Math.max(0, Math.min(1, (green - lo) / (hi - lo)));
  }
  // eroze (v měřítku výstupu) — odstraní světlý lem ve vlasech
  const er = Math.max(1, Math.round(r.chroma_erode * scale * 1.6));
  alpha = minFilter1D(minFilter1D(alpha, w, h, er, true), w, h, er, false);
  const br = Math.max(1, Math.round(r.chroma_blur));
  alpha = boxBlur1D(boxBlur1D(alpha, w, h, br, true), w, h, br, false);
  for (let i = 0; i < w * h; i++) {
    const R = d[i * 4], B = d[i * 4 + 2];
    // despill: zelená nesmí převýšit max(R, B)
    d[i * 4 + 1] = Math.min(d[i * 4 + 1], Math.max(R, B));
    d[i * 4 + 3] = Math.round(alpha[i] * 255);
  }
  ctx.putImageData(id, 0, 0);
  fs.writeFileSync(outFile, cv.toBuffer("image/png"));
  return { width: w, height: h };
}

export async function savePoseUpload(key: string, buf: Buffer, originalName: string) {
  const p = one<PoseRow>("SELECT * FROM poses WHERE key = ?", key);
  if (!p) throw new Error("Neznámá póza");
  const ext = (originalName.split(".").pop() || "jpg").toLowerCase();
  const src = dataPath("poses", "source", `${key}.${ext}`);
  fs.writeFileSync(src, buf);
  const out = dataPath("poses", `${key}.png`);
  await keyPose(src, out);
  run("UPDATE poses SET source_file = ?, processed_file = ?, updated_at = datetime('now') WHERE key = ?", src, out, key);
}

export async function rekeyAll() {
  for (const p of listPoses()) if (p.source_file && fs.existsSync(p.source_file)) await keyPose(p.source_file, p.processed_file || dataPath("poses", `${p.key}.png`));
}

/** Načte předklíčované pózy pro render. */
export async function loadPoseImages(): Promise<Record<string, Image | null>> {
  const out: Record<string, Image | null> = {};
  for (const p of listPoses()) {
    out[p.key] = p.processed_file && fs.existsSync(p.processed_file) ? await loadImage(fs.readFileSync(p.processed_file)) : null;
  }
  return out;
}
