// Claude, ElevenLabs a logika videí pro statickou verzi.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { all, get, add, patch, getBlob, nowIso } from "./db";
import { HttpError, getSettings, requireKey, recordUsage, logActivity } from "./core";
import { buildSystemPrompt, topicsPrompt, scriptPrompt, scenePrompt, revisionPrompt, TopicsSchema, RevisionSchema, FALLBACK_MODELS } from "@/lib/prompts";
import { ScriptSchema, SceneSchema, normalizeScript, validateScript, type Script } from "@/lib/script";
import { elevenLabsMarkdown, cutMarkdown, fileName, buildSpec, type VoiceProfile } from "@/lib/outputs";
import type { LlmTask } from "@/lib/constants";

export type VideoRec = {
  id: number; number: string; title: string; slug: string; chapter: number; hook_type: string; angle: string; status: string;
  script: Script | null; script_locked: number; voice_profile_id: number | null; spec: unknown; timeline: unknown; audio_stale: number;
  approved_at: string | null; published_at: string | null; publish_info: Record<string, unknown> | null; created_by: number | null; created_at: string; updated_at: string;
};
export type TakeRec = { id: number; video_id: number; part: number; original_name: string; source: string; duration_s: number | null; selected: number; meta: Record<string, unknown> | null; created_at: string };
export type RenderRec = { id: number; video_id: number; version: number; status: string; stage: string; progress: number; log: string; qa: unknown; spec: unknown; timeline: unknown; notes: string; duration_s: number | null; render_seconds: number | null; has_output: number; has_sheet: number; created_by: number | null; created_at: string; finished_at: string | null; heartbeat?: number };

// ---------------- Claude ----------------
function describe(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new HttpError(401, "Anthropic: neplatný API klíč.");
  if (e instanceof Anthropic.PermissionDeniedError) return new HttpError(403, "Anthropic: klíč nemá oprávnění k tomuto modelu.");
  if (e instanceof Anthropic.NotFoundError) return new HttpError(400, "Anthropic: model nenalezen — zkontroluj Nastavení → Modely.");
  if (e instanceof Anthropic.RateLimitError) return new HttpError(429, "Anthropic: překročen limit požadavků, zkus to za chvíli.");
  if (e instanceof Anthropic.BadRequestError) return new HttpError(400, `Anthropic: ${e.message}`);
  if (e instanceof Anthropic.APIConnectionError) return new HttpError(502, "Anthropic: nelze se připojit k API.");
  if (e instanceof Anthropic.APIError) return new HttpError(502, `Anthropic: ${e.message}`);
  return new HttpError(500, e instanceof Error ? e.message : String(e));
}

export function anthropic(key: string) {
  return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 5 * 60_000 });
}

export async function callClaude<T extends z.ZodType>(opts: { task: LlmTask | "playground"; system: string; content: Anthropic.Beta.Messages.BetaContentBlockParam[]; schema?: T; override?: { model?: string; effort?: string; max_tokens?: number } }) {
  const llm = await getSettings("llm");
  const cfg = { ...(llm.tasks[opts.task] ?? llm.tasks.script), ...Object.fromEntries(Object.entries(opts.override ?? {}).filter(([, v]) => v !== undefined && v !== "")) };
  const model = cfg.model;
  const useFallback = llm.refusal_fallback && FALLBACK_MODELS.has(model);
  const key = await requireKey("anthropic");
  const t0 = Date.now();
  try {
    const params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: cfg.max_tokens,
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.content }],
      output_config: { effort: cfg.effort as "medium", ...(opts.schema ? { format: zodOutputFormat(opts.schema) } : {}) },
      ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    };
    const res = await anthropic(key).beta.messages.create(params);
    const usage = { input: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0), output: res.usage.output_tokens };
    await recordUsage("anthropic", res.model, opts.task, usage);
    if (res.stop_reason === "refusal") throw new HttpError(422, "Model požadavek odmítl (refusal). Zkus upravit zadání.");
    if (res.stop_reason === "max_tokens") throw new HttpError(422, "Odpověď byla useknuta (max_tokens). Zvyš limit v Nastavení → Modely.");
    const text = res.content.filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
    let parsed: z.infer<T> | null = null;
    if (opts.schema) {
      const r = opts.schema.safeParse(JSON.parse(text));
      if (!r.success) throw new HttpError(422, "Model vrátil JSON, který neodpovídá schématu.", r.error.issues.slice(0, 5));
      parsed = r.data;
    }
    return { text, parsed, model: res.model, usage, ms: Date.now() - t0 };
  } catch (e) {
    if (!(e instanceof HttpError)) await recordUsage("anthropic", model, opts.task, { ok: false });
    throw describe(e);
  }
}

