// Schéma scénáře + validace. Sdílené mezi editorem (klient) a serverem.
import { z } from "zod";
import { SCRIPT_POSES, templateDef } from "./constants";

export const KV = z.object({ key: z.string(), value: z.string() });

export const SceneSchema = z.object({
  n: z.number().int(),
  spoken: z.string(),
  on_screen: z.string(),
  pose: z.enum(SCRIPT_POSES),
  return_to_neutral: z.boolean(),
  counter: z.string().nullable(),
  graphic: z.string(),
  template: z.string(),
  params: z.array(KV),
  events: z.array(z.object({ word: z.string(), action: z.string() })),
  continue_from_scene: z.boolean(),
  pose_extra: z.array(z.object({ word: z.string(), pose: z.enum(SCRIPT_POSES) })),
});

export const AudioPartSchema = z.object({
  part: z.number().int(),
  scenes: z.array(z.number().int()),
  mood: z.string(),
  stability: z.number(),
  tagged_text: z.string(),
});

export const ScriptSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  chapter: z.number().int(),
  hook_type: z.enum(["myth", "scene", "direct"]),
  word_count: z.number().int(),
  cta: z.string(),
  scenes: z.array(SceneSchema),
  audio_parts: z.array(AudioPartSchema),
  sfx: z.array(z.object({ type: z.enum(["pop", "tick", "swoosh"]), scene: z.number().int(), word: z.string() })),
  caption: z.string(),
  hashtags: z.array(z.string()),
});

export type Scene = z.infer<typeof SceneSchema>;
export type AudioPart = z.infer<typeof AudioPartSchema>;
export type Script = z.infer<typeof ScriptSchema>;

export type Check = { level: "error" | "warn" | "ok"; code: string; message: string; scene?: number };

export type ContentRules = {
  words_min: number;
  words_max: number;
  scenes_min: number;
  scenes_max: number;
  max_words_per_sentence: number;
  words_per_second: number;
  target_duration_s: number;
  duration_tolerance: number;
  max_hashtags: number;
  max_sfx: number;
};

// ---------- text utilities ----------
export function stripTags(s: string) {
  return s.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
}
export function normWord(w: string) {
  return w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}
export function words(s: string): string[] {
  return s
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => normWord(w).length > 0);
}
export function sentences(s: string): string[] {
  return s
    .split(/(?<=[.!?…])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}
export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}
/** Hrubý odhad slabik v češtině (pro náhradní časování). */
export function syllables(w: string): number {
  const n = normWord(w);
  if (/^\d+$/.test(n)) return Math.max(1, n.length * 2);
  const m = n.match(/[aeiouy]+/g);
  let c = m ? m.length : 0;
  // slabikotvorné r/l (krk, vlk)
  if (c === 0 && /[rl]/.test(n)) c = 1;
  return Math.max(1, c);
}
export function accentWords(onScreen: string): string[] {
  return [...onScreen.matchAll(/\*([^*]+)\*/g)].map((m) => m[1]);
}
export function paramsToObj(p: { key: string; value: string }[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (const { key, value } of p) o[key] = value;
  return o;
}

export const FORBIDDEN_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /\b(adhd|deprese|depresi|úzkost|uzkost|terapi|léčb|lecb|vyléč|vylec|diagnóz)/i, why: "zmínka o léčbě / diagnóze" },
  { re: /\b(studie|výzkum|vyzkum|vědci|vedci|statistik|procent|%)/i, why: "čísla, studie nebo statistiky" },
  { re: /\b(zaručeně|zarucene|garantuj|100 ?%|navždy|navzdy|okamžitě vyřeší|zázra)/i, why: "přehánění výsledku" },
  { re: /\b(recenz|hodnocení|hvězdič)/i, why: "recenze" },
];

export function estimateDuration(script: Pick<Script, "scenes">, wps: number) {
  const n = script.scenes.reduce((a, s) => a + words(s.spoken).length, 0);
  return n / wps;
}

