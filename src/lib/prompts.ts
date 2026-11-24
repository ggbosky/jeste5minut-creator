// Prompty a schémata pro Clauda — čisté funkce (server i statická verze v prohlížeči).
import { z } from "zod";
import { HOOK_TYPES, TEMPLATES, DEFAULT_POSES } from "./constants";
import { ScriptSchema, type Script } from "./script";
import type { Settings } from "./settings-defaults";

export type PromptData = {
  brand: Settings["brand"];
  content: Settings["content"];
  llm: Settings["llm"];
  chapters: { n: number; title: string; idea: string; body: string }[];
  used: { chapter: number; title: string; number: string }[];
};

export function chaptersText(ch: PromptData["chapters"], used: PromptData["used"]) {
  return ch
    .map((c) => {
      const u = used.filter((v) => v.chapter === c.n).map((v) => `video ${v.number} „${v.title}“`);
      return `${c.n}. ${c.title} — ${c.idea}${u.length ? ` [už použito: ${u.join(", ")}]` : " [zatím nepoužito]"}${c.body ? `\n   Text kapitoly: ${c.body.slice(0, 4000)}` : ""}`;
    })
    .join("\n");
}

export function buildSystemPrompt(d: PromptData): string {
  const { brand: b, content: c, llm } = d;
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
${chaptersText(d.chapters, d.used)}

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

export const RevisionSchema = z.object({
  summary: z.string(),
  script: ScriptSchema,
});

export function topicsPrompt(opts: { count: number; chapter?: number | null; hook_type?: string | null; custom?: string }, existing: { title: string; chapter: number }[]) {
  return `Navrhni ${opts.count} témat pro nová videa.
${opts.chapter ? `Všechna z kapitoly ${opts.chapter}.` : "Upřednostni nepoužité kapitoly, ale témata můžou být i z použitých, pokud jde o jiný tip."}
${opts.hook_type ? `Typ hooku: ${opts.hook_type}.` : "Střídej typy hooků (myth, scene, direct)."}
${opts.custom ? `Vlastní zadání od Filipa: ${opts.custom}` : ""}
Neopakuj tato existující témata: ${existing.map((e) => `„${e.title}“ (kap. ${e.chapter})`).join(", ") || "žádná"}.
Ke každému: krátký název (2–5 slov), úhel / jaký jeden tip video dá (1 věta) a první věta hooku tak, jak zazní.`;
}

export function scriptPrompt(v: { number: string; title: string; chapter: number; hook_type: string; angle: string }, fixErrors?: { script: Script; errors: string[] }) {
  let prompt = `Napiš scénář videa ${v.number}.
- Pracovní název: ${v.title}
- Kapitola: ${v.chapter}
- Typ hooku: ${v.hook_type}
- Úhel / tip: ${v.angle || "vyber nejsilnější tip z kapitoly"}
Pole id = "${v.number}". Vrať celý scénář jako jeden JSON objekt.`;
  if (fixErrors) {
    prompt += `\n\nPředchozí verze neprošla automatickými kontrolami. Oprav přesně tyto chyby a zbytek zachovej:\n${fixErrors.errors.map((e) => `- ${e}`).join("\n")}\n\nPředchozí verze:\n${JSON.stringify(fixErrors.script)}`;
  }
  return prompt;
}

export function scenePrompt(script: Script, n: number, instruction: string) {
  return `Tady je celý scénář:\n${JSON.stringify(script)}\n\nPřepiš jen scénu ${n}${n === 1 ? " (hook)" : ""}. ${instruction || "Udělej ji úderněji, zachovej délku a návaznost."}
Zachovej číslo scény n=${n}. Mluvený text musí navazovat na ostatní scény. Vrať jen tuto jednu scénu.`;
}

export function revisionPrompt(script: Script, comments: { scene: number | null; comment: string }[], locked: boolean) {
  return `Filip zkontroloval vyrenderované video a má připomínky. Přelož je na co nejmenší změny scénáře.
${locked ? "DŮLEŽITÉ: audio už je nahrané, takže NESMÍŠ měnit mluvený text (spoken), tagged_text ani audio_parts. Měň jen pózy, on_screen, grafiku (template/params/events), počítadlo, efekty, popisek a hashtagy." : ""}
Připomínky:
${comments.map((c) => `- ${c.scene ? `scéna ${c.scene}: ` : ""}${c.comment}`).join("\n")}

Aktuální scénář:
${JSON.stringify(script)}

Vrať summary (1–3 věty co jsi změnil) a celý upravený scénář.`;
}

export const FALLBACK_MODELS = new Set(["claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
