// Render pipeline: zadání → audio → časování → timeline → snímky → MP4 → automatická kontrola.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { all, one, run } from "./db";
import { getSettings } from "./settings";
import { buildSpec, fileName, type VideoSpec } from "./outputs";
import { getVideo, videoScript, videoDir, setStatus, type TakeRow } from "./videos";
import { preparePart, decodePcm, writeWav, mix, rmsPerFrame, lastSpeechEnd, measureLoudness, probeDuration, SR, sh } from "./audio";
import { buildTimeline, scriptWords, type Timeline, type TimelineWord } from "../render/timeline";
import { alignStt, syllableTiming } from "./timing";
import { speechToText } from "./elevenlabs";
import { activeKey } from "./keys";
import { avatarTrack, drawFrame, type Layout, type Assets } from "../render/frame";
import type { Brand } from "../render/draw";
import { loadPoseImages } from "./poses";
import { logActivity } from "./api";

let fontsReady = false;
export function ensureFonts() {
  if (fontsReady) return;
  const dir = path.join(process.cwd(), "public", "fonts");
  for (const f of ["Inter-Regular.otf", "Inter-Medium.otf", "Inter-SemiBold.otf", "Inter-Bold.otf", "Inter-ExtraBold.otf"]) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, "Inter");
  }
  fontsReady = true;
}

export function brandFromSettings(): Brand {
  const b = getSettings("brand");
  return { ...b.colors, font: b.font };
}
export function layoutFromSettings(): Layout {
  const r = getSettings("render");
  return {
    width: r.width,
    height: r.height,
    zone_counter: r.zone_counter,
    zone_graphic: r.zone_graphic,
    caption_y: r.caption_y,
    caption_size: r.caption_size,
    zone_avatar: r.zone_avatar,
    avatar_height: r.avatar_height,
    breathing: r.breathing,
    blink_min_s: r.blink_min_s,
    blink_max_s: r.blink_max_s,
  };
}

export function specForVideo(videoId: number): VideoSpec {
  const v = getVideo(videoId);
  const s = videoScript(v);
  if (!s) throw new Error("Video nemá scénář");
  const b = getSettings("brand");
  return buildSpec(s, { videoFilePattern: getSettings("naming").video_pattern, abbr: b.abbr, yy: b.year, render: getSettings("render"), content: getSettings("content") });
}

type Progress = (stage: string, p: number, log?: string) => void;

export type QaResult = {
  passed: boolean;
  checks: { key: string; label: string; ok: boolean; level: "error" | "warn"; detail: string }[];
};

/** Připraví audio a timeline (bez renderu snímků). Použije se i pro náhled se skutečným časováním. */
export async function prepareAudioAndTimeline(videoId: number, workDir: string, progress: Progress) {
  const r = getSettings("render");
  const voice = getSettings("voice");
  const spec = specForVideo(videoId);
  const takes = all<TakeRow>("SELECT * FROM audio_takes WHERE video_id = ? AND selected = 1 ORDER BY part", videoId);
  const parts: Timeline["audio_parts"] = [];
  const pcms: Float32Array[] = [];
  for (let i = 0; i < spec.audio.parts.length; i++) {
    const take = takes.find((t) => t.part === i + 1);
    if (!take) throw new Error(`Chybí audio pro část ${i + 1} (cast${i + 1}.mp3)`);
    progress("audio", 0.02 + 0.08 * (i / spec.audio.parts.length), `Část ${i + 1}: ořez ticha + normalizace ${r.target_lufs} LUFS`);
    const out = path.join(workDir, `part${i + 1}.wav`);
    const m = await preparePart(take.file, out, { thresholdDb: r.trim_threshold_db, beforeS: r.trim_before_s, afterS: r.trim_after_s, targetLufs: r.target_lufs });
    progress("audio", 0.02 + 0.08 * ((i + 1) / spec.audio.parts.length), `  naměřeno ${m.measured_lufs.toFixed(1)} LUFS před normalizací`);
    pcms.push(await decodePcm(out));
  }
  // spojení s pauzou gap_s + ticho tail_s na konci
  const gap = Math.round(r.gap_s * SR), tail = Math.round(r.tail_s * SR);
  const total = pcms.reduce((a, p) => a + p.length, 0) + gap * (pcms.length - 1) + tail;
  const voicePcm = new Float32Array(total);
  let off = 0;
  pcms.forEach((p, i) => {
    voicePcm.set(p, off);
    parts.push({ file: `cast${i + 1}.mp3`, part: i + 1, offset_s: off / SR, duration_s: p.length / SR });
    off += p.length + (i < pcms.length - 1 ? gap : 0);
  });
  const voiceFile = path.join(workDir, "voice.wav");
  writeWav(voiceFile, voicePcm);
  const duration = total / SR;
  const voiceEnd = lastSpeechEnd(voicePcm, SR, r.silence_db);

  // časování slov
  const sw = scriptWords(spec);
  let words: TimelineWord[] | null = null;
  let source: Timeline["timing_source"] = "syllables";
  const wantStt = voice.timing_source === "stt" || (voice.timing_source === "auto" && !!activeKey("elevenlabs"));
  if (wantStt) {
    try {
      progress("timing", 0.12, "Časování slov: ElevenLabs Scribe (speech-to-text)…");
      const stt = await speechToText(fs.readFileSync(voiceFile.replace(/\.wav$/, ".wav")), "voice.wav", voice.stt_model);
      if (stt.length >= sw.length * 0.5) {
        words = alignStt(sw, stt, duration);
        source = "stt";
      } else progress("timing", 0.13, `  STT vrátil jen ${stt.length} slov — použiji slabikový odhad`);
    } catch (e) {
      progress("timing", 0.13, `  STT selhal (${e instanceof Error ? e.message : e}) — použiji slabikový odhad`);
    }
  }
  if (!words) {
    progress("timing", 0.14, "Časování slov: slabikový odhad v úsecích řeči (silencedetect −38 dB)");
    words = [];
    parts.forEach((p, i) => {
      const pw = sw.filter((w) => w.part === i + 1);
      words!.push(...syllableTiming(pw, pcms[i], SR, p.offset_s, r.silence_db, r.silence_min_s));
    });
  }
  const timeline = buildTimeline(spec, words, { duration_s: duration, voice_end_s: voiceEnd, parts, source, gesture_s: r.gesture_s });
  return { spec, timeline, voicePcm, voiceFile, duration };
}

