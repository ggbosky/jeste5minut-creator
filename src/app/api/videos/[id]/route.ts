import fs from "node:fs";
import path from "node:path";
import { route, body, logActivity } from "@/lib/api";
import { all, run, DATA_DIR } from "@/lib/db";
import { getVideo, takes, videoScript, scriptChecks } from "@/lib/videos";
import { slugify } from "@/lib/script";

type P = { id: string };

export const GET = route<P>(async (_req, { params }) => {
  const id = Number(params.id);
  const v = getVideo(id);
  const s = videoScript(v);
  return {
    video: { ...v, script: undefined, spec: undefined, timeline: undefined, publish_info: v.publish_info ? JSON.parse(v.publish_info) : null },
    script: s,
    checks: s ? scriptChecks(s) : [],
    takes: takes(id).map((t) => ({ ...t, file: undefined, meta: t.meta ? JSON.parse(t.meta) : null })),
    renders: all<Record<string, unknown>>("SELECT id, version, status, stage, progress, notes, duration_s, render_seconds, qa, created_at, finished_at, output_file IS NOT NULL AS has_output, contact_sheet IS NOT NULL AS has_sheet FROM renders WHERE video_id = ? ORDER BY version DESC", id).map((r) => ({ ...r, qa: r.qa ? JSON.parse(r.qa as string) : null })),
    revisions: all("SELECT id, render_version, scene, comment, status, created_at FROM revisions WHERE video_id = ? ORDER BY id DESC", id),
    versions: all("SELECT id, source, note, created_at FROM script_versions WHERE video_id = ? ORDER BY id DESC LIMIT 30", id),
    timeline: v.timeline ? JSON.parse(v.timeline) : null,
  };
});

export const PATCH = route<P>(async (req, { params, user }) => {
  const id = Number(params.id);
  getVideo(id);
  const b = await body<{ title?: string; angle?: string; chapter?: number; hook_type?: string; voice_profile_id?: number; status?: string }>(req);
  if (b.title !== undefined) run("UPDATE videos SET title = ?, slug = ? WHERE id = ?", b.title, slugify(b.title), id);
  if (b.angle !== undefined) run("UPDATE videos SET angle = ? WHERE id = ?", b.angle, id);
  if (b.chapter !== undefined) run("UPDATE videos SET chapter = ? WHERE id = ?", b.chapter, id);
  if (b.hook_type !== undefined) run("UPDATE videos SET hook_type = ? WHERE id = ?", b.hook_type, id);
  if (b.voice_profile_id !== undefined) run("UPDATE videos SET voice_profile_id = ? WHERE id = ?", b.voice_profile_id, id);
  if (b.status !== undefined) run("UPDATE videos SET status = ? WHERE id = ?", b.status, id);
  run("UPDATE videos SET updated_at = datetime('now') WHERE id = ?", id);
  logActivity(user.id, "video.save", "video", id);
  return { ok: true };
});

export const DELETE = route<P>(async (_req, { params, user }) => {
  const id = Number(params.id);
  const v = getVideo(id);
  run("DELETE FROM videos WHERE id = ?", id);
  run("UPDATE topics SET status = 'backlog', video_id = NULL WHERE video_id = ?", id);
  const dir = path.join(DATA_DIR, "videos", String(id));
  if (dir.startsWith(path.join(DATA_DIR, "videos")) && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  logActivity(user.id, "video.delete", "video", null, `${v.number} ${v.title}`);
  return { ok: true };
});
