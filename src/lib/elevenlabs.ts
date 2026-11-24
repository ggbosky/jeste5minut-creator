import { requireKey } from "./keys";
import { HttpError } from "./api";
import { recordUsage } from "./llm";
import type { VoiceProfile } from "./outputs";

const BASE = "https://api.elevenlabs.io";

async function el(path: string, init: RequestInit & { key?: string } = {}) {
  const key = init.key ?? requireKey("elevenlabs");
  const res = await fetch(BASE + path, { ...init, headers: { "xi-api-key": key, ...(init.headers || {}) } });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j?.detail?.message || j?.detail?.status || (typeof j?.detail === "string" ? j.detail : JSON.stringify(j?.detail ?? j));
    } catch {}
    if (res.status === 401) throw new HttpError(401, `ElevenLabs: neplatný klíč (${msg})`);
    throw new HttpError(502, `ElevenLabs ${res.status}: ${msg}`);
  }
  return res;
}

export type ElVoice = { voice_id: string; name: string; category: string; labels: Record<string, string>; preview_url: string | null };

export async function listVoices(key?: string): Promise<ElVoice[]> {
  const r = await el("/v1/voices", { key });
  const j = await r.json();
  return (j.voices ?? []).map((v: ElVoice) => ({ voice_id: v.voice_id, name: v.name, category: v.category, labels: v.labels ?? {}, preview_url: v.preview_url ?? null }));
}

export async function subscription(key?: string) {
  const r = await el("/v1/user/subscription", { key });
  const j = await r.json();
  return {
    tier: j.tier as string,
    character_count: j.character_count as number,
    character_limit: j.character_limit as number,
    next_reset: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString() : null,
  };
}

export async function listModels() {
  const r = await el("/v1/models");
  const j = (await r.json()) as { model_id: string; name: string; can_do_text_to_speech: boolean }[];
  return j.filter((m) => m.can_do_text_to_speech).map((m) => ({ id: m.model_id, name: m.name }));
}

export async function tts(profile: Pick<VoiceProfile, "voice_id" | "model_id" | "similarity" | "style" | "speed" | "speaker_boost">, text: string, stability: number, outputFormat = "mp3_44100_192"): Promise<Buffer> {
  if (!profile.voice_id) throw new HttpError(400, "Profil hlasu nemá voice_id. Vyber hlas v Nastavení → Hlasy.");
  const isV3 = profile.model_id.startsWith("eleven_v3");
  // v3 přijímá stability jen v krocích 0.0 / 0.5 / 1.0 (Creative / Natural / Robust)
  const stab = isV3 ? (stability < 0.34 ? 0 : stability < 0.75 ? 0.5 : 1) : stability;
  const voice_settings: Record<string, unknown> = {
    stability: stab,
    similarity_boost: profile.similarity,
    use_speaker_boost: !!profile.speaker_boost,
  };
  if (!isV3) {
    voice_settings.style = profile.style;
    voice_settings.speed = profile.speed;
  }
  const r = await el(`/v1/text-to-speech/${encodeURIComponent(profile.voice_id)}?output_format=${outputFormat}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: profile.model_id, voice_settings, language_code: profile.model_id.includes("multilingual") ? undefined : "cs" }),
  });
  const buf = Buffer.from(await r.arrayBuffer());
  recordUsage("elevenlabs", profile.model_id, "tts", { chars: text.length });
  return buf;
}

export type SttWord = { text: string; start: number; end: number };

/** Speech-to-text s časy slov (ElevenLabs Scribe). */
export async function speechToText(file: Buffer, fileName: string, model = "scribe_v1"): Promise<SttWord[]> {
  const fd = new FormData();
  fd.append("model_id", model);
  fd.append("language_code", "ces");
  fd.append("timestamps_granularity", "word");
  fd.append("tag_audio_events", "false");
  fd.append("file", new Blob([new Uint8Array(file)]), fileName);
  const r = await el("/v1/speech-to-text", { method: "POST", body: fd });
  const j = await r.json();
  recordUsage("elevenlabs", model, "stt", { chars: (j.text ?? "").length });
  return (j.words ?? [])
    .filter((w: { type: string }) => w.type === "word")
    .map((w: { text: string; start: number; end: number }) => ({ text: w.text, start: w.start, end: w.end }));
}
