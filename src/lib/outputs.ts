// Odvozené výstupy ze scénáře: názvy souborů, dva .md soubory, video_spec.json
import type { Script } from "./script";
import { paramsToObj, words, normWord } from "./script";
import type { Settings } from "./settings-defaults";
import { ELEVEN_MODELS } from "./constants";

export type VoiceProfile = {
  id: number;
  name: string;
  voice_id: string;
  voice_name: string;
  model_id: string;
  use_tags: number;
  stability: number;
  similarity: number;
  style: number;
  speed: number;
  speaker_boost: number;
  stability_emotion: number;
  stability_normal: number;
  stability_tips: number;
  notes: string;
  is_default: number;
};

export function fileName(pattern: string, v: { n: string; slug: string; type?: string; abbr: string; yy: string; version?: number }) {
  return pattern
    .replace("{n}", v.n)
    .replace("{slug}", v.slug)
    .replace("{type}", v.type ?? "")
    .replace("{abbr}", v.abbr)
    .replace("{yy}", v.yy)
    .replace("{version}", String(v.version ?? 1))
    .replace(/__+/g, "_");
}

export function applyPronunciation(text: string, dict: { from: string; to: string }[]) {
  let t = text;
  for (const { from, to } of [...dict].sort((a, b) => b.from.length - a.from.length)) {
    if (!from) continue;
    t = t.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), to);
  }
  return t;
}

export function stripAllTags(t: string) {
  return t.replace(/\[[^\]]*\]\s*/g, "").trim();
}

/** Text pro ElevenLabs podle profilu (tagy jen u modelů, které je umí). */
export function partTextFor(profile: VoiceProfile | null, tagged: string, dict: { from: string; to: string }[]) {
  const useTags = profile ? !!profile.use_tags : false;
  const base = useTags ? tagged : stripAllTags(tagged);
  return applyPronunciation(base, dict);
}