export async function renderVideo(renderId: number, progress: Progress) {
  ensureFonts();
  const rr = one<{ video_id: number; version: number }>("SELECT video_id, version FROM renders WHERE id = ?", renderId)!;
  const videoId = rr.video_id;
  const r = getSettings("render");
  const b = getSettings("brand");
  const content = getSettings("content");
  const t0 = Date.now();
  const workDir = videoDir(videoId, "renders", `v${rr.version}`);
  fs.mkdirSync(workDir, { recursive: true });

  const { spec, timeline, voicePcm, duration } = await prepareAudioAndTimeline(videoId, workDir, progress);
  fs.writeFileSync(path.join(workDir, "video_spec.json"), JSON.stringify(spec, null, 2));
  fs.writeFileSync(path.join(workDir, "timeline.json"), JSON.stringify(timeline, null, 2));
  run("UPDATE renders SET spec = ?, timeline = ? WHERE id = ?", JSON.stringify(spec), JSON.stringify(timeline), renderId);
  run("UPDATE videos SET spec = ?, timeline = ? WHERE id = ?", JSON.stringify(spec), JSON.stringify(timeline), videoId);

  // varování délky už před renderem
  const diff = Math.abs(duration - spec.output.target_duration_s) / spec.output.target_duration_s;
  if (diff > content.duration_tolerance) progress("timing", 0.15, `⚠ Délka ${duration.toFixed(1)} s se liší od cíle ${spec.output.target_duration_s} s o ${(diff * 100).toFixed(0)} % (délku řídí hlas)`);

  // mix: hlas + efekty, bez hudby
  progress("mix", 0.16, `Mix: hlas + ${timeline.sfx.length} efekt(y), limiter`);
  const mixed = mix(voicePcm, timeline.sfx);
  const mixFile = path.join(workDir, "mix.wav");
  writeWav(mixFile, mixed);

  // assety
  const poses = await loadPoseImages();
  const coverRow = one<{ file: string }>("SELECT file FROM assets WHERE key = 'cover'");
  const cover = coverRow && fs.existsSync(coverRow.file) ? await loadImage(fs.readFileSync(coverRow.file)) : null;
  const missing = ["Original", "Point_up", "Shrug", "Arms_crossed", "Thinking", "Point_down"].filter((k) => !poses[k]);
  if (missing.length === 6) progress("render", 0.17, "Pózy avatara nejsou nahrané — použije se zástupná vektorová postava");
  else if (missing.length) progress("render", 0.17, `Chybí pózy ${missing.join(", ")} — nahradí je Original`);

  const fps = spec.output.fps;
  const frames = Math.ceil(duration * fps);
  const rms = rmsPerFrame(voicePcm, SR, fps, frames);
  const layout = layoutFromSettings();
  const track = avatarTrack(timeline, fps, rms, layout, r.silence_db);
  const brand = brandFromSettings();

  const outName = spec.output.filename.replace("{version}", String(rr.version));
  const outFile = path.join(workDir, outName);
  const W = spec.output.width, H = spec.output.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  const ff = spawn("ffmpeg", [
    "-y", "-v", "error",
    "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-r", String(fps), "-i", "-",
    "-i", mixFile,
    "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", r.preset, "-crf", String(r.crf), "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", `${r.audio_bitrate_k}k`, "-ar", "48000",
    "-movflags", "+faststart", "-t", duration.toFixed(3),
    outFile,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  let ffErr = "";
  ff.stderr.on("data", (d) => (ffErr += d.toString()));
  const ffDone = new Promise<void>((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg: ${ffErr.slice(-800)}`)))));
  ff.stdin.on("error", () => {});

  progress("render", 0.18, `Render ${frames} snímků ${W}×${H} @ ${fps} fps`);
  let lastP = 0;
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    drawFrame(ctx, t, spec, timeline, { poses, cover } as unknown as Assets, track[f], { brand, layout });
    const buf = canvas.data();
    if (!ff.stdin.write(buf)) await new Promise((res) => ff.stdin.once("drain", res));
    const p = 0.18 + 0.72 * (f / frames);
    if (p - lastP > 0.01) {
      lastP = p;
      progress("render", p);
    }
  }
  ff.stdin.end();
  await ffDone;
  const renderSeconds = (Date.now() - t0) / 1000;
  progress("qa", 0.92, `Hotovo za ${renderSeconds.toFixed(0)} s → ${outName}. Automatická kontrola…`);

  const qa = await qualityCheck(outFile, timeline, spec, workDir, rr.version, progress);
  const contact = path.join(workDir, "contact_sheet.png");
  run(
    "UPDATE renders SET output_file = ?, contact_sheet = ?, qa = ?, duration_s = ?, render_seconds = ? WHERE id = ?",
    outFile,
    fs.existsSync(contact) ? contact : null,
    JSON.stringify(qa),
    duration,
    renderSeconds,
    renderId,
  );
  for (const c of qa.checks) progress("qa", 0.99, `${c.ok ? "✓" : c.level === "error" ? "✗" : "⚠"} ${c.label}: ${c.detail}`);
  return { qa, outFile };
}

/** Kontrola hotového MP4 proti zdrojům (ne jen vizuálně). */
export async function qualityCheck(mp4: string, tl: Timeline, spec: VideoSpec, workDir: string, version: number, progress: Progress): Promise<QaResult> {
  const r = getSettings("render");
  const content = getSettings("content");
  const checks: QaResult["checks"] = [];
  const pcm = await decodePcm(mp4);
  const mp4End = lastSpeechEnd(pcm, SR, r.silence_db);
  const endDiff = Math.abs(mp4End - tl.voice_end_s) * 1000;
  checks.push({
    key: "speech_end",
    label: "Konec řeči",
    ok: endDiff <= r.qa_end_tolerance_ms,
    level: "error",
    detail: `MP4 ${mp4End.toFixed(3)} s vs. hlasová stopa ${tl.voice_end_s.toFixed(3)} s (rozdíl ${endDiff.toFixed(0)} ms, tolerance ${r.qa_end_tolerance_ms} ms)`,
  });
  const dur = await probeDuration(mp4);
  checks.push({
    key: "duration",
    label: "Délka = hlas + 0,5 s",
    ok: Math.abs(dur - tl.duration_s) < 0.1,
    level: "error",
    detail: `${dur.toFixed(2)} s (stopa hlasu ${(tl.duration_s - r.tail_s).toFixed(2)} s + ${r.tail_s} s ticha = ${tl.duration_s.toFixed(2)} s)`,
  });
  const target = spec.output.target_duration_s;
  const dd = Math.abs(dur - target) / target;
  checks.push({
    key: "target",
    label: "Odchylka od cílové délky",
    ok: dd <= content.duration_tolerance,
    level: "warn",
    detail: `${(dd * 100).toFixed(0)} % od cíle ${target} s (limit ${(content.duration_tolerance * 100).toFixed(0)} %)`,
  });
  const loud = await measureLoudness(mp4, r.target_lufs);
  checks.push({
    key: "lufs",
    label: "Hlasitost",
    ok: Math.abs(loud.lufs - r.target_lufs) <= r.qa_lufs_tolerance,
    level: "error",
    detail: `${loud.lufs.toFixed(1)} LUFS (cíl ${r.target_lufs} ± ${r.qa_lufs_tolerance})`,
  });
  // kontaktní arch: snímek ze středu každé scény přímo z MP4
  progress("qa", 0.95, "Kontaktní arch ze snímků MP4…");
  const sheet = await contactSheet(mp4, tl, workDir, version);
  checks.push({ key: "green", label: "Zelený lem postavy", ok: sheet.greenRatio < 0.002, level: "warn", detail: `${(sheet.greenRatio * 100).toFixed(3)} % zelených pixelů v zóně postavy` });
  checks.push({ key: "sheet", label: "Kontaktní arch", ok: true, level: "warn", detail: `${tl.scenes.length} scén — zkontroluj čitelnost, zóny a synchron titulků s pusou` });
  return { passed: checks.every((c) => c.ok || c.level === "warn"), checks };
}

async function contactSheet(mp4: string, tl: Timeline, workDir: string, version: number) {
  const thumbs: Buffer[] = [];
  for (const s of tl.scenes) {
    const t = Math.min(tl.duration_s - 0.05, (s.start_s + s.end_s) / 2);
    const r = await sh("ffmpeg", ["-v", "error", "-ss", t.toFixed(3), "-i", mp4, "-frames:v", "1", "-vf", "scale=270:480", "-f", "image2pipe", "-vcodec", "png", "-"]);
    thumbs.push(r.stdout);
  }
  const cols = Math.min(4, thumbs.length), rows = Math.ceil(thumbs.length / cols);
  const cv = createCanvas(cols * 280 + 10, rows * 530 + 10);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#0B1222";
  ctx.fillRect(0, 0, cv.width, cv.height);
  let green = 0, total = 0;
  for (let i = 0; i < thumbs.length; i++) {
    const img = await loadImage(thumbs[i]);
    const x = 10 + (i % cols) * 280, y = 10 + Math.floor(i / cols) * 530;
    ctx.drawImage(img, x, y, 270, 480);
    ctx.fillStyle = "#fff";
    ctx.font = "700 22px Inter";
    ctx.fillText(`Scéna ${tl.scenes[i].n} · ${((tl.scenes[i].start_s + tl.scenes[i].end_s) / 2).toFixed(1)} s`, x + 4, y + 508);
    // zelený lem: pixely, kde G výrazně převyšuje R i B v zóně postavy (y 1120–1920 → 280–480 ve zmenšenině)
    const id = ctx.getImageData(x, y + 280, 270, 200).data;
    for (let k = 0; k < id.length; k += 4) {
      total++;
      if (id[k + 1] > 140 && id[k + 1] > id[k] * 1.5 && id[k + 1] > id[k + 2] * 1.5) green++;
    }
  }
  fs.writeFileSync(path.join(workDir, "contact_sheet.png"), cv.toBuffer("image/png"));
  void version;
  return { greenRatio: total ? green / total : 0 };
}

export function outputFileName(videoId: number, version: number) {
  const v = getVideo(videoId);
  const b = getSettings("brand");
  return fileName(getSettings("naming").video_pattern, { n: v.number, slug: v.slug, abbr: b.abbr, yy: b.year, version }) + ".mp4";
}

// ---------------- fronta renderů (v procesu) ----------------
type G = typeof globalThis & { __j5mQueue?: { running: boolean; queue: number[] } };
const q = ((globalThis as G).__j5mQueue ??= { running: false, queue: [] });

export function enqueueRender(renderId: number) {
  q.queue.push(renderId);
  void pump();
}

async function pump() {
  if (q.running) return;
  const id = q.queue.shift();
  if (id === undefined) return;
  q.running = true;
  const row = one<{ video_id: number; created_by: number | null; version: number }>("SELECT video_id, created_by, version FROM renders WHERE id = ?", id);
  let log = "";
  let lastWrite = 0;
  const progress: Progress = (stage, p, line) => {
    if (line) log += `[${new Date().toISOString().slice(11, 19)}] ${line}\n`;
    const now = Date.now();
    if (line || now - lastWrite > 400) {
      lastWrite = now;
      run("UPDATE renders SET stage = ?, progress = ?, log = ? WHERE id = ?", stage, p, log, id);
    }
  };
  try {
    run("UPDATE renders SET status = 'running' WHERE id = ?", id);
    progress("start", 0.01, "Start renderu");
    const { qa } = await renderVideo(id, progress);
    run("UPDATE renders SET status = ?, progress = 1, stage = 'done', log = ?, finished_at = datetime('now') WHERE id = ?", qa.passed ? "done" : "qa_failed", log, id);
    if (row) {
      if (qa.passed) setStatus(row.video_id, "done");
      logActivity(row.created_by, qa.passed ? "render.done" : "render.qa_failed", "video", row.video_id, `v${row.version}`);
    }
  } catch (e) {
    log += `CHYBA: ${e instanceof Error ? e.message : String(e)}\n`;
    run("UPDATE renders SET status = 'error', log = ?, finished_at = datetime('now') WHERE id = ?", log, id);
    if (row) logActivity(row.created_by, "render.error", "video", row.video_id, `v${row.version}`);
  } finally {
    q.running = false;
    void pump();
  }
}

export function queueState() {
  return { running: q.running, queued: q.queue.length };
}

/** Po restartu serveru: rozdělané rendery označit jako přerušené. */
export function recoverRenders() {
  run("UPDATE renders SET status = 'error', log = log || 'Přerušeno restartem serveru\n' WHERE status IN ('queued', 'running')");
}
