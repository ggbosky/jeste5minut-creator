import { route, body, HttpError } from "@/lib/api";
import { all, run } from "@/lib/db";

export const GET = route(async () => ({
  topics: all("SELECT t.*, v.number AS video_number FROM topics t LEFT JOIN videos v ON v.id = t.video_id ORDER BY t.status = 'used', t.id DESC"),
}));

export const POST = route(async (req) => {
  const b = await body<{ topics: { chapter: number; hook_type: string; title: string; angle?: string; hook_line?: string }[] }>(req);
  if (!Array.isArray(b.topics) || !b.topics.length) throw new HttpError(400, "Žádná témata");
  for (const t of b.topics) {
    if (!t.title?.trim()) continue;
    run("INSERT INTO topics(chapter, hook_type, title, angle, hook_line) VALUES(?, ?, ?, ?, ?)", t.chapter, t.hook_type, t.title.trim(), t.angle ?? "", t.hook_line ?? "");
  }
  return { ok: true };
});
