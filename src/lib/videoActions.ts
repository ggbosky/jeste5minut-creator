// Sdílená logika akcí nad videem (volaná z route handlerů).
import fs from "node:fs";
import path from "node:path";
import { all, one, run } from "./db";
import { HttpError, logActivity } from "./api";
import { getSettings } from "./settings";
import { generateScript } from "./llm";
import { normalizeScript, ScriptSchema, type Script } from "./script";
import { getVideo, saveScript, scriptChecks, setStatus, videoDir, videoScript, voiceProfile } from "./videos";
import { elevenLabsMarkdown, cutMarkdown, fileName } from "./outputs";
import { enqueueRender } from "./pipeline";
import type { User } from "./auth";

export async function generateForVideo(videoId: number, user: User) {
  const v = getVideo(videoId);
  if (v.script_locked) throw new HttpError(409, "Scénář je schválený. Nejdřív ho odemkni.");
  const llm = getSettings("llm");
  let { script } = await generateScript({ number: v.number, title: v.title, chapter: v.chapter, hook_type: v.hook_type, angle: v.angle });
  script = normalizeScript({ ...script, id: v.number });
  let checks = scriptChecks(script);
  for (let i = 0; i < llm.auto_fix_attempts && checks.some((c) => c.level === "error"); i++) {
    const errors = checks.filter((c) => c.level === "error").map((c) => (c.scene ? `scéna ${c.scene}: ` : "") + c.message);
    const r = await generateScript({ number: v.number, title: v.title, chapter: v.chapter, hook_type: v.hook_type, angle: v.angle }, { script, errors });
    script = normalizeScript({ ...r.script, id: v.number });
    checks = scriptChecks(script);
  }
  saveScript(videoId, script, "llm", `model ${llm.tasks.script.model}`);
  setStatus(videoId, "script");
  logActivity(user.id, "video.script", "video", videoId, script.title);
  return { script, checks };
}

function audioFieldsChanged(a: Script, b: Script) {
  const sp = (s: Script) => JSON.stringify({ sp: s.scenes.map((x) => x.spoken), ap: s.audio_parts.map((p) => [p.scenes, p.tagged_text]) });
  return sp(a) !== sp(b);
}

export function saveEditedScript(videoId: number, raw: unknown, user: User, source = "edit") {
  const parsed = ScriptSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "Scénář neodpovídá schématu", parsed.error.issues.slice(0, 5));
  const v = getVideo(videoId);
  const script = normalizeScript({ ...parsed.data, id: v.number });
  const prev = videoScript(v);
  if (v.script_locked && prev && audioFieldsChanged(prev, script))
    throw new HttpError(409, "Scénář je schválený — změna mluveného textu = nové audio. Odemkni ho, pokud chceš měnit text.");
  saveScript(videoId, script, source);
  if (v.status === "idea") setStatus(videoId, "script");
  logActivity(user.id, "video.save", "video", videoId);
  return { script, checks: scriptChecks(script) };
}

export function exportNames(videoId: number) {
  const v = getVideo(videoId);
  const b = getSettings("brand");
  const n = getSettings("naming");
  const base = { n: v.number, slug: v.slug, abbr: b.abbr, yy: b.year };
  return {
    elevenlabs: fileName(n.script_pattern, { ...base, type: "ElevenLabs" }) + ".md",
    strih: fileName(n.script_pattern, { ...base, type: "Strih" }) + ".md",
    video: (version: number) => fileName(n.video_pattern, { ...base, version }) + ".mp4",
  };
}

export function writeMarkdowns(videoId: number) {
  const v = getVideo(videoId);
  const s = videoScript(v);
  if (!s) throw new HttpError(400, "Video nemá scénář");
  const names = exportNames(videoId);
  const settings = { brand: getSettings("brand"), content: getSettings("content"), naming: getSettings("naming") };
  const el = elevenLabsMarkdown(s, voiceProfile(v.voice_profile_id), settings);
  const st = cutMarkdown(s);
  fs.writeFileSync(videoDir(videoId, names.elevenlabs), el);
  fs.writeFileSync(videoDir(videoId, names.strih), st);
  return { elevenlabs: { name: names.elevenlabs, content: el }, strih: { name: names.strih, content: st } };
}

export function approve(videoId: number, user: User) {
  const v = getVideo(videoId);
  const s = videoScript(v);
  if (!s) throw new HttpError(400, "Video nemá scénář");
  const errors = scriptChecks(s).filter((c) => c.level === "error");
  if (errors.length) throw new HttpError(422, `Scénář má ${errors.length} chyb(y) — oprav je před schválením.`, errors);
  run("UPDATE videos SET script_locked = 1, approved_at = datetime('now'), audio_stale = 0, updated_at = datetime('now') WHERE id = ?", videoId);
  const hasAudio = one("SELECT 1 FROM audio_takes WHERE video_id = ? AND selected = 1", videoId);
  setStatus(videoId, hasAudio ? "awaiting_audio" : "approved");
  writeMarkdowns(videoId);
  logActivity(user.id, "video.approve", "video", videoId, s.title);
}

export function unlock(videoId: number, user: User) {
  run("UPDATE videos SET script_locked = 0, audio_stale = CASE WHEN EXISTS(SELECT 1 FROM audio_takes WHERE video_id = ?) THEN 1 ELSE 0 END WHERE id = ?", videoId, videoId);
  setStatus(videoId, "script");
  logActivity(user.id, "video.unlock", "video", videoId);
}

export function startRender(videoId: number, user: User, notes = "") {
  const v = getVideo(videoId);
  const s = videoScript(v);
  if (!s) throw new HttpError(400, "Video nemá scénář");
  if (!v.script_locked) throw new HttpError(409, "Nejdřív schval scénář.");
  const sel = all<{ part: number }>("SELECT part FROM audio_takes WHERE video_id = ? AND selected = 1", videoId).map((r) => r.part);
  const missing = s.audio_parts.filter((p) => !sel.includes(p.part)).map((p) => `cast${p.part}.mp3`);
  if (missing.length) throw new HttpError(409, `Chybí audio: ${missing.join(", ")}`);
  const busy = one("SELECT 1 FROM renders WHERE video_id = ? AND status IN ('queued','running')", videoId);
  if (busy) throw new HttpError(409, "Render tohoto videa už běží.");
  const last = one<{ v: number | null }>("SELECT MAX(version) v FROM renders WHERE video_id = ?", videoId);
  const version = (last?.v ?? 0) + 1;
  const r = run("INSERT INTO renders(video_id, version, status, notes, created_by) VALUES(?, ?, 'queued', ?, ?)", videoId, version, notes, user.id);
  const id = Number(r.lastInsertRowid);
  if (v.status !== "published") setStatus(videoId, "render");
  logActivity(user.id, "render.start", "video", videoId, `v${version}`);
  enqueueRender(id);
  return { id, version };
}

export function safeUnderData(file: string | null | undefined) {
  if (!file) throw new HttpError(404, "Soubor neexistuje");
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new HttpError(404, "Soubor neexistuje");
  return abs;
}
