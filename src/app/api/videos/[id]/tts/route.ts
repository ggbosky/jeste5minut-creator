import fs from "node:fs";
import { route, body, HttpError, logActivity } from "@/lib/api";
import { one, run } from "@/lib/db";
import { getVideo, videoDir, videoScript, voiceProfile, refreshAudioStatus } from "@/lib/videos";
import { tts } from "@/lib/elevenlabs";
import { partTextFor } from "@/lib/outputs";
import { getSettings } from "@/lib/settings";
import { probeDuration } from "@/lib/audio";

// Rozšíření: generování hlasu přímo přes ElevenLabs API (2–3 takey na část, vybereš nejlepší)
export const POST = route<{ id: string }>(async (req, { params, user }) => {
  const id = Number(params.id);
  const v = getVideo(id);
  const s = videoScript(v);
  if (!s) throw new HttpError(400, "Video nemá scénář");
  if (!v.script_locked) throw new HttpError(409, "Nejdřív schval scénář — změna textu = nové audio.");
  const b = await body<{ part: number; count?: number; profile_id?: number }>(req);
  const p = s.audio_parts.find((x) => x.part === b.part);
  if (!p) throw new HttpError(400, "Neznámá část");
  const profile = voiceProfile(b.profile_id ?? v.voice_profile_id);
  if (!profile) throw new HttpError(400, "Žádný profil hlasu");
  const voice = getSettings("voice");
  const text = partTextFor(profile, p.tagged_text, getSettings("content").pronunciation);
  const count = Math.max(1, Math.min(4, b.count ?? voice.takes_per_part));
  const stability = profile.use_tags ? p.stability : profile.stability;
  const out = [];
  for (let i = 0; i < count; i++) {
    const audio = await tts(profile, text, stability, voice.output_format);
    const file = videoDir(id, "audio", `cast${p.part}_tts_${Date.now()}_${i + 1}.mp3`);
    fs.writeFileSync(file, audio);
    const duration = await probeDuration(file);
    const hasSel = one("SELECT 1 FROM audio_takes WHERE video_id = ? AND part = ? AND selected = 1", id, p.part);
    run(
      "INSERT INTO audio_takes(video_id, part, file, original_name, source, duration_s, selected, meta) VALUES(?, ?, ?, ?, 'tts', ?, ?, ?)",
      id, p.part, file, `cast${p.part}.mp3 (take ${i + 1})`, duration, hasSel ? 0 : 1,
      JSON.stringify({ profile: profile.name, model: profile.model_id, stability, text }),
    );
    out.push({ duration });
  }
  refreshAudioStatus(id);
  logActivity(user.id, "video.tts", "video", id, `cast${p.part} × ${count} (${profile.name})`);
  return { takes: out };
});
