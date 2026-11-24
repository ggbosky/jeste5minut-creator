import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { VideoList } from "./VideoList";

export const dynamic = "force-dynamic";

export default async function VideosPage() {
  await requireUser();
  const videos = all<{ id: number; number: string; title: string; chapter: number; hook_type: string; status: string; updated_at: string; published_at: string | null; last_version: number | null; last_status: string | null }>(
    `SELECT v.id, v.number, v.title, v.chapter, v.hook_type, v.status, v.updated_at, v.published_at,
            (SELECT MAX(version) FROM renders r WHERE r.video_id = v.id) last_version,
            (SELECT status FROM renders r WHERE r.video_id = v.id ORDER BY version DESC LIMIT 1) last_status
     FROM videos v ORDER BY CAST(v.number AS INTEGER) DESC`,
  );
  const chapters = all<{ n: number; title: string }>("SELECT n, title FROM chapters ORDER BY n");
  return <VideoList videos={videos} chapters={chapters} />;
}
