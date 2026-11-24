"use client";
import type { ReactNode } from "react";
import { Button, Card, Field, Spinner, Toggle } from "@/components/ui";
import { fileName } from "@/lib/outputs";
import { useSettings } from "./useSettings";

function Bar({ dirty, saving, save, reset }: { dirty: boolean; saving: boolean; save: () => void; reset: () => void }) {
  return (
    <>
      <Button size="sm" variant="ghost" onClick={reset}>Výchozí</Button>
      <Button size="sm" variant="primary" disabled={!dirty} loading={saving} onClick={save}>Uložit</Button>
    </>
  );
}
function Num({ label, value, onChange, step = 1, hint, min, max }: { label: ReactNode; value: number; onChange: (v: number) => void; step?: number; hint?: string; min?: number; max?: number }) {
  return (
    <Field label={label} hint={hint}>
      <input type="number" className="input" step={step} min={min} max={max} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </Field>
  );
}

export function ContentTab() {
  const s = useSettings("content");
  const v = s.value;
  if (!v) return <Spinner />;
  return (
    <div className="space-y-4">
      <Card title="Tón a zakázané věci" subtitle="Jde do instrukcí pro Clauda u všech úloh" actions={<Bar {...s} />}>
        <div className="space-y-4">
          <Field label="Tón"><textarea className="input" rows={2} value={v.tone} onChange={(e) => s.set({ tone: e.target.value })} /></Field>
          <Field label="Zakázáno" hint="Navíc běží automatická kontrola (léčba/diagnózy, čísla a studie, přehánění, recenze)."><textarea className="input" rows={2} value={v.forbidden} onChange={(e) => s.set({ forbidden: e.target.value })} /></Field>
          <Field label="Další pravidla (volitelné)"><textarea className="input" rows={3} value={v.extra_rules} onChange={(e) => s.set({ extra_rules: e.target.value })} placeholder="např. Nepoužívej slovo „prokrastinace“. Každý hook končí otázkou…" /></Field>
        </div>
      </Card>
      <Card title="Rozsah a délka" actions={<Bar {...s} />}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Num label="Slov min" value={v.words_min} onChange={(x) => s.set({ words_min: x })} />
          <Num label="Slov max" value={v.words_max} onChange={(x) => s.set({ words_max: x })} />
          <Num label="Scén min" value={v.scenes_min} onChange={(x) => s.set({ scenes_min: x })} />
          <Num label="Scén max" value={v.scenes_max} onChange={(x) => s.set({ scenes_max: x })} />
          <Num label="Max slov ve větě" value={v.max_words_per_sentence} onChange={(x) => s.set({ max_words_per_sentence: x })} />
          <Num label="Tempo hlasu (slova/s)" step={0.1} value={v.words_per_second} onChange={(x) => s.set({ words_per_second: x })} hint="Reálně ~2,1 (ne 2,7)" />
          <Num label="Cílová délka (s)" value={v.target_duration_s} onChange={(x) => s.set({ target_duration_s: x })} hint="~27 s cíl, nahrávky dávají ~34 s" />
          <Num label="Tolerance délky" step={0.01} value={v.duration_tolerance} onChange={(x) => s.set({ duration_tolerance: x })} hint="0,15 = 15 %" />
          <Num label="Max hashtagů" value={v.max_hashtags} onChange={(x) => s.set({ max_hashtags: x })} />
          <Num label="Max zvukových efektů" value={v.max_sfx} onChange={(x) => s.set({ max_sfx: x })} />
        </div>
      </Card>
      <Card title="Výslovnost" subtitle="Nahradí se v textu pro ElevenLabs (setup i generování)" actions={<Bar {...s} />}>
        <div className="space-y-2">
          {v.pronunciation.map((p, k) => (
            <div key={k} className="flex items-center gap-2">
              <input className="input" value={p.from} placeholder="napsáno" onChange={(e) => s.set({ pronunciation: v.pronunciation.map((x, j) => (j === k ? { ...x, from: e.target.value } : x)) })} />
              <span className="text-3">→</span>
              <input className="input" value={p.to} placeholder="vysloveno" onChange={(e) => s.set({ pronunciation: v.pronunciation.map((x, j) => (j === k ? { ...x, to: e.target.value } : x)) })} />
              <Button size="sm" variant="ghost" onClick={() => s.set({ pronunciation: v.pronunciation.filter((_, j) => j !== k) })}>✕</Button>
            </div>
          ))}
          <button className="text-sm font-semibold text-accent" onClick={() => s.set({ pronunciation: [...v.pronunciation, { from: "", to: "" }] })}>+ pravidlo</button>
        </div>
      </Card>
    </div>
  );
}