async function promptData() {
  const videos = await all<VideoRec>("videos");
  return {
    brand: await getSettings("brand"),
    content: await getSettings("content"),
    llm: await getSettings("llm"),
    chapters: (await all<{ n: number; title: string; idea: string; body: string }>("chapters")).sort((a, b) => a.n - b.n),
    used: videos.map((v) => ({ chapter: v.chapter, title: v.title, number: v.number })),
  };
}
export async function systemPrompt() {
  return buildSystemPrompt(await promptData());
}
async function ebookBlock(): Promise<Anthropic.Beta.Messages.BetaContentBlockParam[]> {
  if (!(await getSettings("llm")).attach_ebook_pdf) return [];
  const blob = await getBlob("asset-ebook_pdf");
  if (!blob) return [];
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: btoa(s) }, title: "E-book Ještě 5 minut", cache_control: { type: "ephemeral" } }];
}

export async function suggestTopics(opts: { count: number; chapter?: number | null; hook_type?: string | null; custom?: string }) {
  const existing = [...(await all<VideoRec>("videos")), ...(await all<{ title: string; chapter: number }>("topics"))].map((x) => ({ title: x.title, chapter: x.chapter }));
  const r = await callClaude({ task: "topics", system: await systemPrompt(), content: [...(await ebookBlock()), { type: "text", text: topicsPrompt(opts, existing) }], schema: TopicsSchema });
  return r.parsed!.topics;
}
export async function generateScript(v: { number: string; title: string; chapter: number; hook_type: string; angle: string }, fix?: { script: Script; errors: string[] }) {
  const r = await callClaude({ task: "script", system: await systemPrompt(), content: [...(await ebookBlock()), { type: "text", text: scriptPrompt(v, fix) }], schema: ScriptSchema });
  return r.parsed!;
}
export async function regenerateScene(script: Script, n: number, instruction: string) {
  const r = await callClaude({ task: "scene", system: await systemPrompt(), content: [{ type: "text", text: scenePrompt(script, n, instruction) }], schema: SceneSchema });
  return r.parsed!;
}
export async function applyRevision(script: Script, comments: { scene: number | null; comment: string }[], locked: boolean) {
  const r = await callClaude({ task: "revision", system: await systemPrompt(), content: [{ type: "text", text: revisionPrompt(script, comments, locked) }], schema: RevisionSchema });
  return r.parsed!;
}

