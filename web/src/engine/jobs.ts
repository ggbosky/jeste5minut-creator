// Stránka vyřizuje úlohy, které service worker sám neumí (audio, canvas, WebCodecs).
import { CHANNEL } from "../../sw/bridge";
import { getBlob, putBlob } from "../../sw/db";
import { getSettings } from "../../sw/core";
import { runRender } from "./render";

const ch = new BroadcastChannel(CHANNEL);

export async function decodeMono(blob: Blob, rate = 48000): Promise<Float32Array> {
  const ac = new OfflineAudioContext(1, 1, rate);
  const buf = await ac.decodeAudioData(await blob.arrayBuffer());
  if (buf.sampleRate === rate && buf.numberOfChannels === 1) return buf.getChannelData(0).slice();
  // převzorkování + downmix přes OfflineAudioContext
  const off = new OfflineAudioContext(1, Math.ceil(buf.duration * rate), rate);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0).slice();
}

async function probe(blobKey: string) {
  const b = await getBlob(blobKey);
  if (!b) throw new Error("Soubor chybí");
  const ac = new OfflineAudioContext(1, 1, 48000);
  const buf = await ac.decodeAudioData(await b.arrayBuffer());
  return { duration: buf.duration };
}

/** Chroma key: prahy, eroze, rozmazání, despill → PNG výšky max 1000 px. */
async function chroma(key: string) {
  const src = await getBlob(`pose-src-${key}`);
  if (!src) throw new Error("Zdroj pózy chybí");
  const r = await getSettings("render");
  const img = await createImageBitmap(src);
  const h = Math.min(1000, img.height);
  const scale = h / img.height;
  const w = Math.round(img.width * scale);
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  let alpha = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const green = d[i * 4 + 1] - Math.max(d[i * 4], d[i * 4 + 2]);
    alpha[i] = 1 - Math.max(0, Math.min(1, (green - r.chroma_low) / (r.chroma_high - r.chroma_low)));
  }
  const pass = (srcA: Float32Array, rad: number, horiz: boolean, fn: "min" | "avg") => {
    const out = new Float32Array(srcA.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let acc = fn === "min" ? 1 : 0, n = 0;
        for (let k = -rad; k <= rad; k++) {
          const xx = horiz ? x + k : x, yy = horiz ? y : y + k;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const v = srcA[yy * w + xx];
          if (fn === "min") acc = Math.min(acc, v);
          else acc += v;
          n++;
        }
        out[y * w + x] = fn === "min" ? acc : acc / n;
      }
    return out;
  };
  const er = Math.max(1, Math.round(r.chroma_erode * scale * 1.6));
  alpha = pass(pass(alpha, er, true, "min"), er, false, "min");
  const br = Math.max(1, Math.round(r.chroma_blur));
  alpha = pass(pass(alpha, br, true, "avg"), br, false, "avg");
  for (let i = 0; i < w * h; i++) {
    d[i * 4 + 1] = Math.min(d[i * 4 + 1], Math.max(d[i * 4], d[i * 4 + 2]));
    d[i * 4 + 3] = Math.round(alpha[i] * 255);
  }
  ctx.putImageData(id, 0, 0);
  const png = await new Promise<Blob>((res) => cv.toBlob((b) => res(b!), "image/png"));
  await putBlob(`pose-${key}`, png);
  return { ok: true };
}

export function startJobs() {
  ch.onmessage = async (e) => {
    const m = e.data;
    if (m?.type === "render") {
      void runRender(m.id);
      return;
    }
    if (m?.type !== "job") return;
    // jen jedna karta vyřizuje danou úlohu
    await navigator.locks.request(`job-${m.id}`, { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      try {
        let result: unknown;
        if (m.kind === "probe") result = await probe(m.payload.blob);
        else if (m.kind === "chroma") result = await chroma(m.payload.key);
        else throw new Error(`Neznámá úloha ${m.kind}`);
        ch.postMessage({ type: "job-done", id: m.id, result });
      } catch (err) {
        ch.postMessage({ type: "job-done", id: m.id, error: err instanceof Error ? err.message : String(err) });
      }
    });
  };
  // dokončit rendery, které čekají ve frontě (např. po obnovení stránky)
  void import("../../sw/db").then(async ({ all }) => {
    for (const r of await all<{ id: number; status: string }>("renders")) if (r.status === "queued") void runRender(r.id);
  });
}
