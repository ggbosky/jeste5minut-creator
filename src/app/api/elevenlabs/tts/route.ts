import { route, body, HttpError } from "@/lib/api";
import { tts } from "@/lib/elevenlabs";
import { applyPronunciation, stripAllTags } from "@/lib/outputs";
import { getSettings } from "@/lib/settings";

// Laboratoř: vyzkoušení hlasu s libovolným nastavením (bez uložení)
export const POST = route(async (req) => {
  const b = await body<{ text: string; voice_id: string; model_id: string; stability: number; similarity: number; style: number; speed: number; speaker_boost: boolean; use_tags: boolean }>(req);
  if (!b.text?.trim()) throw new HttpError(400, "Zadej text");
  if (b.text.length > 1500) throw new HttpError(400, "Max 1500 znaků v laboratoři");
  const text = applyPronunciation(b.use_tags ? b.text : stripAllTags(b.text), getSettings("content").pronunciation);
  const audio = await tts({ voice_id: b.voice_id, model_id: b.model_id, similarity: b.similarity, style: b.style, speed: b.speed, speaker_boost: b.speaker_boost ? 1 : 0 }, text, b.stability);
  return new Response(new Uint8Array(audio), { headers: { "content-type": "audio/mpeg", "x-text": encodeURIComponent(text.slice(0, 200)) } });
});