export function elevenLabsMarkdown(s: Script, profile: VoiceProfile | null, settings: Pick<Settings, "brand" | "content" | "naming">) {
  const b = settings.brand;
  const model = ELEVEN_MODELS.find((m) => m.id === profile?.model_id);
  const lines: string[] = [];
  lines.push(`# ${b.name} — scénář ${s.id}: ${s.title} — ElevenLabs`);
  lines.push("");
  lines.push(`Kapitola ${s.chapter} · hook: ${s.hook_type} · ${s.word_count} slov`);
  lines.push("");
  lines.push("## Nastavení hlasu");
  lines.push("");
  if (profile) {
    lines.push(`- Profil: **${profile.name}**`);
    lines.push(`- Hlas: ${profile.voice_name || "—"}${profile.voice_id ? ` (\`${profile.voice_id}\`)` : ""}`);
    lines.push(`- Model: ${model?.label ?? profile.model_id}`);
    lines.push(`- Similarity: ${Math.round(profile.similarity * 100)} %`);
    if (!profile.use_tags) {
      lines.push(`- Stability: ${Math.round(profile.stability * 100)} %`);
      lines.push(`- Style: ${Math.round(profile.style * 100)} %`);
      lines.push(`- Speed: ${profile.speed.toFixed(2)}`);
    } else {
      lines.push(`- Stability po částech (níže); audio tagy v hranatých závorkách`);
    }
    lines.push(`- Speaker boost: ${profile.speaker_boost ? "ano" : "ne"}`);
  }
  lines.push("- Hlas: rodilý český, mladší, kamarádský. Každou část vygeneruj 2–3× a vyber nejlepší.");
  if (settings.content.pronunciation.length)
    lines.push(`- Výslovnost: ${settings.content.pronunciation.map((p) => `„${p.from}“ → „${p.to}“`).join(", ")} (už nahrazeno v textu)`);
  lines.push("");
  lines.push("## Části");
  for (const p of s.audio_parts) {
    lines.push("");
    lines.push(`### cast${p.part}.mp3 — scény ${p.scenes.join(", ")}`);
    lines.push("");
    lines.push(`- Nálada: ${p.mood}`);
    lines.push(`- Stability: ${Math.round((profile?.use_tags ? p.stability : profile?.stability ?? p.stability) * 100)} %`);
    lines.push("");
    lines.push("```");
    lines.push(partTextFor(profile, p.tagged_text, settings.content.pronunciation));
    lines.push("```");
  }
  lines.push("");
  lines.push("## Popisek");
  lines.push("");
  lines.push(s.caption);
  lines.push("");
  lines.push(s.hashtags.join(" "));
  lines.push("");
  return lines.join("\n");
}

export function cutMarkdown(s: Script) {
  const L: string[] = [];
  L.push(`# Scénář ${s.id}: ${s.title} — zadání střihu`);
  L.push("");
  L.push(`Kapitola ${s.chapter} · ${s.scenes.length} scén · bez hudby, jen hlas a zvukové efekty · CTA: ${s.cta}`);
  L.push("");
  L.push("## Audio soubory");
  L.push("");
  for (const p of s.audio_parts) L.push(`- cast${p.part}.mp3 → scény ${p.scenes.join(", ")}`);
  L.push("");
  L.push("## Efekty");
  L.push("");
  if (!s.sfx.length) L.push("- žádné");
  for (const f of s.sfx) L.push(`- ${f.type} — scéna ${f.scene}, na slově „${f.word}“`);
  const counters = s.scenes.filter((x) => x.counter);
  L.push("");
  L.push("## Počítadlo");
  L.push("");
  if (!counters.length) L.push("- bez počítadla");
  for (const c of counters) L.push(`- scéna ${c.n}: ${c.counter}`);
  L.push("");
  L.push("## Scény");
  for (const sc of s.scenes) {
    L.push("");
    L.push(`### ${sc.n}. ${sc.on_screen}`);
    L.push("");
    L.push(`- Mluvené: ${sc.spoken}`);
    L.push(`- Póza: ${sc.pose}${sc.return_to_neutral ? " → zpět na Original" : ""}${sc.pose_extra.length ? ` (+ ${sc.pose_extra.map((p) => `${p.pose} na „${p.word}“`).join(", ")})` : ""}`);
    L.push(`- Grafika: ${sc.graphic}`);
    L.push(`- Šablona: \`${sc.template}\` ${JSON.stringify(paramsToObj(sc.params))}`);
    if (sc.events.length) L.push(`- Události: ${sc.events.map((e) => `${e.action} na „${e.word}“`).join(", ")}`);
  }
  L.push("");
  return L.join("\n");
}

// ---------------- video_spec.json ----------------
export type VideoSpec = {
  schema_version: "1.0";
  video_id: string;
  output: { filename: string; width: number; height: number; fps: number; tail_s: number; target_duration_s: number };
  audio: { parts: { file: string; scenes: number[] }[]; gap_s: number; trim_silence: boolean; target_lufs: number };
  sfx: { type: string; scene: number; at: { word?: string; event?: string } }[];
  counter: { label: string; total: number; scenes: Record<string, number> } | null;
  scenes: {
    n: number;
    spoken: string;
    caption: string;
    caption_word_aliases: Record<string, string>;
    pose: { main: string; return_to_original_after_s: number | null; extra: { pose: string; at: { word: string } }[] };
    graphic: {
      template: string;
      params: Record<string, string>;
      events: { at: { word: string }; action: string }[];
      continue_from_scene: number | null;
      hold_to_end: boolean;
    };
  }[];
};

const NUM_WORDS: Record<string, string> = {
  "0": "nula", "1": "jedna", "2": "dva", "3": "tři", "4": "čtyři", "5": "pět", "6": "šest", "7": "sedm", "8": "osm", "9": "devět", "10": "deset",
  "12": "dvanáct", "14": "čtrnáct", "15": "patnáct", "20": "dvacet", "25": "dvacet", "30": "třicet",
};

export function buildSpec(s: Script, opts: { videoFilePattern: string; abbr: string; yy: string; render: Settings["render"]; content: Settings["content"] }): VideoSpec {
  const r = opts.render;
  // počítadlo z polí "KROK 2/4"
  let counter: VideoSpec["counter"] = null;
  const cs = s.scenes.filter((x) => x.counter && /(\S+)\s+(\d+)\s*\/\s*(\d+)/.test(x.counter));
  if (cs.length) {
    const m0 = cs[0].counter!.match(/(\S+)\s+(\d+)\s*\/\s*(\d+)/)!;
    counter = { label: m0[1].toUpperCase(), total: Number(m0[3]), scenes: {} };
    for (const c of cs) {
      const m = c.counter!.match(/(\S+)\s+(\d+)\s*\/\s*(\d+)/)!;
      counter.scenes[String(c.n)] = Number(m[2]);
    }
  }
  const last = s.scenes.length;
  const ctaWord = words(s.cta)[0] ?? "";
  return {
    schema_version: "1.0",
    video_id: `scenar-${s.id}-${s.slug.toLowerCase().replace(/_/g, "-")}`,
    output: {
      filename: fileName(opts.videoFilePattern, { n: s.id, slug: s.slug, abbr: opts.abbr, yy: opts.yy }).replace(/v1$/, "v{version}").replace(/_v\d+$/, "_v{version}") + ".mp4",
      width: r.width,
      height: r.height,
      fps: r.fps,
      tail_s: r.tail_s,
      target_duration_s: opts.content.target_duration_s,
    },
    audio: {
      parts: s.audio_parts.map((p) => ({ file: `cast${p.part}.mp3`, scenes: p.scenes })),
      gap_s: r.gap_s,
      trim_silence: true,
      target_lufs: r.target_lufs,
    },
    sfx: s.sfx.map((f) => ({ type: f.type, scene: f.scene, at: f.word ? { word: f.word } : { event: "counter" } })),
    counter,
    scenes: s.scenes.map((sc) => {
      // aliasy: slova titulku, která nezazní → mluvené slovo
      const spokenNorm = words(sc.spoken).map(normWord);
      const aliases: Record<string, string> = {};
      for (const w of words(sc.on_screen.replace(/\*/g, ""))) {
        const nw = normWord(w);
        if (!spokenNorm.includes(nw)) {
          const alias = NUM_WORDS[nw];
          if (alias && spokenNorm.includes(normWord(alias))) aliases[w.replace(/[^\p{L}\p{N}]/gu, "")] = alias;
        }
      }
      const isLast = sc.n === last;
      return {
        n: sc.n,
        spoken: sc.spoken,
        caption: sc.on_screen,
        caption_word_aliases: aliases,
        pose: {
          main: sc.pose,
          // Poučení z výroby: gesto drží 1,2–1,6 s, pak Original; u CTA zpět na Point_down na slově „Odkaz“
          return_to_original_after_s: sc.pose === "Original" ? null : r.gesture_s,
          extra: [
            ...sc.pose_extra.map((p) => ({ pose: p.pose, at: { word: p.word } })),
            ...(isLast && sc.pose === "Point_down" && ctaWord && spokenNorm.includes(normWord(ctaWord))
              ? [{ pose: "Point_down", at: { word: ctaWord } }]
              : []),
          ],
        },
        graphic: {
          template: sc.template,
          params: paramsToObj(sc.params),
          events: sc.events.map((e) => ({ at: { word: e.word }, action: e.action })),
          continue_from_scene: sc.continue_from_scene && sc.n > 1 ? sc.n - 1 : null,
          hold_to_end: isLast,
        },
      };
    }),
  };
}
