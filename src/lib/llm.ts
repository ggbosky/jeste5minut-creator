import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import fs from "node:fs";
import { z } from "zod";
import { requireKey } from "./keys";
import { getSettings } from "./settings";
import { all, one, run } from "./db";
import { CLAUDE_MODELS, HOOK_TYPES, TEMPLATES, DEFAULT_POSES, type LlmTask } from "./constants";
import { HttpError } from "./api";
import { ScriptSchema, SceneSchema, type Script } from "./script";

const FALLBACK_MODELS = new Set(["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

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

function chaptersText() {
  const ch = all<{ n: number; title: string; idea: string; body: string }>("SELECT * FROM chapters ORDER BY n");
  const used = all<{ chapter: number; title: string; number: string }>("SELECT chapter, title, number FROM videos ORDER BY number");
  return ch
    .map((c) => {
      const u = used.filter((v) => v.chapter === c.n).map((v) => `video ${v.number} „${v.title}“`);
      return `${c.n}. ${c.title} — ${c.idea}${u.length ? ` [už použito: ${u.join(", ")}]` : " [zatím nepoužito]"}${c.body ? `\n   Text kapitoly: ${c.body.slice(0, 4000)}` : ""}`;
    })
    .join("\n");
}

export function systemPrompt(): string {
  const b = getSettings("brand");
  const c = getSettings("content");
  const llm = getSettings("llm");
  const poses = DEFAULT_POSES.filter((p) => p.inScript)
    .map((p) => `- ${p.key}: ${p.usage}`)
    .join("\n");
  const templates = TEMPLATES.map(
    (t) => `- ${t.key} (${t.label}; ${t.usage}) params: ${t.params.map((p) => `${p.key}${p.list ? " (položky oddělené |)" : ""} např. „${p.example}“`).join(", ")}; events: ${t.events.join(", ")}`,
  ).join("\n");
  return `Jsi scenárista krátkých videí (Instagram Reels a TikTok, 9:16) pro produkt „${b.name}“ (zkratka ${b.abbr}).
Video ukazuje AI avatara, který mluví k divákovi a propaguje e-book.

PRODUKT
- Claim: ${b.claim}
- Cílovka: ${b.audience}
- Formát: ${b.format}
- Bonus: ${b.bonus}
- CTA ve videu: „${b.cta.text}“. Cenu ve videu nikdy neříkej.

KAPITOLY = ZÁSOBNÍK TÉMAT (každé video stojí na jedné kapitole a dává jeden tip)
${chaptersText()}

TÓN
${c.tone}

ZAKÁZÁNO
${c.forbidden}

TYPY HOOKŮ
${HOOK_TYPES.map((h) => `- ${h.key}: ${h.label} — ${h.hint}`).join("\n")}

PRAVIDLA SCÉNÁŘE
- ${c.words_min}–${c.words_max} slov mluveného textu celkem v ${c.scenes_min}–${c.scenes_max} scénách.
- Věty do ${c.max_words_per_sentence} slov. Čísla v mluveném textu piš slovy („tři“, ne „3“).
- on_screen: 2–5 slov, právě jedno slovo v *hvězdičkách* = oranžový akcent.
- pose: jen ${poses.split("\n").length} povolených póz:
${poses}
- Poslední scéna je vždy CTA s pózou Point_down a šablonou ebook_cta.
- counter: např. „KROK 2/4“ nebo „TIP 1/3“, jinak null.
- graphic: lidský popis grafiky a slova, na kterém se něco stane.
- template + params + events: vyber šablonu z knihovny, vyplň parametry (params jako pole {key, value}) a události navázané na konkrétní mluvené slovo ze scény.
  Žádná scéna nesmí zůstat prázdná — když se nic nehodí, použij numbered_circles, text_card nebo big_number.
- continue_from_scene: true, pokud grafika plynule pokračuje z předchozí scény (např. sort_columns přes víc scén).
- pose_extra: volitelná krátká póza na konkrétním slově (gesto), jinak [].
- audio_parts: 2–4 části, každá pokrývá několik po sobě jdoucích scén (7–18 s), má jinou náladu (mood),
  stability 0.40–0.55 (45 % emoce, 50 % běžný text, 55 % tipy) a tagged_text = mluvený text těch scén slovo od slova,
  doplněný audio tagy v hranatých závorkách pro Eleven v3 (např. [sighs], [playful], [reassuring], [confident], [softly, warm]).
  Text bez tagů se musí přesně shodovat se spoken.
- sfx: nejvýš ${c.max_sfx} efekty (pop, tick, swoosh), každý se scénou a slovem.
- caption: jeden krátký úderný řádek: hook + šipka na odkaz, např. „Nejsi líný. Jen utíkáš. 🔁 Jak z toho ven → odkaz v bio.“
- hashtags: nejvýš ${c.max_hashtags}, s #.
- slug: název slovy spojenými _, bez diakritiky. id: dvoumístné pořadové číslo.
- Délku řídí hlas: reálné tempo je cca ${c.words_per_second} slova/s, cílová délka cca ${c.target_duration_s} s.

KNIHOVNA GRAFICKÝCH ŠABLON
${templates}

PŘÍKLAD (scénář 02, zkráceno na první dvě scény)
{"id":"02","title":"3 dny do zkoušky","slug":"3_Dny_do_zkousky","chapter":4,"hook_type":"scene","scenes":[
{"n":1,"spoken":"Zbývají tři dny do zkoušky. A ty umíš... nic.","on_screen":"3 dny do *zkoušky*","pose":"Shrug","return_to_neutral":false,"counter":null,"graphic":"Karta kalendáře, velké oranžové 3; na slově „nic“ prázdný seznam.","template":"calendar_countdown","params":[{"key":"number","value":"3"},{"key":"unit","value":"dny"},{"key":"header","value":"ZKOUŠKA ZA"}],"events":[{"word":"tři","action":"shake"},{"word":"nic","action":"show_empty_list"}],"continue_from_scene":false,"pose_extra":[]},
{"n":2,"spoken":"Dobře. Žádná panika. Tohle je plán na tři dny.","on_screen":"Žádná *panika*","pose":"Original","return_to_neutral":false,"counter":null,"graphic":"Kalendář se změní na kartu Plán na 3 dny: Den 1 / Den 2 / Den 3.","template":"calendar_to_plan","params":[{"key":"title","value":"Plán na 3 dny"},{"key":"days","value":"Den 1|Den 2|Den 3"}],"events":[{"word":"Tohle","action":"morph_to_plan"}],"continue_from_scene":false,"pose_extra":[]}],
"audio_parts":[{"part":1,"scenes":[1,2],"mood":"povzdech, pak klidné uklidnění","stability":0.45,"tagged_text":"[sighs] Zbývají tři dny do zkoušky. [playful] A ty umíš... nic. [reassuring] Dobře. Žádná panika. Tohle je plán na tři dny."}],
"sfx":[{"type":"tick","scene":1,"word":"tři"}],"caption":"3 dny do zkoušky? Tady je plán. 📚 Celý na 14 dní → odkaz v bio.","hashtags":["#zkouskove","#zkouska","#vysokaskola","#studentlife","#odkladani"]}
${c.extra_rules ? `\nDALŠÍ PRAVIDLA\n${c.extra_rules}` : ""}${llm.system_prompt_extra ? `\n\n${llm.system_prompt_extra}` : ""}

Odpovídej vždy česky a přesně ve tvaru požadovaného JSON schématu.`;
}

// ------------------------- úlohy -------------------------

export const TopicsSchema = z.object({
  topics: z.array(
    z.object({
      chapter: z.number().int(),
      hook_type: z.enum(["myth", "scene", "direct"]),
      title: z.string(),
      angle: z.string(),
      hook_line: z.string(),
    }),
  ),
});

export async function suggestTopics(opts: { count: number; chapter?: number | null; hook_type?: string | null; custom?: string }) {
  const existing = all<{ title: string; chapter: number }>("SELECT title, chapter FROM videos UNION ALL SELECT title, chapter FROM topics");
  const prompt = `Navrhni ${opts.count} témat pro nová videa.
${opts.chapter ? `Všechna z kapitoly ${opts.chapter}.` : "Upřednostni nepoužité kapitoly, ale témata můžou být i z použitých, pokud jde o jiný tip."}
${opts.hook_type ? `Typ hooku: ${opts.hook_type}.` : "Střídej typy hooků (myth, scene, direct)."}
${opts.custom ? `Vlastní zadání od Filipa: ${opts.custom}` : ""}
Neopakuj tato existující témata: ${existing.map((e) => `„${e.title}“ (kap. ${e.chapter})`).join(", ") || "žádná"}.
Ke každému: krátký název (2–5 slov), úhel / jaký jeden tip video dá (1 věta) a první věta hooku tak, jak zazní.`;
  const r = await callClaude({ task: "topics", system: systemPrompt(), content: [...ebookBlock(), { type: "text", text: prompt }], schema: TopicsSchema });
  return r.parsed!.topics;
}

export async function generateScript(v: { number: string; title: string; chapter: number; hook_type: string; angle: string }, fixErrors?: { script: Script; errors: string[] }) {
  let prompt = `Napiš scénář videa ${v.number}.
- Pracovní název: ${v.title}
- Kapitola: ${v.chapter}
- Typ hooku: ${v.hook_type}
- Úhel / tip: ${v.angle || "vyber nejsilnější tip z kapitoly"}
Pole id = "${v.number}". Vrať celý scénář jako jeden JSON objekt.`;
  if (fixErrors) {
    prompt += `\n\nPředchozí verze neprošla automatickými kontrolami. Oprav přesně tyto chyby a zbytek zachovej:\n${fixErrors.errors.map((e) => `- ${e}`).join("\n")}\n\nPředchozí verze:\n${JSON.stringify(fixErrors.script)}`;
  }
  const r = await callClaude({ task: "script", system: systemPrompt(), content: [...ebookBlock(), { type: "text", text: prompt }], schema: ScriptSchema });
  return { script: r.parsed!, model: r.model, usage: r.usage, ms: r.ms };
}

export async function regenerateScene(script: Script, n: number, instruction: string) {
  const prompt = `Tady je celý scénář:\n${JSON.stringify(script)}\n\nPřepiš jen scénu ${n}${n === 1 ? " (hook)" : ""}. ${instruction || "Udělej ji úderněji, zachovej délku a návaznost."}
Zachovej číslo scény n=${n}. Mluvený text musí navazovat na ostatní scény. Vrať jen tuto jednu scénu.`;
  const r = await callClaude({ task: "scene", system: systemPrompt(), content: [{ type: "text", text: prompt }], schema: SceneSchema });
  return r.parsed!;
}

export const RevisionSchema = z.object({
  summary: z.string(),
  script: ScriptSchema,
});

/** Připomínky z kontroly videa → úprava scénáře/specu (nová verze renderu). */
export async function applyRevision(script: Script, comments: { scene: number | null; comment: string }[], locked: boolean) {
  const prompt = `Filip zkontroloval vyrenderované video a má připomínky. Přelož je na co nejmenší změny scénáře.
${locked ? "DŮLEŽITÉ: audio už je nahrané, takže NESMÍŠ měnit mluvený text (spoken), tagged_text ani audio_parts. Měň jen pózy, on_screen, grafiku (template/params/events), počítadlo, efekty, popisek a hashtagy." : ""}
Připomínky:
${comments.map((c) => `- ${c.scene ? `scéna ${c.scene}: ` : ""}${c.comment}`).join("\n")}

Aktuální scénář:
${JSON.stringify(script)}

Vrať summary (1–3 věty co jsi změnil) a celý upravený scénář.`;
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
