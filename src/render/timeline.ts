// Timeline = pevné časy všeho, co se ve videu stane. Renderer je pak čistá funkce frame(t).
// Sdílené mezi serverem (render) a prohlížečem (náhled s odhadnutými časy).
import type { VideoSpec } from "../lib/outputs";
import { normWord, words as splitWords, syllables } from "../lib/script";

export type TimelineWord = { w: string; start_s: number; end_s: number; part: number; scene: number };
export type CaptionWord = { text: string; accent: boolean; t: number };
export type Timeline = {
  video_id: string;
  duration_s: number;
  fps: number;
  voice_end_s: number;
  timing_source: "stt" | "syllables" | "estimate";
  audio_parts: { file: string; offset_s: number; duration_s: number; part: number }[];
  scenes: { n: number; start_s: number; end_s: number }[];
  words: TimelineWord[];
  captions: { scene: number; words: CaptionWord[] }[];
  events: { scene: number; t: number; action: string; word: string; template: string }[];
  sfx: { type: string; t: number; scene: number }[];
  poses: { t: number; pose: string }[];
  counter: { scene: number; t: number; value: number; total: number; label: string }[];
};

/** Slova scénáře v pořadí, jak zazní, s číslem scény a části. */
export function scriptWords(spec: VideoSpec) {
  const out: { w: string; scene: number; part: number }[] = [];
  spec.audio.parts.forEach((p, pi) => {
    for (const n of p.scenes) {
      const sc = spec.scenes.find((s) => s.n === n);
      if (!sc) continue;
      for (const w of splitWords(sc.spoken)) out.push({ w, scene: n, part: pi + 1 });
    }
  });
  return out;
}

/** Odhad časů slov podle tempa (náhled v editoru, než existuje audio). */
export function estimateWordTimes(spec: VideoSpec, wps: number, gapS = 0.2): TimelineWord[] {
  const ws = scriptWords(spec);
  const totalSyl = ws.reduce((a, w) => a + syllables(w.w), 0) || 1;
  const secPerSyl = ws.length / wps / totalSyl;
  let t = 0.1;
  let lastPart = 1;
  return ws.map((w) => {
    if (w.part !== lastPart) {
      t += gapS + 0.25;
      lastPart = w.part;
    }
    const d = syllables(w.w) * secPerSyl;
    const r = { w: w.w, start_s: t, end_s: t + d * 0.92, part: w.part, scene: w.scene };
    t += d;
    if (/[.!?…]$/.test(w.w)) t += 0.25;
    else if (/[,;:]$/.test(w.w)) t += 0.1;
    return r;
  });
}

function findWord(ws: TimelineWord[], scene: number, word: string, after = -1): TimelineWord | undefined {
  const nw = normWord(word);
  if (!nw) return undefined;
  return ws.find((w) => w.scene === scene && w.start_s > after && normWord(w.w) === nw) ?? ws.find((w) => w.scene === scene && normWord(w.w).startsWith(nw));
}

