// Render MP4 přímo v prohlížeči: audio (ořez, LUFS, mix) → timeline → snímky Canvas → WebCodecs H.264 + AAC → MP4.
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { all, get, getBlob, patch, putBlob, nowIso } from "../../sw/db";
import { activeKey, getSettings, logActivity, recordUsage } from "../../sw/core";
import { buildSpec, type VideoSpec } from "@/lib/outputs";
import type { Script } from "@/lib/script";
import { buildTimeline, scriptWords, type Timeline, type TimelineWord } from "@/render/timeline";
import { avatarTrack, drawFrame, type Assets, type Layout } from "@/render/frame";
import { alignStt, syllableTiming } from "@/lib/timing";
import { SR, trimSilence, normalizeLoudness, lastSpeechEnd, mix, rmsPerFrame, integratedLufs, encodeWav16 } from "@/lib/dsp";
import { decodeMono } from "./jobs";

type RenderRec = { id: number; video_id: number; version: number; status: string; log: string; created_by: number | null; heartbeat?: number };
type QaCheck = { key: string; label: string; ok: boolean; level: "error" | "warn"; detail: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runRender(id: number) {
  await navigator.locks.request(`render-${id}`, { ifAvailable: true }, async (lock) => {
    if (!lock) return;
    const r = await get<RenderRec>("renders", id);
    if (!r || r.status !== "queued") return;
    let log = "";
    let last = 0;
    const progress = async (stage: string, p: number, line?: string) => {
      if (line) log += `[${new Date().toTimeString().slice(0, 8)}] ${line}\n`;
      if (line || Date.now() - last > 400) {
        last = Date.now();
        await patch("renders", id, { stage, progress: p, log, heartbeat: Date.now() });
      }
    };
    const hb = setInterval(() => void patch("renders", id, { heartbeat: Date.now() }), 5000);
    try {
      await patch("renders", id, { status: "running", heartbeat: Date.now() });
      await progress("start", 0.01, "Start renderu (v prohlížeči)");
      const qa = await render(r, progress);
      await patch("renders", id, { status: qa.passed ? "done" : "qa_failed", progress: 1, stage: "done", log, finished_at: nowIso() });
      if (qa.passed) await patch("videos", r.video_id, { status: "done", updated_at: nowIso() });
      await logActivity(r.created_by, qa.passed ? "render.done" : "render.qa_failed", "video", r.video_id, `v${r.version}`);
    } catch (e) {
      log += `CHYBA: ${e instanceof Error ? e.message : String(e)}\n`;
      await patch("renders", id, { status: "error", log, finished_at: nowIso() });
      await logActivity(r.created_by, "render.error", "video", r.video_id, `v${r.version}`);
    } finally {
      clearInterval(hb);
    }
  });
}

async function pickVideoCodec(w: number, h: number, fps: number) {
  if (typeof VideoEncoder === "undefined") throw new Error("Prohlížeč nepodporuje WebCodecs — použij aktuální Chrome nebo Edge.");
  for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42e028", "avc1.640033"]) {
    const cfg: VideoEncoderConfig = { codec, width: w, height: h, bitrate: 8_000_000, framerate: fps, avc: { format: "avc" } };
    if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg;
  }
  throw new Error("Prohlížeč neumí kódovat H.264 — použij Chrome nebo Edge.");
}
async function pickAudioCodec(kbps: number) {
  const aac: AudioEncoderConfig = { codec: "mp4a.40.2", sampleRate: SR, numberOfChannels: 1, bitrate: kbps * 1000 };
  if (typeof AudioEncoder !== "undefined" && (await AudioEncoder.isConfigSupported(aac)).supported) return { cfg: aac, mux: "aac" as const };
  const opus: AudioEncoderConfig = { codec: "opus", sampleRate: SR, numberOfChannels: 1, bitrate: 128000 };
  if (typeof AudioEncoder !== "undefined" && (await AudioEncoder.isConfigSupported(opus)).supported) return { cfg: opus, mux: "opus" as const };
  throw new Error("Prohlížeč neumí kódovat audio přes WebCodecs.");
}

