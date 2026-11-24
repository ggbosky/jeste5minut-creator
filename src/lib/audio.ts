import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const SR = 48000;

export function sh(cmd: string, args: string[], input?: Buffer): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr: err });
      else reject(new Error(`${cmd} skončil s kódem ${code}: ${err.split("\n").slice(-6).join("\n")}`));
    });
    if (input) p.stdin.end(input);
    else p.stdin.end();
  });
}

export async function ffmpegVersion() {
  try {
    const r = await sh("ffmpeg", ["-version"]);
    return r.stdout.toString().split("\n")[0];
  } catch {
    return null;
  }
}

export async function probeDuration(file: string): Promise<number> {
  const r = await sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  return parseFloat(r.stdout.toString().trim());
}

/** Dekóduje libovolné audio na mono float32 PCM. */
export async function decodePcm(file: string, rate = SR): Promise<Float32Array> {
  const r = await sh("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(rate), "-f", "f32le", "-"]);
  const b = r.stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

export function writeWav(file: string, pcm: Float32Array, rate = SR) {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(3, 20); // IEEE float
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(32, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

type Loud = { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string };

export async function measureLoudness(file: string, target = -16): Promise<Loud & { lufs: number }> {
  const r = await sh("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-"]);
  const m = r.stderr.match(/\{[\s\S]*?\}/g);
  if (!m) throw new Error("Nelze změřit hlasitost");
  const j = JSON.parse(m[m.length - 1]) as Loud;
  return { ...j, lufs: parseFloat(j.input_i) };
}

/**
 * Příprava jedné audio části: ořez ticha na krajích (s okrajem) a normalizace
 * hlasitosti JEDNOU (dvouprůchodový lineární loudnorm). Výstup mono 48 kHz.
 */
export async function preparePart(input: string, output: string, o: { thresholdDb: number; beforeS: number; afterS: number; targetLufs: number }) {
  const trim =
    `silenceremove=start_periods=1:start_threshold=${o.thresholdDb}dB:start_silence=${o.beforeS}:detection=peak,` +
    `areverse,silenceremove=start_periods=1:start_threshold=${o.thresholdDb}dB:start_silence=${o.afterS}:detection=peak,areverse`;
  const trimmed = output.replace(/\.wav$/, ".trim.wav");
  await sh("ffmpeg", ["-y", "-v", "error", "-i", input, "-af", trim, "-ac", "1", "-ar", String(SR), "-c:a", "pcm_f32le", trimmed]);
  const m = await measureLoudness(trimmed, o.targetLufs);
  const ln =
    `loudnorm=I=${o.targetLufs}:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
    `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  await sh("ffmpeg", ["-y", "-v", "error", "-i", trimmed, "-af", ln, "-ac", "1", "-ar", String(SR), "-c:a", "pcm_f32le", output]);
  fs.rmSync(trimmed, { force: true });
  return { measured_lufs: m.lufs };
}

/** Úseky řeči podle prahu (náhrada za ffmpeg silencedetect, počítáno přímo z PCM). */
export function speechSegments(pcm: Float32Array, rate: number, thresholdDb: number, minSilenceS: number) {
  const win = Math.round(rate * 0.01);
  const thr = Math.pow(10, thresholdDb / 20);
  const voiced: boolean[] = [];
  for (let i = 0; i < pcm.length; i += win) {
    let s = 0;
    const end = Math.min(pcm.length, i + win);
    for (let j = i; j < end; j++) s += pcm[j] * pcm[j];
    voiced.push(Math.sqrt(s / Math.max(1, end - i)) > thr);
  }
  const segs: { start: number; end: number }[] = [];
  let cur: { start: number; end: number } | null = null;
  const minGap = Math.round(minSilenceS / 0.01);
  let silence = 0;
  voiced.forEach((v, k) => {
    const t = k * 0.01;
    if (v) {
      if (!cur) cur = { start: t, end: t + 0.01 };
      else cur.end = t + 0.01;
      silence = 0;
    } else if (cur) {
      silence++;
      if (silence >= minGap) {
        segs.push(cur);
        cur = null;
      }
    }
  });
  if (cur) segs.push(cur);
  return segs;
}

export function lastSpeechEnd(pcm: Float32Array, rate: number, thresholdDb: number) {
  const segs = speechSegments(pcm, rate, thresholdDb, 0.12);
  return segs.length ? segs[segs.length - 1].end : 0;
}

/** RMS v dB pro každý snímek videa (pro animaci pusy). */
export function rmsPerFrame(pcm: Float32Array, rate: number, fps: number, frames: number): Float32Array {
  const out = new Float32Array(frames);
  const spf = rate / fps;
  for (let f = 0; f < frames; f++) {
    const a = Math.floor(f * spf), b = Math.min(pcm.length, Math.floor((f + 1) * spf));
    let s = 0;
    for (let i = a; i < b; i++) s += pcm[i] * pcm[i];
    const rms = b > a ? Math.sqrt(s / (b - a)) : 0;
    out[f] = rms > 0 ? 20 * Math.log10(rms) : -120;
  }
  return out;
}

// ---------------- zvukové efekty generované v kódu (bez licencí) ----------------
function synth(kind: string, rate = SR): Float32Array {
  const dur = kind === "swoosh" ? 0.38 : kind === "pop" ? 0.14 : 0.035;
  const n = Math.round(dur * rate);
  const out = new Float32Array(n);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  let lp = 0, phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    if (kind === "pop") {
      const f = 900 * Math.exp(-t * 28) + 180;
      phase += (2 * Math.PI * f) / rate;
      out[i] = Math.sin(phase) * Math.exp(-t * 30) * 0.9;
    } else if (kind === "tick") {
      phase += (2 * Math.PI * 2400) / rate;
      out[i] = (Math.sin(phase) * 0.7 + rnd() * 0.3) * Math.exp(-t * 160) * 0.8;
    } else {
      const p = t / dur;
      const cutoff = 0.02 + 0.25 * Math.sin(Math.PI * p);
      lp += cutoff * (rnd() - lp);
      out[i] = lp * Math.sin(Math.PI * p) ** 2 * 2.2;
    }
  }
  return out;
}

const sfxCache = new Map<string, Float32Array>();
export function sfxPcm(kind: string) {
  if (!sfxCache.has(kind)) sfxCache.set(kind, synth(kind));
  return sfxCache.get(kind)!;
}

/** Mix hlasu a efektů bez normalizace + měkký limiter. */
export function mix(voice: Float32Array, sfx: { type: string; t: number }[], rate = SR, sfxGainDb = -10): Float32Array {
  const out = new Float32Array(voice);
  const g = Math.pow(10, sfxGainDb / 20);
  for (const s of sfx) {
    const p = sfxPcm(s.type);
    const off = Math.round(s.t * rate);
    for (let i = 0; i < p.length && off + i < out.length; i++) if (off + i >= 0) out[off + i] += p[i] * g;
  }
  // limiter: strop -1 dBFS s měkkým kolenem
  const ceil = Math.pow(10, -1 / 20);
  for (let i = 0; i < out.length; i++) {
    const x = out[i];
    const ax = Math.abs(x);
    if (ax > ceil * 0.9) {
      const over = ax - ceil * 0.9;
      out[i] = Math.sign(x) * (ceil * 0.9 + (ceil * 0.1) * Math.tanh(over / (ceil * 0.1)));
    }
  }
  return out;
}
