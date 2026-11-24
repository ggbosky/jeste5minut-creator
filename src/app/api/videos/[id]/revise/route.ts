import { route, body, HttpError, logActivity } from "@/lib/api";
import { run } from "@/lib/db";
import { applyRevision } from "@/lib/llm";
import { getVideo, videoScript, scriptChecks } from "@/lib/videos";
import { saveEditedScript, startRender, writeMarkdowns } from "@/lib/videoActions";
import { normalizeScript } from "@/lib/script";

// Připomínky z kontroly videa → LLM upraví scénář/spec → volitelně nový render (_v2, _v3…)
export const POST = route<{ id: string }>(async (req, { params, user }) => {
  const id = Number(params.id);
  const b = await body<{ comments: { scene: number | null; comment: string }[]; render_version?: number; render?: boolean; preview?: boolean }>(req);
  const comments = (b.comments ?? []).filter((c) => c.comment?.trim());
  if (!comments.length) throw new HttpError(400, "Napiš aspoň jednu připomínku");
  const v = getVideo(id);
  const s = videoScript(v);
  if (!s) throw new HttpError(400, "Video nemá scénář");
  const r = await applyRevision(s, comments, !!v.script_locked);
  const next = normalizeScript({ ...r.script, id: v.number });
  if (b.preview) return { summary: r.summary, script: next, checks: scriptChecks(next) };
  const saved = saveEditedScript(id, next, user, "revision");
  for (const c of comments) run("INSERT INTO revisions(video_id, render_version, scene, comment, patch, status, created_by) VALUES(?, ?, ?, ?, ?, 'applied', ?)", id, b.render_version ?? null, c.scene, c.comment, r.summary, user.id);
  logActivity(user.id, "video.revise", "video", id, r.summary.slice(0, 200));
  if (v.script_locked) writeMarkdowns(id);
  let render = null;
  if (b.render) render = startRender(id, user, `Připomínky: ${comments.map((c) => c.comment).join("; ").slice(0, 300)}`);
  return { summary: r.summary, checks: saved.checks, render };
});
