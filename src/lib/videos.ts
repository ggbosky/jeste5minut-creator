import fs from "node:fs";
import path from "node:path";
import { all, one, run, DATA_DIR } from "./db";
import type { Script } from "./script";
import { validateScript } from "./script";
import { getSettings } from "./settings";
import { HttpError } from "./api";
import type { VoiceProfile } from "./outputs";

export type VideoRow = {
  id: number;
  number: string;
  title: string;
  slug: string;
  chapter: number;
  hook_type: string;
  angle: string;
  status: string;
  script: string | null;
  script_locked: number;
  voice_profile_id: number | null;
  spec: string | null;
  timeline: string | null;
  audio_stale: number;
  approved_at: string | null;
  published_at: string | null;
  publish_info: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

export function getVideo(id: number): VideoRow {
  const v = one<VideoRow>("SELECT * FROM videos WHERE id = ?", id);
  if (!v) throw new HttpError(404, "Video nenalezeno");
  return v;
}

export function videoScript(v: VideoRow): Script | null {
  return v.script ? (JSON.parse(v.script) as Script) : null;
}

export function videoDir(id: number, ...p: string[]) {
  const full = path.join(DATA_DIR, "videos", String(id), ...p);
  fs.mkdirSync(path.extname(full) ? path.dirname(full) : full, { recursive: true });
  return full;
}

export function nextNumber(): string {
  const r = one<{ m: number | null }>("SELECT MAX(CAST(number AS INTEGER)) m FROM videos");
  return String((r?.m ?? 0) + 1).padStart(2, "0");
}

export function setStatus(id: number, status: string) {
  run("UPDATE videos SET status = ?, updated_at = datetime('now') WHERE id = ?", status, id);
}

export function saveScript(id: number, script: Script, source: string, note = "") {
  run("UPDATE videos SET script = ?, title = ?, slug = ?, chapter = ?, hook_type = ?, updated_at = datetime('now') WHERE id = ?",
    JSON.stringify(script), script.title, script.slug, script.chapter, script.hook_type, id);
  run("INSERT INTO script_versions(video_id, script, source, note) VALUES(?, ?, ?, ?)", id, JSON.stringify(script), source, note);
}

export function scriptChecks(script: Script) {
  return validateScript(script, getSettings("content"));
}

export function voiceProfile(id?: number | null): VoiceProfile | null {
  if (id) {
    const p = one<VoiceProfile>("SELECT * FROM voice_profiles WHERE id = ?", id);
    if (p) return p;
  }
  return one<VoiceProfile>("SELECT * FROM voice_profiles ORDER BY is_default DESC, id LIMIT 1") ?? null;
}

export type TakeRow = { id: number; video_id: number; part: number; file: string; original_name: string; source: string; duration_s: number | null; selected: number; meta: string | null; created_at: string };

export function takes(videoId: number) {
  return all<TakeRow>("SELECT * FROM audio_takes WHERE video_id = ? ORDER BY part, created_at", videoId);
}

/** Po nahrání audia: když má každá část vybraný take → stav „Render“. */
export function refreshAudioStatus(videoId: number) {
  const v = getVideo(videoId);
  const s = videoScript(v);
  if (!s) return;
  const sel = all<{ part: number }>("SELECT part FROM audio_takes WHERE video_id = ? AND selected = 1", videoId).map((r) => r.part);
  const complete = s.audio_parts.every((p) => sel.includes(p.part));
  if (["approved", "awaiting_audio"].includes(v.status) && complete) setStatus(videoId, "render");
  else if (v.status === "approved" && sel.length) setStatus(videoId, "awaiting_audio");
  else if (v.status === "render" && !complete) setStatus(videoId, "awaiting_audio");
}