export function buildTimeline(
  spec: VideoSpec,
  ws: TimelineWord[],
  o: { duration_s: number; voice_end_s: number; parts: Timeline["audio_parts"]; source: Timeline["timing_source"]; gesture_s: number },
): Timeline {
  const scenes: Timeline["scenes"] = [];
  spec.scenes.forEach((sc, i) => {
    const first = ws.find((w) => w.scene === sc.n);
    const start = i === 0 ? 0 : Math.max(0, (first?.start_s ?? scenes[i - 1]?.start_s ?? 0) - 0.08);
    scenes.push({ n: sc.n, start_s: start, end_s: o.duration_s });
    if (i > 0) scenes[i - 1].end_s = start;
  });
  const sceneStart = (n: number) => scenes.find((s) => s.n === n)?.start_s ?? 0;

  // titulky: slovo naskočí, když zazní (nebo alias); jinak 0,12 s po předchozím
  const captions: Timeline["captions"] = spec.scenes.map((sc) => {
    const tokens = sc.caption.split(/\s+/).filter(Boolean);
    let prev = sceneStart(sc.n);
    let after = sceneStart(sc.n) - 0.01;
    const out: CaptionWord[] = [];
    tokens.forEach((tok, k) => {
      const accent = /\*/.test(tok);
      const clean = tok.replace(/\*/g, "");
      const key = clean.replace(/[^\p{L}\p{N}]/gu, "");
      const alias = sc.caption_word_aliases[key] ?? sc.caption_word_aliases[clean];
      const hit = findWord(ws, sc.n, alias ?? clean, after);
      let t = hit ? hit.start_s : k === 0 ? sceneStart(sc.n) : prev + 0.12;
      if (t < prev) t = prev;
      if (hit) after = hit.start_s;
      out.push({ text: clean, accent, t });
      prev = t;
    });
    return { scene: sc.n, words: out };
  });

  const events: Timeline["events"] = [];
  for (const sc of spec.scenes) {
    sc.graphic.events.forEach((e, k) => {
      const hit = findWord(ws, sc.n, e.at.word);
      const t = hit ? hit.start_s : sceneStart(sc.n) + 0.3 + k * 0.6;
      events.push({ scene: sc.n, t, action: e.action, word: e.at.word, template: sc.graphic.template });
    });
  }
  events.sort((a, b) => a.t - b.t);

  const sfx: Timeline["sfx"] = spec.sfx.map((f) => {
    const hit = f.at.word ? findWord(ws, f.scene, f.at.word) : undefined;
    return { type: f.type, scene: f.scene, t: hit ? hit.start_s : sceneStart(f.scene) };
  });

  // pózy: hlavní póza na začátku scény, gesto drží gesture_s, pak Original
  type P = { t: number; pose: string; owner?: number };
  const raw: P[] = [];
  for (const sc of spec.scenes) {
    const st = sceneStart(sc.n);
    raw.push({ t: st, pose: sc.pose.main });
    if (sc.pose.return_to_original_after_s) raw.push({ t: st + sc.pose.return_to_original_after_s, pose: "Original", owner: st });
    for (const ex of sc.pose.extra) {
      const hit = findWord(ws, sc.n, ex.at.word);
      if (!hit) continue;
      raw.push({ t: hit.start_s, pose: ex.pose });
      const isHold = sc.graphic.hold_to_end && ex.pose === "Point_down";
      if (!isHold) raw.push({ t: hit.start_s + o.gesture_s, pose: "Original", owner: hit.start_s });
    }
  }
  // návrat na Original zahodit, pokud mezitím začala jiná póza
  const cleaned = raw
    .filter((p) => p.owner === undefined || !raw.some((q) => q !== p && q.owner === undefined && q.t > p.owner! && q.t <= p.t))
    .map(({ t, pose }) => ({ t, pose }))
    .sort((a, b) => a.t - b.t);

  const counter: Timeline["counter"] = [];
  if (spec.counter) {
    for (const [scene, value] of Object.entries(spec.counter.scenes)) {
      counter.push({ scene: Number(scene), t: sceneStart(Number(scene)), value, total: spec.counter.total, label: spec.counter.label });
    }
    counter.sort((a, b) => a.t - b.t);
  }

  return {
    video_id: spec.video_id,
    duration_s: o.duration_s,
    fps: spec.output.fps,
    voice_end_s: o.voice_end_s,
    timing_source: o.source,
    audio_parts: o.parts,
    scenes,
    words: ws,
    captions,
    events,
    sfx,
    poses: cleaned,
    counter,
  };
}

/** Kompletní odhadovaná timeline pro náhled. */
export function estimatedTimeline(spec: VideoSpec, wps: number, gesture_s: number): Timeline {
  const ws = estimateWordTimes(spec, wps, spec.audio.gap_s);
  const end = ws.length ? ws[ws.length - 1].end_s : 3;
  return buildTimeline(spec, ws, { duration_s: end + spec.output.tail_s, voice_end_s: end, parts: [], source: "estimate", gesture_s });
}
