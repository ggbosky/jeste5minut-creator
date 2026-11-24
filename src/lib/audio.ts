import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export { SR } from "./dsp";
import { SR } from "./dsp";

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

export { speechSegments, lastSpeechEnd, rmsPerFrame, sfxPcm, mix } from "./dsp";
