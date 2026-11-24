import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import fs from "node:fs";
import { z } from "zod";
import { requireKey } from "./keys";
import { getSettings } from "./settings";
import { all, one, run } from "./db";
import { CLAUDE_MODELS, type LlmTask } from "./constants";
import { buildSystemPrompt, topicsPrompt, scriptPrompt, scenePrompt, revisionPrompt, TopicsSchema, RevisionSchema, FALLBACK_MODELS, type PromptData } from "./prompts";
export { TopicsSchema, RevisionSchema };
import { HttpError } from "./api";
import { ScriptSchema, SceneSchema, type Script } from "./script";


export function client(key?: string) {
  return new Anthropic({ apiKey: key ?? requireKey("anthropic"), maxRetries: 2, timeout: 5 * 60_000 });
}

export function recordUsage(provider: string, model: string, task: string, u: { input?: number; output?: number; chars?: number; ok?: boolean }) {
  const m = CLAUDE_MODELS.find((x) => x.id === model);
  let cost = 0;
  if (provider === "anthropic" && m) cost = ((u.input ?? 0) * m.input + (u.output ?? 0) * m.output) / 1_000_000;
  // ElevenLabs: orientační cena ~0,30 USD / 1000 znaků (Creator tier) — jen pro přehled
  if (provider === "elevenlabs") cost = ((u.chars ?? 0) / 1000) * 0.3;
  run(
    "INSERT INTO api_usage(provider, model, task, input_tokens, output_tokens, characters, cost_usd, ok) VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
    provider,
    model,
    task,
    u.input ?? 0,
    u.output ?? 0,
    u.chars ?? 0,
    cost,
    u.ok === false ? 0 : 1,
  );
}

function describeError(e: unknown): HttpError {
  if (e instanceof Anthropic.AuthenticationError) return new HttpError(401, "Anthropic: neplatný API klíč.");
  if (e instanceof Anthropic.PermissionDeniedError) return new HttpError(403, "Anthropic: klíč nemá oprávnění k tomuto modelu.");
  if (e instanceof Anthropic.NotFoundError) return new HttpError(400, "Anthropic: model nenalezen — zkontroluj Nastavení → Modely.");
  if (e instanceof Anthropic.RateLimitError) return new HttpError(429, "Anthropic: překročen limit požadavků, zkus to za chvíli.");
  if (e instanceof Anthropic.BadRequestError) return new HttpError(400, `Anthropic: ${e.message}`);
  if (e instanceof Anthropic.APIConnectionError) return new HttpError(502, "Anthropic: nelze se připojit k API.");
  if (e instanceof Anthropic.APIError) return new HttpError(502, `Anthropic: ${e.message}`);
  if (e instanceof HttpError) return e;
  return new HttpError(500, e instanceof Error ? e.message : String(e));
}

type CallOpts<T extends z.ZodType> = {
  task: LlmTask | "playground";
  system: string;
  content: Anthropic.Beta.Messages.BetaContentBlockParam[];
  schema?: T;
  override?: { model?: string; effort?: string; max_tokens?: number };
};

export async function callClaude<T extends z.ZodType>(opts: CallOpts<T>): Promise<{ text: string; parsed: z.infer<T> | null; model: string; usage: { input: number; output: number }; ms: number }> {
  const llm = getSettings("llm");
  const cfg = { ...(llm.tasks[opts.task] ?? llm.tasks.script), ...(opts.override ?? {}) };
  const model = cfg.model;
  const useFallback = llm.refusal_fallback && FALLBACK_MODELS.has(model);
  const t0 = Date.now();
  try {
    const params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: cfg.max_tokens,
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.content }],
      output_config: {
        effort: cfg.effort as "low" | "medium" | "high" | "xhigh" | "max",
        ...(opts.schema ? { format: zodOutputFormat(opts.schema) } : {}),
      },
      ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    };
    const res = await client().beta.messages.create(params);
    const usage = { input: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0), output: res.usage.output_tokens };
    recordUsage("anthropic", res.model, opts.task, usage);
    if (res.stop_reason === "refusal") throw new HttpError(422, "Model požadavek odmítl (refusal). Zkus upravit zadání.");
    if (res.stop_reason === "max_tokens") throw new HttpError(422, "Odpověď byla useknuta (max_tokens). Zvyš limit v Nastavení → Modely.");
    const text = res.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    let parsed: z.infer<T> | null = null;
    if (opts.schema) {
      const r = opts.schema.safeParse(JSON.parse(text));
      if (!r.success) throw new HttpError(422, "Model vrátil JSON, který neodpovídá schématu.", r.error.issues.slice(0, 5));
      parsed = r.data;
    }
    return { text, parsed, model: res.model, usage, ms: Date.now() - t0 };
  } catch (e) {
    if (!(e instanceof HttpError)) recordUsage("anthropic", model, opts.task, { ok: false });
    throw describeError(e);
  }
}

