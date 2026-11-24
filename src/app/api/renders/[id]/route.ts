import { route, HttpError } from "@/lib/api";
import { one } from "@/lib/db";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const r = one<Record<string, unknown>>("SELECT id, video_id, version, status, stage, progress, log, qa, duration_s, render_seconds, created_at, finished_at, output_file IS NOT NULL AS has_output FROM renders WHERE id = ?", Number(params.id));
  if (!r) throw new HttpError(404, "Render nenalezen");
  return { ...r, qa: r.qa ? JSON.parse(r.qa as string) : null };
});
