"use client";
import { API } from "@/lib/nav";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Field, PageHeader, Slider, Tabs, Toggle, api, useCopy, useToast } from "@/components/ui";
import { CLAUDE_MODELS, EFFORT_LEVELS, ELEVEN_MODELS } from "@/lib/constants";
import { FORBIDDEN_PATTERNS, sentences, words } from "@/lib/script";
import type { VoiceProfile } from "@/lib/outputs";
import type { Settings } from "@/lib/settings-defaults";

type Cfg = { voice_id: string; model_id: string; stability: number; similarity: number; style: number; speed: number; speaker_boost: boolean; use_tags: boolean; label: string };
const fromProfile = (p: VoiceProfile): Cfg => ({ voice_id: p.voice_id, model_id: p.model_id, stability: p.stability, similarity: p.similarity, style: p.style, speed: p.speed, speaker_boost: !!p.speaker_boost, use_tags: !!p.use_tags, label: p.name });

export function LabClient({ profiles, keys, llm, rules }: { profiles: VoiceProfile[]; keys: { anthropic: boolean; elevenlabs: boolean }; llm: Settings["llm"]; rules: Settings["content"] }) {
  const sp = useSearchParams();
  const [tab, setTab] = useState<"voice" | "llm" | "text">((sp.get("tab") as "llm") || "voice");
  return (
    <div>
      <PageHeader title="Laboratoř" subtitle="Hřiště na hlasy, modely a texty — nic se tu neukládá do videí" />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "voice", label: "Hlas A/B" }, { key: "llm", label: "Claude playground" }, { key: "text", label: "Kontrola textu" }]} />
      <div className="pt-5">
        {tab === "voice" && <VoiceLab profiles={profiles} enabled={keys.elevenlabs} />}
        {tab === "llm" && <LlmLab enabled={keys.anthropic} llm={llm} />}
        {tab === "text" && <TextLab rules={rules} />}
      </div>
    </div>
  );
}