export function BrandTab() {
  const s = useSettings("brand");
  const v = s.value;
  if (!v) return <Spinner />;
  const colors: [keyof typeof v.colors, string][] = [["bg", "Pozadí"], ["accent", "Akcent"], ["card", "Karty"], ["cardText", "Text na kartách"], ["muted", "Vedlejší text"]];
  return (
    <div className="space-y-4">
      <Card title="Produkt" actions={<Bar {...s} />}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Název"><input className="input" value={v.name} onChange={(e) => s.set({ name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Zkratka v souborech"><input className="input" value={v.abbr} onChange={(e) => s.set({ abbr: e.target.value })} /></Field>
            <Field label="Rok (yy)"><input className="input" value={v.year} onChange={(e) => s.set({ year: e.target.value })} /></Field>
          </div>
          <Field label="Claim" className="md:col-span-2"><input className="input" value={v.claim} onChange={(e) => s.set({ claim: e.target.value })} /></Field>
          <Field label="Cílovka" className="md:col-span-2"><input className="input" value={v.audience} onChange={(e) => s.set({ audience: e.target.value })} /></Field>
          <Field label="Formát"><input className="input" value={v.format} onChange={(e) => s.set({ format: e.target.value })} /></Field>
          <Field label="Bonus"><input className="input" value={v.bonus} onChange={(e) => s.set({ bonus: e.target.value })} /></Field>
        </div>
      </Card>
      <Card title="CTA" subtitle="Ve videu se cena neříká" actions={<Bar {...s} />}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="CTA ve videu"><input className="input" value={v.cta.text} onChange={(e) => s.set({ cta: { ...v.cta, text: e.target.value } })} /></Field>
          <Field label="Cena"><input className="input" value={v.cta.price} onChange={(e) => s.set({ cta: { ...v.cta, price: e.target.value } })} placeholder="neznámá" /></Field>
          <Field label="Odkaz na prodej"><input className="input" value={v.cta.link} onChange={(e) => s.set({ cta: { ...v.cta, link: e.target.value } })} placeholder="https://…" /></Field>
          <Field label="Klíčové slovo do komentářů"><input className="input" value={v.cta.keyword} onChange={(e) => s.set({ cta: { ...v.cta, keyword: e.target.value } })} /></Field>
        </div>
      </Card>
      <Card title="Barvy a písmo" subtitle="Promítnou se do renderu i náhledu" actions={<Bar {...s} />}>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {colors.map(([k, label]) => (
            <Field key={k} label={label}>
              <div className="flex items-center gap-2">
                <input type="color" className="h-10 w-12 cursor-pointer rounded-lg border border-base" value={v.colors[k]} onChange={(e) => s.set({ colors: { ...v.colors, [k]: e.target.value.toUpperCase() } })} />
                <input className="input font-mono text-xs" value={v.colors[k]} onChange={(e) => s.set({ colors: { ...v.colors, [k]: e.target.value } })} />
              </div>
            </Field>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-4 rounded-xl p-5" style={{ background: v.colors.bg }}>
          <div className="rounded-2xl px-5 py-4 font-extrabold" style={{ background: v.colors.card, color: v.colors.cardText }}>Karta s textem</div>
          <p className="text-2xl font-extrabold text-white">Žádná <span style={{ color: v.colors.accent }}>panika</span></p>
          <p className="text-sm" style={{ color: v.colors.muted }}>vedlejší text</p>
        </div>
        <Field label="Písmo" className="mt-4" hint="Inter (ExtraBold, Bold, Regular) je součástí aplikace."><input className="input" value={v.font} onChange={(e) => s.set({ font: e.target.value })} /></Field>
      </Card>
    </div>
  );
}

export function RenderTab() {
  const s = useSettings("render");
  const v = s.value;
  if (!v) return <Spinner />;
  return (
    <div className="space-y-4">
      <Card title="Export" actions={<Bar {...s} />}>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Num label="Šířka" value={v.width} onChange={(x) => s.set({ width: x })} />
          <Num label="Výška" value={v.height} onChange={(x) => s.set({ height: x })} />
          <Num label="FPS" value={v.fps} onChange={(x) => s.set({ fps: x })} />
          <Num label="CRF (H.264)" value={v.crf} onChange={(x) => s.set({ crf: x })} hint="nižší = kvalitnější" />
          <Field label="Preset">
            <select className="input" value={v.preset} onChange={(e) => s.set({ preset: e.target.value })}>
              {["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow"].map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Num label="Audio kb/s" value={v.audio_bitrate_k} onChange={(x) => s.set({ audio_bitrate_k: x })} />
        </div>
      </Card>
      <Card title="Audio" subtitle="Normalizace jen jednou (po částech), pak automatická kontrola konce řeči" actions={<Bar {...s} />}>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Num label="Cílová hlasitost (LUFS)" value={v.target_lufs} onChange={(x) => s.set({ target_lufs: x })} />
          <Num label="Pauza mezi částmi (s)" step={0.05} value={v.gap_s} onChange={(x) => s.set({ gap_s: x })} />
          <Num label="Ticho na konci (s)" step={0.1} value={v.tail_s} onChange={(x) => s.set({ tail_s: x })} />
          <Num label="Práh ořezu ticha (dB)" value={v.trim_threshold_db} onChange={(x) => s.set({ trim_threshold_db: x })} />
          <Num label="Okraj před řečí (s)" step={0.01} value={v.trim_before_s} onChange={(x) => s.set({ trim_before_s: x })} />
          <Num label="Okraj za řečí (s)" step={0.01} value={v.trim_after_s} onChange={(x) => s.set({ trim_after_s: x })} />
          <Num label="Detekce ticha (dB)" value={v.silence_db} onChange={(x) => s.set({ silence_db: x })} />
          <Num label="Min. ticho (s)" step={0.01} value={v.silence_min_s} onChange={(x) => s.set({ silence_min_s: x })} />
          <Num label="Tolerance konce řeči (ms)" value={v.qa_end_tolerance_ms} onChange={(x) => s.set({ qa_end_tolerance_ms: x })} />
          <Num label="Tolerance LUFS (±)" step={0.1} value={v.qa_lufs_tolerance} onChange={(x) => s.set({ qa_lufs_tolerance: x })} />
        </div>
      </Card>
      <Card title="Rozvržení 1080 × 1920" subtitle="Y souřadnice v px. Postava 800 px a titulek na 1040, aby se nepřekrývaly s hlavou." actions={<Bar {...s} />}>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Num label="Počítadlo od" value={v.zone_counter[0]} onChange={(x) => s.set({ zone_counter: [x, v.zone_counter[1]] })} />
          <Num label="Počítadlo do" value={v.zone_counter[1]} onChange={(x) => s.set({ zone_counter: [v.zone_counter[0], x] })} />
          <Num label="Grafika od" value={v.zone_graphic[0]} onChange={(x) => s.set({ zone_graphic: [x, v.zone_graphic[1]] })} />
          <Num label="Grafika do" value={v.zone_graphic[1]} onChange={(x) => s.set({ zone_graphic: [v.zone_graphic[0], x] })} />
          <Num label="Titulek Y" value={v.caption_y} onChange={(x) => s.set({ caption_y: x })} />
          <Num label="Velikost titulku (px)" value={v.caption_size} onChange={(x) => s.set({ caption_size: x })} />
          <Num label="Postava od" value={v.zone_avatar[0]} onChange={(x) => s.set({ zone_avatar: [x, v.zone_avatar[1]] })} />
          <Num label="Výška postavy (px)" value={v.avatar_height} onChange={(x) => s.set({ avatar_height: x })} />
        </div>
      </Card>
      <Card title="Postava" actions={<Bar {...s} />}>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Num label="Gesto drží (s)" step={0.1} value={v.gesture_s} onChange={(x) => s.set({ gesture_s: x })} hint="1,2–1,6 s, pak Original" />
          <Num label="Mrkání min (s)" step={0.5} value={v.blink_min_s} onChange={(x) => s.set({ blink_min_s: x })} />
          <Num label="Mrkání max (s)" step={0.5} value={v.blink_max_s} onChange={(x) => s.set({ blink_max_s: x })} />
          <div className="pt-6"><Toggle checked={v.breathing} onChange={(x) => s.set({ breathing: x })} label="Dýchání 1 → 1,01" /></div>
          <Num label="Chroma práh od" value={v.chroma_low} onChange={(x) => s.set({ chroma_low: x })} />
          <Num label="Chroma práh do" value={v.chroma_high} onChange={(x) => s.set({ chroma_high: x })} />
          <Num label="Eroze (px)" value={v.chroma_erode} onChange={(x) => s.set({ chroma_erode: x })} />
          <Num label="Rozmazání (px)" step={0.1} value={v.chroma_blur} onChange={(x) => s.set({ chroma_blur: x })} />
        </div>
        <p className="text-3 mt-3 text-xs">Po změně chroma prahů pózy znovu předklíčuj v sekci Avatar a šablony.</p>
      </Card>
    </div>
  );
}

export function NamingTab() {
  const s = useSettings("naming");
  const v = s.value;
  if (!v) return <Spinner />;
  const ex = { n: "02", slug: "3_Dny_do_zkousky", abbr: "J5M", yy: "26" };
  return (
    <Card title="Vzory názvů souborů" subtitle="Proměnné: {n} číslo, {slug}, {type} (ElevenLabs / Strih), {abbr}, {yy}, {version}" actions={<Bar {...s} />}>
      <div className="space-y-4">
        <Field label="Scénářové soubory (.md)" hint={`Např.: ${fileName(v.script_pattern, { ...ex, type: "Strih" })}.md`}>
          <input className="input font-mono" value={v.script_pattern} onChange={(e) => s.set({ script_pattern: e.target.value })} />
        </Field>
        <Field label="Video (.mp4)" hint={`Např.: ${fileName(v.video_pattern, { ...ex, version: 2 })}.mp4`}>
          <input className="input font-mono" value={v.video_pattern} onChange={(e) => s.set({ video_pattern: e.target.value })} />
        </Field>
      </div>
    </Card>
  );
}
