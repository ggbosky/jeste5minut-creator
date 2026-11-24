import { route, body, HttpError } from "@/lib/api";
import { one, run } from "@/lib/db";

const FIELDS = ["name", "voice_id", "voice_name", "model_id", "use_tags", "stability", "similarity", "style", "speed", "speaker_boost", "stability_emotion", "stability_normal", "stability_tips", "notes"];

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const id = Number(params.id);
  const b = await body<Record<string, unknown>>(req);
  for (const f of FIELDS) if (b[f] !== undefined) run(`UPDATE voice_profiles SET ${f} = ? WHERE id = ?`, typeof b[f] === "boolean" ? (b[f] ? 1 : 0) : b[f], id);
  if (b.is_default) run("UPDATE voice_profiles SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END", id);
  return { ok: true };
});

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  const c = one<{ c: number }>("SELECT COUNT(*) c FROM voice_profiles")!.c;
  if (c <= 1) throw new HttpError(400, "Musí zůstat aspoň jeden profil");
  run("DELETE FROM voice_profiles WHERE id = ?", Number(params.id));
  run("UPDATE videos SET voice_profile_id = NULL WHERE voice_profile_id = ?", Number(params.id));
  if (!one("SELECT 1 FROM voice_profiles WHERE is_default = 1")) run("UPDATE voice_profiles SET is_default = 1 WHERE id = (SELECT MIN(id) FROM voice_profiles)");
  return { ok: true };
});
