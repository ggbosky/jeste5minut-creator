import fs from "node:fs";
import { route, body, HttpError } from "@/lib/api";
import { one, run } from "@/lib/db";
import { refreshAudioStatus, type TakeRow } from "@/lib/videos";

type P = { id: string; takeId: string };
const take = (p: P) => {
  const t = one<TakeRow>("SELECT * FROM audio_takes WHERE id = ? AND video_id = ?", Number(p.takeId), Number(p.id));
  if (!t) throw new HttpError(404, "Take nenalezen");
  return t;
};

export const GET = route<P>(async (_req, { params }) => {
  const t = take(params);
  const buf = fs.readFileSync(t.file);
  const type = t.file.endsWith(".wav") ? "audio/wav" : t.file.endsWith(".m4a") ? "audio/mp4" : "audio/mpeg";
  return new Response(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
});

export const PATCH = route<P>(async (req, { params }) => {
  const t = take(params);
  const b = await body<{ selected?: boolean }>(req);
  if (b.selected) {
    run("UPDATE audio_takes SET selected = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE video_id = ? AND part = ?", t.id, t.video_id, t.part);
    refreshAudioStatus(t.video_id);
  }
  return { ok: true };
});

export const DELETE = route<P>(async (_req, { params }) => {
  const t = take(params);
  run("DELETE FROM audio_takes WHERE id = ?", t.id);
  fs.rmSync(t.file, { force: true });
  if (t.selected) {
    const other = one<{ id: number }>("SELECT id FROM audio_takes WHERE video_id = ? AND part = ? ORDER BY id DESC LIMIT 1", t.video_id, t.part);
    if (other) run("UPDATE audio_takes SET selected = 1 WHERE id = ?", other.id);
  }
  refreshAudioStatus(t.video_id);
  return { ok: true };
});
