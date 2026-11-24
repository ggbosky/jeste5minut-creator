import { route, body } from "@/lib/api";
import { all, run } from "@/lib/db";

const FIELDS = ["name", "voice_id", "voice_name", "model_id", "use_tags", "stability", "similarity", "style", "speed", "speaker_boost", "stability_emotion", "stability_normal", "stability_tips", "notes"] as const;

export const GET = route(async () => ({ profiles: all("SELECT * FROM voice_profiles ORDER BY is_default DESC, id") }));

export const POST = route(async (req) => {
  const b = await body<Record<string, unknown>>(req);
  const vals = FIELDS.map((f) => (typeof b[f] === "boolean" ? (b[f] ? 1 : 0) : (b[f] ?? null)));
  const r = run(
    `INSERT INTO voice_profiles(${FIELDS.join(",")}) VALUES(${FIELDS.map(() => "?").join(",")})`,
    ...vals.map((v, i) => v ?? ({ name: "Nový profil", voice_id: "", voice_name: "", model_id: "eleven_multilingual_v2", use_tags: 0, stability: 0.5, similarity: 0.75, style: 0, speed: 1, speaker_boost: 1, stability_emotion: 0.45, stability_normal: 0.5, stability_tips: 0.55, notes: "" } as Record<string, unknown>)[FIELDS[i]]),
  );
  return { id: Number(r.lastInsertRowid) };
});
