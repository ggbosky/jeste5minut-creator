import { route } from "@/lib/api";
import { all } from "@/lib/db";

// Záloha obsahu (bez API klíčů, hesel a binárních souborů)
export const GET = route(async () => {
  const data = {
    exported_at: new Date().toISOString(),
    settings: all("SELECT key, value FROM settings"),
    chapters: all("SELECT * FROM chapters"),
    topics: all("SELECT * FROM topics"),
    videos: all("SELECT id, number, title, slug, chapter, hook_type, angle, status, script, script_locked, voice_profile_id, approved_at, published_at, publish_info, created_at FROM videos"),
    voice_profiles: all("SELECT * FROM voice_profiles"),
    poses: all("SELECT key, file_name, usage, kind, in_script FROM poses"),
    renders: all("SELECT video_id, version, status, duration_s, render_seconds, qa, notes, created_at FROM renders"),
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="j5m-zaloha-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}, { role: "admin" });