function VoiceLab({ profiles, enabled }: { profiles: VoiceProfile[]; enabled: boolean }) {
  const toast = useToast();
  const [text, setText] = useState("[sighs] Zbývají tři dny do zkoušky. [playful] A ty umíš... nic. [reassuring] Dobře. Žádná panika.");
  const [cfgs, setCfgs] = useState<Cfg[]>(() => [profiles[0], profiles[1] ?? profiles[0]].filter(Boolean).map(fromProfile));
  const [urls, setUrls] = useState<(string | null)[]>([null, null]);
  const [busy, setBusy] = useState<number | null>(null);

  const gen = async (i: number) => {
    setBusy(i);
    try {
      const res = await fetch(`${API}/elevenlabs/tts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, ...cfgs[i] }) });
      if (!res.ok) throw new Error((await res.json()).error);
      const u = URL.createObjectURL(await res.blob());
      setUrls((x) => x.map((y, j) => (j === i ? u : y)));
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const set = (i: number, patch: Partial<Cfg>) => setCfgs((c) => c.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="space-y-4">
      {!enabled && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Potřebuje klíč ElevenLabs (Nastavení → API klíče).</p>}
      <Card title="Text" subtitle="Tagy se pošlou jen modelům, které je umí (podle přepínače)">
        <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        <p className="text-3 mt-1 text-xs">{text.length} znaků · ~{(words(text.replace(/\[[^\]]*\]/g, "")).length / 2.1).toFixed(1)} s</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {cfgs.map((c, i) => (
          <Card key={i} title={`Varianta ${"AB"[i]}`} actions={
            <select className="input h-8 w-auto py-0 text-xs" onChange={(e) => { const p = profiles.find((x) => x.id === Number(e.target.value)); if (p) set(i, fromProfile(p)); }} defaultValue="">
              <option value="" disabled>načíst profil…</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          }>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Model">
                  <select className="input" value={c.model_id} onChange={(e) => set(i, { model_id: e.target.value, use_tags: !!ELEVEN_MODELS.find((m) => m.id === e.target.value)?.tags })}>
                    {ELEVEN_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </Field>
                <Field label="Voice ID"><input className="input font-mono text-xs" value={c.voice_id} onChange={(e) => set(i, { voice_id: e.target.value })} /></Field>
              </div>
              <Slider label="Stability" value={c.stability} onChange={(v) => set(i, { stability: v })} format={(v) => `${Math.round(v * 100)} %`} />
              <Slider label="Similarity" value={c.similarity} onChange={(v) => set(i, { similarity: v })} format={(v) => `${Math.round(v * 100)} %`} />
              <Slider label="Style" value={c.style} onChange={(v) => set(i, { style: v })} format={(v) => `${Math.round(v * 100)} %`} />
              <Slider label="Speed" value={c.speed} min={0.7} max={1.2} onChange={(v) => set(i, { speed: v })} format={(v) => v.toFixed(2)} />
              <div className="flex gap-6">
                <Toggle checked={c.use_tags} onChange={(v) => set(i, { use_tags: v })} label="Audio tagy" />
                <Toggle checked={c.speaker_boost} onChange={(v) => set(i, { speaker_boost: v })} label="Speaker boost" />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" loading={busy === i} disabled={!enabled || !c.voice_id} onClick={() => gen(i)}>▶ Generovat {"AB"[i]}</Button>
                {urls[i] && <audio controls autoPlay src={urls[i]!} className="h-10 flex-1" />}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function LlmLab({ enabled, llm }: { enabled: boolean; llm: Settings["llm"] }) {
  const toast = useToast();
  const copy = useCopy();
  const [f, setF] = useState({ prompt: "Navrhni 5 hooků pro video o pravidle pěti minut. Každý max 10 slov.", system: "", use_app_system: true, model: llm.tasks.script.model, effort: "medium", max_tokens: 4000 });
  const [out, setOut] = useState<{ text: string; model: string; usage: { input: number; output: number }; ms: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const price = CLAUDE_MODELS.find((m) => m.id === out?.model);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Prompt">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Model">
              <select className="input" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })}>
                {CLAUDE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Effort">
              <select className="input" value={f.effort} onChange={(e) => setF({ ...f, effort: e.target.value })}>
                {EFFORT_LEVELS.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Max tokenů"><input type="number" className="input" value={f.max_tokens} onChange={(e) => setF({ ...f, max_tokens: Number(e.target.value) })} /></Field>
          </div>
          <Toggle checked={f.use_app_system} onChange={(v) => setF({ ...f, use_app_system: v })} label="Použít systémový prompt aplikace" hint="Produkt, kapitoly, tón, zakázané věci, šablony — jako při psaní scénářů" />
          <Field label={f.use_app_system ? "Doplněk systémového promptu" : "Systémový prompt"}><textarea className="input" rows={3} value={f.system} onChange={(e) => setF({ ...f, system: e.target.value })} /></Field>
          <Field label="Zpráva"><textarea className="input" rows={6} value={f.prompt} onChange={(e) => setF({ ...f, prompt: e.target.value })} /></Field>
          <Button variant="primary" loading={busy} disabled={!enabled} onClick={async () => {
            setBusy(true);
            try {
              setOut(await api(`${API}/llm/playground`, { body: f }));
            } catch (e) {
              toast("error", (e as Error).message);
            } finally {
              setBusy(false);
            }
          }}>Odeslat</Button>
          {!enabled && <p className="text-3 text-xs">Potřebuje klíč Anthropic.</p>}
        </div>
      </Card>
      <Card title="Odpověď" actions={out && <Button size="sm" onClick={() => copy(out.text)}>Kopírovat</Button>}>
        {out ? (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge color="#26406E">{out.model}</Badge>
              <Badge>{out.usage.input.toLocaleString("cs-CZ")} in / {out.usage.output.toLocaleString("cs-CZ")} out tokenů</Badge>
              <Badge>{(out.ms / 1000).toFixed(1)} s</Badge>
              {price && <Badge color="#FB6720">≈ ${((out.usage.input * price.input + out.usage.output * price.output) / 1e6).toFixed(4)}</Badge>}
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{out.text}</pre>
          </>
        ) : (
          <p className="text-3 text-sm">Odpověď se zobrazí tady.</p>
        )}
      </Card>
    </div>
  );
}

function TextLab({ rules }: { rules: Settings["content"] }) {
  const [t, setT] = useState("Zbývají tři dny do zkoušky. A ty umíš... nic. Dobře. Žádná panika. Tohle je plán na tři dny.");
  const r = useMemo(() => {
    const ws = words(t);
    const sens = sentences(t).map((s) => ({ s, n: words(s).length }));
    const forb = FORBIDDEN_PATTERNS.map((f) => ({ why: f.why, m: t.match(f.re)?.[0] })).filter((x) => x.m);
    return { wc: ws.length, sens, forb, dur: ws.length / rules.words_per_second, digits: /\d/.test(t) };
  }, [t, rules.words_per_second]);
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Card title="Text"><textarea className="input" rows={10} value={t} onChange={(e) => setT(e.target.value)} /></Card>
      <Card title="Rozbor">
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-3">Slov</dt><dd className={`font-bold ${r.wc < rules.words_min || r.wc > rules.words_max ? "text-amber-600" : ""}`}>{r.wc} <span className="text-3 font-normal">({rules.words_min}–{rules.words_max})</span></dd>
          <dt className="text-3">Odhad délky</dt><dd className="font-bold">{r.dur.toFixed(1)} s <span className="text-3 font-normal">@ {rules.words_per_second} sl/s</span></dd>
          <dt className="text-3">Číslice</dt><dd className={r.digits ? "font-bold text-amber-600" : "font-bold"}>{r.digits ? "ano — piš slovy" : "ne"}</dd>
        </dl>
        <h3 className="mt-4 text-sm font-bold">Věty</h3>
        <ul className="mt-1 space-y-1 text-sm">
          {r.sens.map((s, k) => <li key={k} className={s.n > rules.max_words_per_sentence ? "text-red-600" : ""}><b>{s.n}</b> · {s.s}</li>)}
        </ul>
        <h3 className="mt-4 text-sm font-bold">Zakázané</h3>
        {r.forb.length ? <ul className="mt-1 text-sm text-red-600">{r.forb.map((f, k) => <li key={k}>✗ {f.why}: „{f.m}“</li>)}</ul> : <p className="mt-1 text-sm text-emerald-600">✓ nic</p>}
      </Card>
    </div>
  );
}