// ------------------------- kontext a prompty -------------------------

function ebookBlock(): Anthropic.Beta.Messages.BetaContentBlockParam[] {
  const llm = getSettings("llm");
  if (!llm.attach_ebook_pdf) return [];
  const a = one<{ file: string }>("SELECT file FROM assets WHERE key = 'ebook_pdf'");
  if (!a || !fs.existsSync(a.file)) return [];
  return [
    {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: fs.readFileSync(a.file).toString("base64") },
      title: "E-book Ještě 5 minut",
      cache_control: { type: "ephemeral" },
    },
  ];
}

function promptData(): PromptData {
  return {
    brand: getSettings("brand"),
    content: getSettings("content"),
    llm: getSettings("llm"),
    chapters: all<{ n: number; title: string; idea: string; body: string }>("SELECT * FROM chapters ORDER BY n"),
    used: all<{ chapter: number; title: string; number: string }>("SELECT chapter, title, number FROM videos ORDER BY number"),
  };
}

export function systemPrompt(): string {
  return buildSystemPrompt(promptData());
}

// ------------------------- úlohy -------------------------


export async function suggestTopics(opts: { count: number; chapter?: number | null; hook_type?: string | null; custom?: string }) {
  const existing = all<{ title: string; chapter: number }>("SELECT title, chapter FROM videos UNION ALL SELECT title, chapter FROM topics");
  const prompt = topicsPrompt(opts, existing);
  const r = await callClaude({ task: "topics", system: systemPrompt(), content: [...ebookBlock(), { type: "text", text: prompt }], schema: TopicsSchema });
  return r.parsed!.topics;
}

export async function generateScript(v: { number: string; title: string; chapter: number; hook_type: string; angle: string }, fixErrors?: { script: Script; errors: string[] }) {
  const prompt = scriptPrompt(v, fixErrors);
  const r = await callClaude({ task: "script", system: systemPrompt(), content: [...ebookBlock(), { type: "text", text: prompt }], schema: ScriptSchema });
  return { script: r.parsed!, model: r.model, usage: r.usage, ms: r.ms };
}

export async function regenerateScene(script: Script, n: number, instruction: string) {
  const prompt = scenePrompt(script, n, instruction);
  const r = await callClaude({ task: "scene", system: systemPrompt(), content: [{ type: "text", text: prompt }], schema: SceneSchema });
  return r.parsed!;
}


/** Připomínky z kontroly videa → úprava scénáře/specu (nová verze renderu). */
export async function applyRevision(script: Script, comments: { scene: number | null; comment: string }[], locked: boolean) {
  const prompt = revisionPrompt(script, comments, locked);
  const r = await callClaude({ task: "revision", system: systemPrompt(), content: [{ type: "text", text: prompt }], schema: RevisionSchema });
  return r.parsed!;
}

export async function testAnthropicKey(key: string) {
  const c = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 20_000 });
  const page = await c.models.list({ limit: 20 });
  return page.data.map((m) => m.id);
}

export async function listAnthropicModels() {
  const c = client();
  const out: { id: string; display_name: string }[] = [];
  for await (const m of c.models.list({ limit: 100 })) out.push({ id: m.id, display_name: m.display_name });
  return out;
}