// ---------------- ElevenLabs ----------------
async function el(path: string, init: RequestInit & { key?: string } = {}) {
  const key = init.key ?? (await requireKey("elevenlabs"));
  const res = await fetch("https://api.elevenlabs.io" + path, { ...init, headers: { "xi-api-key": key, ...(init.headers || {}) } });
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
export async function elVoices() {
  const j = await (await el("/v1/voices")).json();
  return (j.voices ?? []).map((v: { voice_id: string; name: string; category: string; labels: Record<string, string>; preview_url: string | null }) => ({ voice_id: v.voice_id, name: v.name, category: v.category, labels: v.labels ?? {}, preview_url: v.preview_url ?? null }));
}
export async function elSubscription(key?: string) {
  const j = await (await el("/v1/user/subscription", { key })).json();
  return { tier: j.tier, character_count: j.character_count, character_limit: j.character_limit, next_reset: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString() : null };
}
export async function elModels() {
  const j = (await (await el("/v1/models")).json()) as { model_id: string; name: string; can_do_text_to_speech: boolean }[];
  return j.filter((m) => m.can_do_text_to_speech).map((m) => ({ id: m.model_id, name: m.name }));
}
export async function tts(p: Pick<VoiceProfile, "voice_id" | "model_id" | "similarity" | "style" | "speed" | "speaker_boost">, text: string, stability: number, fmt = "mp3_44100_192"): Promise<Blob> {
  if (!p.voice_id) throw new HttpError(400, "Profil hlasu nemá voice_id. Vyber hlas v Nastavení → Hlasy.");
  const isV3 = p.model_id.startsWith("eleven_v3");
  const stab = isV3 ? (stability < 0.34 ? 0 : stability < 0.75 ? 0.5 : 1) : stability;
  const vs: Record<string, unknown> = { stability: stab, similarity_boost: p.similarity, use_speaker_boost: !!p.speaker_boost };
  if (!isV3) {
    vs.style = p.style;
    vs.speed = p.speed;
  }
  const r = await el(`/v1/text-to-speech/${encodeURIComponent(p.voice_id)}?output_format=${fmt}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: p.model_id, voice_settings: vs, language_code: p.model_id.includes("multilingual") ? undefined : "cs" }),
  });
  const blob = await r.blob();
  await recordUsage("elevenlabs", p.model_id, "tts", { chars: text.length });
  return new Blob([blob], { type: "audio/mpeg" });
}

// ---------------- videa ----------------
export async function getVideo(id: number) {
  const v = await get<VideoRec>("videos", id);
  if (!v) throw new HttpError(404, "Video nenalezeno");
  return v;
}
export async function setStatus(id: number, status: string) {
  await patch<VideoRec>("videos", id, { status, updated_at: nowIso() });
}
export async function saveScript(id: number, script: Script, source: string, note = "") {
  await patch<VideoRec>("videos", id, { script, title: script.title, slug: script.slug, chapter: script.chapter, hook_type: script.hook_type, updated_at: nowIso() });
  await add("script_versions", { video_id: id, script, source, note, created_at: nowIso() });
}
export async function checks(script: Script) {
  return validateScript(script, await getSettings("content"));
}
export async function voiceProfile(id?: number | null) {
  const ps = await all<VoiceProfile>("voice_profiles");
  return ps.find((p) => p.id === id) ?? ps.sort((a, b) => b.is_default - a.is_default || a.id - b.id)[0] ?? null;
}
export async function takes(videoId: number) {
  return (await all<TakeRec>("audio_takes")).filter((t) => t.video_id === videoId).sort((a, b) => a.part - b.part || a.id - b.id);
}
export async function refreshAudioStatus(videoId: number) {
  const v = await getVideo(videoId);
  if (!v.script) return;
  const sel = (await takes(videoId)).filter((t) => t.selected).map((t) => t.part);
  const complete = v.script.audio_parts.every((p) => sel.includes(p.part));
  if (["approved", "awaiting_audio"].includes(v.status) && complete) await setStatus(videoId, "render");
  else if (v.status === "approved" && sel.length) await setStatus(videoId, "awaiting_audio");
  else if (v.status === "render" && !complete) await setStatus(videoId, "awaiting_audio");
}
export async function nextNumber() {
  const max = Math.max(0, ...(await all<VideoRec>("videos")).map((v) => parseInt(v.number, 10) || 0));
  return String(max + 1).padStart(2, "0");
}

export async function generateForVideo(id: number, userId: number) {
  const v = await getVideo(id);
  if (v.script_locked) throw new HttpError(409, "Scénář je schválený. Nejdřív ho odemkni.");
  const llm = await getSettings("llm");
  const meta = { number: v.number, title: v.title, chapter: v.chapter, hook_type: v.hook_type, angle: v.angle };
  let script = normalizeScript({ ...(await generateScript(meta)), id: v.number });
  let cs = await checks(script);
  for (let i = 0; i < llm.auto_fix_attempts && cs.some((c) => c.level === "error"); i++) {
    const errors = cs.filter((c) => c.level === "error").map((c) => (c.scene ? `scéna ${c.scene}: ` : "") + c.message);
    script = normalizeScript({ ...(await generateScript(meta, { script, errors })), id: v.number });
    cs = await checks(script);
  }
  await saveScript(id, script, "llm", `model ${llm.tasks.script.model}`);
  await setStatus(id, "script");
  await logActivity(userId, "video.script", "video", id, script.title);
  return { script, checks: cs };
}

export async function specCfg() {
  const b = await getSettings("brand");
  return { videoFilePattern: (await getSettings("naming")).video_pattern, abbr: b.abbr, yy: b.year, render: await getSettings("render"), content: await getSettings("content") };
}
export async function specFor(v: VideoRec) {
  if (!v.script) throw new HttpError(400, "Video nemá scénář");
  return buildSpec(v.script, await specCfg());
}

export async function exportNames(v: VideoRec) {
  const b = await getSettings("brand");
  const n = await getSettings("naming");
  const base = { n: v.number, slug: v.slug, abbr: b.abbr, yy: b.year };
  return {
    elevenlabs: fileName(n.script_pattern, { ...base, type: "ElevenLabs" }) + ".md",
    strih: fileName(n.script_pattern, { ...base, type: "Strih" }) + ".md",
    video: (version: number) => fileName(n.video_pattern, { ...base, version }) + ".mp4",
  };
}
export async function markdowns(v: VideoRec) {
  if (!v.script) throw new HttpError(400, "Video nemá scénář");
  const names = await exportNames(v);
  const settings = { brand: await getSettings("brand"), content: await getSettings("content"), naming: await getSettings("naming") };
  return {
    elevenlabs: { name: names.elevenlabs, content: elevenLabsMarkdown(v.script, await voiceProfile(v.voice_profile_id), settings) },
    strih: { name: names.strih, content: cutMarkdown(v.script) },
  };
}

export async function previewConfig() {
  const b = await getSettings("brand");
  const r = await getSettings("render");
  const c = await getSettings("content");
  const poses = (await all<{ key: string; processed: number; updated_at: string | null }>("poses")).filter((p) => p.processed);
  const cover = await get<{ updated_at: string }>("assets", "cover");
  return {
    brand: { ...b.colors, font: b.font },
    layout: { width: r.width, height: r.height, zone_counter: r.zone_counter, zone_graphic: r.zone_graphic, caption_y: r.caption_y, caption_size: r.caption_size, zone_avatar: r.zone_avatar, avatar_height: r.avatar_height, breathing: r.breathing, blink_min_s: r.blink_min_s, blink_max_s: r.blink_max_s },
    wps: c.words_per_second,
    gesture_s: r.gesture_s,
    poseKeys: poses.map((p) => p.key),
    hasCover: !!cover,
    poseVersion: [...poses.map((p) => p.updated_at), cover?.updated_at].join("|").replace(/\D/g, "").slice(-12),
  };
}