/** Automatické kontroly před uložením / schválením. */
export function validateScript(s: Script, r: ContentRules): Check[] {
  const out: Check[] = [];
  const err = (code: string, message: string, scene?: number) => out.push({ level: "error", code, message, scene });
  const warn = (code: string, message: string, scene?: number) => out.push({ level: "warn", code, message, scene });

  const allSpoken = s.scenes.map((x) => x.spoken).join(" ");
  const wc = words(allSpoken).length;
  if (wc < r.words_min || wc > r.words_max) err("word_count", `Počet slov ${wc} (má být ${r.words_min}–${r.words_max}).`);
  if (s.word_count !== wc) warn("word_count_field", `Pole word_count (${s.word_count}) neodpovídá skutečnosti (${wc}).`);

  if (s.scenes.length < r.scenes_min || s.scenes.length > r.scenes_max)
    err("scene_count", `Počet scén ${s.scenes.length} (má být ${r.scenes_min}–${r.scenes_max}).`);

  s.scenes.forEach((sc, i) => {
    if (sc.n !== i + 1) warn("scene_n", `Scéna na pozici ${i + 1} má číslo ${sc.n}.`, sc.n);
    for (const sen of sentences(sc.spoken)) {
      const n = words(sen).length;
      if (n > r.max_words_per_sentence) err("sentence_len", `Věta má ${n} slov (max ${r.max_words_per_sentence}): „${sen}“`, sc.n);
    }
    if (/\d/.test(sc.spoken)) warn("digits", "Mluvený text obsahuje číslice — čísla piš slovy.", sc.n);
    const acc = accentWords(sc.on_screen);
    if (acc.length !== 1) err("accent", `Text na obrazovce musí mít právě jeden *akcent* (má ${acc.length}).`, sc.n);
    const osw = words(sc.on_screen.replace(/\*/g, "")).length;
    if (osw < 2 || osw > 5) warn("on_screen_len", `Text na obrazovce má ${osw} slov (2–5).`, sc.n);
    const t = templateDef(sc.template);
    if (!t) err("template", `Neznámá šablona „${sc.template}“.`, sc.n);
    else {
      for (const ev of sc.events) {
        if (!t.events.includes(ev.action)) warn("event", `Šablona ${t.key} nezná událost „${ev.action}“.`, sc.n);
        if (ev.word && !words(sc.spoken).some((w) => normWord(w) === normWord(ev.word)))
          warn("event_word", `Slovo „${ev.word}“ pro událost ${ev.action} není v mluveném textu.`, sc.n);
      }
    }
    if (!sc.graphic.trim() && !sc.template) warn("empty_graphic", "Scéna nemá grafiku — použij výchozí výplň.", sc.n);
  });

  const last = s.scenes[s.scenes.length - 1];
  if (last && last.pose !== "Point_down") err("last_pose", "Poslední scéna musí mít pózu Point_down (CTA).", last.n);
  if (last && last.template !== "ebook_cta") warn("last_template", "Poslední scéna by měla používat šablonu ebook_cta.", last.n);

  // audio části
  if (s.audio_parts.length < 2 || s.audio_parts.length > 4) err("audio_parts", `Audio částí je ${s.audio_parts.length} (má být 2–4).`);
  const covered = s.audio_parts.flatMap((p) => p.scenes);
  const expected = s.scenes.map((x) => x.n);
  if (covered.join(",") !== expected.join(","))
    err("audio_cover", `Audio části musí pokrýt scény ${expected.join(", ")} postupně a právě jednou (teď ${covered.join(", ")}).`);
  for (const p of s.audio_parts) {
    const spoken = p.scenes
      .map((n) => s.scenes.find((x) => x.n === n)?.spoken ?? "")
      .join(" ");
    const a = words(stripTags(p.tagged_text)).map(normWord).join(" ");
    const b = words(spoken).map(normWord).join(" ");
    if (a !== b) err("tagged_text", `Část ${p.part}: text bez tagů se neshoduje se scénami ${p.scenes.join(", ")} slovo od slova.`);
    const dur = words(spoken).length / r.words_per_second;
    if (dur < 6 || dur > 19) warn("part_len", `Část ${p.part} má odhadem ${dur.toFixed(1)} s (cíl 7–18 s).`);
    if (p.stability < 0 || p.stability > 1) err("stability", `Část ${p.part}: stability musí být 0–1.`);
  }

  if (s.sfx.length > r.max_sfx) err("sfx", `Efektů je ${s.sfx.length} (max ${r.max_sfx}).`);
  if (s.hashtags.length > r.max_hashtags) err("hashtags", `Hashtagů je ${s.hashtags.length} (max ${r.max_hashtags}).`);
  if (/\n/.test(s.caption)) err("caption", "Popisek musí být na jeden řádek.");

  for (const f of FORBIDDEN_PATTERNS) {
    const m = (allSpoken + " " + s.caption).match(f.re);
    if (m) err("forbidden", `Zakázané: ${f.why} („${m[0]}“).`);
  }

  const est = wc / r.words_per_second;
  const diff = Math.abs(est - r.target_duration_s) / r.target_duration_s;
  if (diff > r.duration_tolerance)
    warn("duration", `Odhad délky ${est.toFixed(1)} s (tempo ${r.words_per_second} sl/s) se liší od cíle ${r.target_duration_s} s o ${(diff * 100).toFixed(0)} %.`);

  if (!out.some((c) => c.level === "error")) out.unshift({ level: "ok", code: "ok", message: "Všechny povinné kontroly prošly." });
  return out;
}

export function emptyScene(n: number): Scene {
  return {
    n,
    spoken: "",
    on_screen: "*Text*",
    pose: "Original",
    return_to_neutral: false,
    counter: null,
    graphic: "",
    template: "text_card",
    params: [{ key: "title", value: "" }],
    events: [],
    continue_from_scene: false,
    pose_extra: [],
  };
}

/** Přepočítá odvozená pole (word_count, číslování). */
export function normalizeScript(s: Script): Script {
  const scenes = s.scenes.map((x, i) => ({ ...x, n: i + 1 }));
  return { ...s, scenes, word_count: words(scenes.map((x) => x.spoken).join(" ")).length };
}

/** Sestaví tagged_text audio částí z mluveného textu (bez tagů / se základním tagem). */
export function rebuildAudioParts(s: Script, withTags: boolean): Script {
  const parts = s.audio_parts.map((p) => {
    const txt = p.scenes.map((n) => s.scenes.find((x) => x.n === n)?.spoken ?? "").join(" ");
    const existingTag = p.tagged_text.match(/^\s*(\[[^\]]+\])/)?.[1];
    return { ...p, tagged_text: withTags && existingTag ? `${existingTag} ${txt}` : txt };
  });
  return { ...s, audio_parts: parts };
}
