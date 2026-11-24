import { route, body, logActivity } from "@/lib/api";
import { run } from "@/lib/db";
import { getVideo } from "@/lib/videos";

export const POST = route<{ id: string }>(async (req, { params, user }) => {
  const id = Number(params.id);
  const v = getVideo(id);
  const b = await body<{ published: boolean; date?: string; platforms?: Record<string, { done: boolean; url?: string }>; version?: number }>(req);
  const prev = v.publish_info ? JSON.parse(v.publish_info) : {};
  const info = { ...prev, platforms: b.platforms ?? prev.platforms ?? {}, version: b.version ?? prev.version };
  if (b.published) {
    run("UPDATE videos SET status = 'published', published_at = ?, publish_info = ?, updated_at = datetime('now') WHERE id = ?", b.date || new Date().toISOString(), JSON.stringify(info), id);
    logActivity(user.id, "video.publish", "video", id, Object.entries(info.platforms).filter(([, x]) => (x as { done: boolean }).done).map(([k]) => k).join(", "));
  } else {
    run("UPDATE videos SET status = CASE WHEN status = 'published' THEN 'done' ELSE status END, published_at = NULL, publish_info = ? WHERE id = ?", JSON.stringify(info), id);
  }
  return { ok: true };
});
