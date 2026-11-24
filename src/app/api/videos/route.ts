import { route, body, logActivity, HttpError } from "@/lib/api";
import { all, one, run } from "@/lib/db";
import { nextNumber, saveScript } from "@/lib/videos";
import { slugify, normalizeScript } from "@/lib/script";
import { generateForVideo } from "@/lib/videoActions";
import { sampleScript } from "@/lib/sample";

export const GET = route(async () => ({
  videos: all("SELECT id, number, title, slug, chapter, hook_type, status, angle, script_locked, created_at, updated_at, published_at FROM videos ORDER BY CAST(number AS INTEGER) DESC"),
}));

export const POST = route(async (req, { user }) => {
  const b = await body<{ title?: string; chapter?: number; hook_type?: string; angle?: string; topic_id?: number; generate?: boolean; sample?: boolean }>(req);
  let { title = "", chapter = 1, hook_type = "scene", angle = "" } = b;
  if (b.topic_id) {
    const t = one<{ chapter: number; hook_type: string; title: string; angle: string; hook_line: string }>("SELECT * FROM topics WHERE id = ?", b.topic_id);
    if (!t) throw new HttpError(404, "Téma nenalezeno");
    ({ chapter, hook_type, title } = t);
    angle = [t.angle, t.hook_line && `Hook: „${t.hook_line}“`].filter(Boolean).join(" ");
  }
  if (!title.trim()) throw new HttpError(400, "Zadej název");
  if (!["myth", "scene", "direct"].includes(hook_type)) throw new HttpError(400, "Neplatný typ hooku");
  const number = nextNumber();
  const r = run(
    "INSERT INTO videos(number, title, slug, chapter, hook_type, angle, status, created_by, voice_profile_id) VALUES(?, ?, ?, ?, ?, ?, 'idea', ?, (SELECT id FROM voice_profiles ORDER BY is_default DESC, id LIMIT 1))",
    number, title.trim(), slugify(title), chapter, hook_type, angle, user.id,
  );
  const id = Number(r.lastInsertRowid);
  if (b.topic_id) run("UPDATE topics SET status = 'used', video_id = ? WHERE id = ?", id, b.topic_id);
  logActivity(user.id, "video.create", "video", id, `${number} ${title}`);
  if (b.sample) {
    saveScript(id, normalizeScript(sampleScript(number)), "sample");
    run("UPDATE videos SET status = 'script' WHERE id = ?", id);
  } else if (b.generate) {
    try {
      await generateForVideo(id, user);
    } catch (e) {
      return { id, warning: e instanceof Error ? e.message : String(e) };
    }
  }
  return { id };
});