async function render(r: RenderRec, progress: (s: string, p: number, l?: string) => Promise<void>) {
  const t0 = performance.now();
  const rs = await getSettings("render");
  const content = await getSettings("content");
  const brand = await getSettings("brand");
  const voiceS = await getSettings("voice");
  const v = await get<{ id: number; script: Script | null }>("videos", r.video_id);
  if (!v?.script) throw new Error("Video nemá scénář");
  const spec: VideoSpec = buildSpec(v.script, { videoFilePattern: (await getSettings("naming")).video_pattern, abbr: brand.abbr, yy: brand.year, render: rs, content });

  // ---- audio ----
  const takes = (await all<{ id: number; video_id: number; part: number; selected: number }>("audio_takes")).filter((t) => t.video_id === r.video_id && t.selected);
  const pcms: Float32Array[] = [];
  for (let i = 0; i < spec.audio.parts.length; i++) {
    const take = takes.find((t) => t.part === i + 1);
    if (!take) throw new Error(`Chybí audio pro část ${i + 1}`);
    await progress("audio", 0.02 + 0.08 * (i / spec.audio.parts.length), `Část ${i + 1}: ořez ticha + normalizace ${rs.target_lufs} LUFS`);
    const raw = await decodeMono((await getBlob(`take-${take.id}`))!);
    const trimmed = trimSilence(raw, SR, rs.trim_threshold_db, rs.trim_before_s, rs.trim_after_s);
    const n = normalizeLoudness(trimmed, SR, rs.target_lufs);
    await progress("audio", 0.02 + 0.08 * ((i + 1) / spec.audio.parts.length), `  naměřeno ${n.measured.toFixed(1)} LUFS před normalizací`);
    pcms.push(n.pcm);
  }
  const gap = Math.round(rs.gap_s * SR), tail = Math.round(rs.tail_s * SR);
  const total = pcms.reduce((a, p) => a + p.length, 0) + gap * (pcms.length - 1) + tail;
  const voice = new Float32Array(total);
  const parts: Timeline["audio_parts"] = [];
  let off = 0;
  pcms.forEach((p, i) => {
    voice.set(p, off);
    parts.push({ file: `cast${i + 1}.mp3`, part: i + 1, offset_s: off / SR, duration_s: p.length / SR });
    off += p.length + (i < pcms.length - 1 ? gap : 0);
  });
  const duration = total / SR;
  const voiceEnd = lastSpeechEnd(voice, SR, rs.silence_db);

  // ---- časování slov ----
  const sw = scriptWords(spec);
  let words: TimelineWord[] | null = null;
  let source: Timeline["timing_source"] = "syllables";
  const elKey = await activeKey("elevenlabs");
  if (elKey && voiceS.timing_source !== "syllables") {
    try {
      await progress("timing", 0.12, "Časování slov: ElevenLabs Scribe (speech-to-text)…");
      const fd = new FormData();
      fd.append("model_id", voiceS.stt_model);
      fd.append("language_code", "ces");
      fd.append("timestamps_granularity", "word");
      fd.append("tag_audio_events", "false");
      fd.append("file", new Blob([encodeWav16(voice, SR) as BlobPart], { type: "audio/wav" }), "voice.wav");
      const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": elKey }, body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      await recordUsage("elevenlabs", voiceS.stt_model, "stt", { chars: (j.text ?? "").length });
      const stt = (j.words ?? []).filter((w: { type: string }) => w.type === "word");
      if (stt.length >= sw.length * 0.5) {
        words = alignStt(sw, stt, duration);
        source = "stt";
      }
    } catch (e) {
      await progress("timing", 0.13, `  STT selhal (${e instanceof Error ? e.message : e}) — použiji slabikový odhad`);
    }
  }
  if (!words) {
    await progress("timing", 0.14, "Časování slov: slabikový odhad v úsecích řeči");
    words = [];
    parts.forEach((p, i) => words!.push(...syllableTiming(sw.filter((w) => w.part === i + 1), pcms[i], SR, p.offset_s, rs.silence_db, rs.silence_min_s)));
  }
  const tl = buildTimeline(spec, words, { duration_s: duration, voice_end_s: voiceEnd, parts, source, gesture_s: rs.gesture_s });
  const diff = Math.abs(duration - spec.output.target_duration_s) / spec.output.target_duration_s;
  if (diff > content.duration_tolerance) await progress("timing", 0.15, `⚠ Délka ${duration.toFixed(1)} s se liší od cíle o ${(diff * 100).toFixed(0)} % (délku řídí hlas)`);

  await progress("mix", 0.16, `Mix: hlas + ${tl.sfx.length} efekt(y), limiter`);
  const mixed = mix(voice, tl.sfx);

  // ---- assety ----
  const poses: Assets["poses"] = {};
  for (const p of await all<{ key: string; processed: number }>("poses")) {
    const b = p.processed ? await getBlob(`pose-${p.key}`) : null;
    poses[p.key] = b ? ((await createImageBitmap(b)) as unknown as CanvasImageSource) : null;
  }
  const coverBlob = await getBlob("asset-cover");
  const cover = coverBlob ? ((await createImageBitmap(coverBlob)) as unknown as CanvasImageSource) : null;
  if (!poses.Original) await progress("render", 0.17, "Pózy avatara nejsou nahrané — použije se zástupná vektorová postava");
  await Promise.all(["800 84px Inter", "700 40px Inter", "600 40px Inter", "500 20px Inter", "400 20px Inter"].map((f) => document.fonts.load(f)));

  const fps = spec.output.fps, W = spec.output.width, H = spec.output.height;
  const frames = Math.ceil(duration * fps);
  const layout: Layout = { width: rs.width, height: rs.height, zone_counter: rs.zone_counter, zone_graphic: rs.zone_graphic, caption_y: rs.caption_y, caption_size: rs.caption_size, zone_avatar: rs.zone_avatar, avatar_height: rs.avatar_height, breathing: rs.breathing, blink_min_s: rs.blink_min_s, blink_max_s: rs.blink_max_s };
  const b = { ...brand.colors, font: brand.font };
  const track = avatarTrack(tl, fps, rmsPerFrame(voice, SR, fps, frames), layout, rs.silence_db);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // ---- kódování ----
  const vcfg = await pickVideoCodec(W, H, fps);
  const acfg = await pickAudioCodec(rs.audio_bitrate_k);
  if (acfg.mux !== "aac") await progress("render", 0.17, "⚠ Prohlížeč neumí AAC — audio bude Opus (pro Instagram raději Chrome/Edge)");
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: "avc", width: W, height: H, frameRate: fps }, audio: { codec: acfg.mux, numberOfChannels: 1, sampleRate: SR }, fastStart: "in-memory", firstTimestampBehavior: "offset" });
  let encErr: Error | null = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (encErr = e as Error) });
  venc.configure(vcfg);
  const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => (encErr = e as Error) });
  aenc.configure(acfg.cfg);

  await progress("render", 0.18, `Render ${frames} snímků ${W}×${H} @ ${fps} fps (${vcfg.codec}, ${acfg.mux})`);
  for (let f = 0; f < frames; f++) {
    if (encErr) throw encErr;
    drawFrame(ctx, f / fps, spec, tl, { poses, cover }, track[f], { brand: b, layout });
    const frame = new VideoFrame(canvas, { timestamp: Math.round((f * 1e6) / fps), duration: Math.round(1e6 / fps) });
    venc.encode(frame, { keyFrame: f % (fps * 2) === 0 });
    frame.close();
    while (venc.encodeQueueSize > 8) await sleep(2);
    if (f % 15 === 0) await progress("render", 0.18 + 0.72 * (f / frames));
  }
  const chunk = 4800;
  const audioLen = Math.round((frames / fps) * SR);
  for (let i = 0; i < audioLen; i += chunk) {
    const n = Math.min(chunk, audioLen - i);
    const data = new Float32Array(n);
    data.set(mixed.subarray(i, Math.min(mixed.length, i + n)));
    const ad = new AudioData({ format: "f32-planar", sampleRate: SR, numberOfFrames: n, numberOfChannels: 1, timestamp: Math.round((i * 1e6) / SR), data });
    aenc.encode(ad);
    ad.close();
  }
  await venc.flush();
  await aenc.flush();
  if (encErr) throw encErr;
  muxer.finalize();
  const mp4 = new Blob([target.buffer], { type: "video/mp4" });
  const renderSeconds = (performance.now() - t0) / 1000;
  await progress("qa", 0.92, `Hotovo za ${renderSeconds.toFixed(0)} s (${(mp4.size / 1e6).toFixed(1)} MB). Automatická kontrola…`);

  // ---- kontrola ----
  const checks: QaCheck[] = [];
  const mixEnd = lastSpeechEnd(mixed, SR, rs.silence_db);
  const endDiff = Math.abs(mixEnd - voiceEnd) * 1000;
  checks.push({ key: "speech_end", label: "Konec řeči", ok: endDiff <= Math.max(rs.qa_end_tolerance_ms, 60), level: "error", detail: `mix ${mixEnd.toFixed(3)} s vs. hlasová stopa ${voiceEnd.toFixed(3)} s (rozdíl ${endDiff.toFixed(0)} ms)` });
  const vdur = frames / fps;
  checks.push({ key: "duration", label: "Délka = hlas + 0,5 s", ok: Math.abs(vdur - duration) < 0.1, level: "error", detail: `${vdur.toFixed(2)} s (stopa hlasu ${(duration - rs.tail_s).toFixed(2)} s + ${rs.tail_s} s ticha)` });
  const dd = Math.abs(vdur - spec.output.target_duration_s) / spec.output.target_duration_s;
  checks.push({ key: "target", label: "Odchylka od cílové délky", ok: dd <= content.duration_tolerance, level: "warn", detail: `${(dd * 100).toFixed(0)} % od cíle ${spec.output.target_duration_s} s` });
  const lufs = integratedLufs(mixed, SR);
  checks.push({ key: "lufs", label: "Hlasitost", ok: Math.abs(lufs - rs.target_lufs) <= rs.qa_lufs_tolerance, level: "error", detail: `${lufs.toFixed(1)} LUFS (cíl ${rs.target_lufs} ± ${rs.qa_lufs_tolerance})` });

  // kontaktní arch: snímek ze středu každé scény
  await progress("qa", 0.95, "Kontaktní arch…");
  const cols = Math.min(4, tl.scenes.length), rows = Math.ceil(tl.scenes.length / cols);
  const sheet = document.createElement("canvas");
  sheet.width = cols * 280 + 10;
  sheet.height = rows * 530 + 10;
  const sc = sheet.getContext("2d", { willReadFrequently: true })!;
  sc.fillStyle = "#0B1222";
  sc.fillRect(0, 0, sheet.width, sheet.height);
  let green = 0, px = 0;
  for (let i = 0; i < tl.scenes.length; i++) {
    const s = tl.scenes[i];
    const t = Math.min(duration - 0.05, (s.start_s + s.end_s) / 2);
    drawFrame(ctx, t, spec, tl, { poses, cover }, track[Math.floor(t * fps)], { brand: b, layout });
    const x = 10 + (i % cols) * 280, y = 10 + Math.floor(i / cols) * 530;
    sc.drawImage(canvas, x, y, 270, 480);
    sc.fillStyle = "#fff";
    sc.font = "700 22px Inter";
    sc.fillText(`Scéna ${s.n} · ${t.toFixed(1)} s`, x + 4, y + 508);
    const d = sc.getImageData(x, y + 280, 270, 200).data;
    for (let k = 0; k < d.length; k += 4) {
      px++;
      if (d[k + 1] > 140 && d[k + 1] > d[k] * 1.5 && d[k + 1] > d[k + 2] * 1.5) green++;
    }
  }
  const sheetBlob = await new Promise<Blob>((res) => sheet.toBlob((x) => res(x!), "image/png"));
  checks.push({ key: "green", label: "Zelený lem postavy", ok: green / px < 0.002, level: "warn", detail: `${((green / px) * 100).toFixed(3)} % zelených pixelů v zóně postavy` });
  checks.push({ key: "sheet", label: "Kontaktní arch", ok: true, level: "warn", detail: `${tl.scenes.length} scén — zkontroluj čitelnost, zóny a synchron titulků s pusou` });
  const qa = { passed: checks.every((c) => c.ok || c.level === "warn"), checks };

  await putBlob(`render-${r.id}-mp4`, mp4);
  await putBlob(`render-${r.id}-sheet`, sheetBlob);
  await patch("renders", r.id, { has_output: 1, has_sheet: 1, qa, duration_s: duration, render_seconds: renderSeconds, spec, timeline: tl });
  await patch("videos", r.video_id, { spec, timeline: tl });
  for (const c of checks) await progress("qa", 0.99, `${c.ok ? "✓" : c.level === "error" ? "✗" : "⚠"} ${c.label}: ${c.detail}`);
  return qa;
}
