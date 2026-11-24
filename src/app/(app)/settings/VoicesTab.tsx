"use client";
import { API } from "@/lib/nav";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Field, Slider, Toggle, api, cx, useToast } from "@/components/ui";
import { ELEVEN_MODELS } from "@/lib/constants";
import type { VoiceProfile } from "@/lib/outputs";

type ElVoice = { voice_id: string; name: string; category: string; labels: Record<string, string>; preview_url: string | null };

export function VoicesTab() {
  const toast = useToast();
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [edit, setEdit] = useState<VoiceProfile | null>(null);
  const [voices, setVoices] = useState<ElVoice[] | null>(null);
  const [vErr, setVErr] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [testText, setTestText] = useState("[confident] Začnu zítra teď. [sighs] Dobře, tak aspoň pět minut. Odkaz najdeš v bio.");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [dirty, setDirty] = useState(false);

  const load = async (keep?: number) => {
    const r = await api<{ profiles: VoiceProfile[] }>(`${API}/voices`);
    setProfiles(r.profiles);
    const id = keep ?? sel ?? r.profiles[0]?.id ?? null;
    setSel(id);
    setEdit(r.profiles.find((p) => p.id === id) ?? null);
    setDirty(false);
  };
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadVoices = async () => {
    setBusy("voices");
    setVErr("");
    try {
      setVoices((await api<{ voices: ElVoice[] }>(`${API}/elevenlabs/voices`)).voices);
    } catch (e) {
      setVErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const set = (patch: Partial<VoiceProfile>) => {
    setEdit((e) => (e ? { ...e, ...patch } : e));
    setDirty(true);
  };
  const save = async () => {
    if (!edit) return;
    setBusy("save");
    try {
      await api(`${API}/voices/${edit.id}`, { method: "PATCH", body: edit });
      toast("ok", "Profil uložen");
      await load(edit.id);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const test = async () => {
    if (!edit) return;
    setBusy("test");
    try {
      const res = await fetch(`${API}/elevenlabs/tts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: testText, voice_id: edit.voice_id, model_id: edit.model_id, stability: edit.stability, similarity: edit.similarity, style: edit.style, speed: edit.speed, speaker_boost: !!edit.speaker_boost, use_tags: !!edit.use_tags }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const blob = await res.blob();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const u = URL.createObjectURL(blob);
      setAudioUrl(u);
      setTimeout(() => audioRef.current?.play(), 50);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const model = ELEVEN_MODELS.find((m) => m.id === edit?.model_id);
  const shown = (voices ?? []).filter((v) => !filter || `${v.name} ${Object.values(v.labels).join(" ")}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
      <Card title="Profily hlasu" pad={false} actions={<Button size="sm" onClick={async () => { const r = await api<{ id: number }>(`${API}/voices`, { body: { name: "Nový profil" } }); await load(r.id); }}>+ Nový</Button>}>
        <ul className="p-2">
          {profiles.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => { if (dirty && !confirm("Zahodit neuložené změny?")) return; setSel(p.id); setEdit(p); setDirty(false); }}
                className={cx("w-full rounded-xl px-3 py-2.5 text-left transition", sel === p.id ? "bg-navy-900 text-white" : "hover:bg-[var(--surface-2)]")}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">{p.name} {p.is_default ? <Badge color="#FB6720" solid>výchozí</Badge> : null}</span>
                <span className={cx("text-xs", sel === p.id ? "text-white/60" : "text-3")}>{ELEVEN_MODELS.find((m) => m.id === p.model_id)?.label ?? p.model_id} · {p.voice_name || "bez hlasu"}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {edit && (
        <div className="space-y-4">
          <Card
            title={edit.name}
            actions={
              <>
                {!edit.is_default && <Button size="sm" variant="ghost" onClick={async () => { await api(`${API}/voices/${edit.id}`, { method: "PATCH", body: { is_default: true } }); await load(edit.id); }}>Nastavit jako výchozí</Button>}
                <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Smazat profil?")) { try { await api(`${API}/voices/${edit.id}`, { method: "DELETE" }); setSel(null); await load(); } catch (e) { toast("error", (e as Error).message); } } }}>Smazat</Button>
                <Button size="sm" variant="primary" disabled={!dirty} loading={busy === "save"} onClick={save}>Uložit</Button>
              </>
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Název profilu"><input className="input" value={edit.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="Model">
                <select className="input" value={edit.model_id} onChange={(e) => { const m = ELEVEN_MODELS.find((x) => x.id === e.target.value); set({ model_id: e.target.value, use_tags: m?.tags ? 1 : 0 }); }}>
                  {ELEVEN_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  {!ELEVEN_MODELS.some((m) => m.id === edit.model_id) && <option value={edit.model_id}>{edit.model_id}</option>}
                </select>
              </Field>
              <Field label="Voice ID" hint="Vyber níže ze seznamu nebo vlož ručně"><input className="input font-mono" value={edit.voice_id} onChange={(e) => set({ voice_id: e.target.value })} /></Field>
              <Field label="Název hlasu"><input className="input" value={edit.voice_name} onChange={(e) => set({ voice_name: e.target.value })} /></Field>
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <Slider label="Similarity" value={edit.similarity} onChange={(v) => set({ similarity: v })} format={(v) => `${Math.round(v * 100)} %`} />
              {model?.tags ? (
                <>
                  <Slider label="Stability — emoce" value={edit.stability_emotion} onChange={(v) => set({ stability_emotion: v })} format={(v) => `${Math.round(v * 100)} %`} hint="Části s výraznou náladou" />
                  <Slider label="Stability — běžný text" value={edit.stability_normal} onChange={(v) => set({ stability_normal: v })} format={(v) => `${Math.round(v * 100)} %`} />
                  <Slider label="Stability — tipy" value={edit.stability_tips} onChange={(v) => set({ stability_tips: v })} format={(v) => `${Math.round(v * 100)} %`} hint="v3 zaokrouhlí na Creative/Natural/Robust" />
                </>
              ) : (
                <>
                  <Slider label="Stability" value={edit.stability} onChange={(v) => set({ stability: v })} format={(v) => `${Math.round(v * 100)} %`} />
                  <Slider label="Style" value={edit.style} onChange={(v) => set({ style: v })} format={(v) => `${Math.round(v * 100)} %`} />
                  <Slider label="Speed" value={edit.speed} onChange={(v) => set({ speed: v })} min={0.7} max={1.2} step={0.01} format={(v) => v.toFixed(2)} />
                </>
              )}
            </div>
            <div className="mt-5 flex flex-wrap gap-6">
              <Toggle checked={!!edit.use_tags} onChange={(v) => set({ use_tags: v ? 1 : 0 })} label="Audio tagy v textu" hint="[confident], [sighs]… jen pro Eleven v3" />
              <Toggle checked={!!edit.speaker_boost} onChange={(v) => set({ speaker_boost: v ? 1 : 0 })} label="Speaker boost" />
            </div>
            <Field label="Poznámky" className="mt-4"><textarea className="input" rows={2} value={edit.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
          </Card>

          <Card title="Vyzkoušet hlas" subtitle="Vygeneruje ukázku s aktuálním (i neuloženým) nastavením. Výslovnost z Obsahu se použije.">
            <textarea className="input" rows={3} value={testText} onChange={(e) => setTestText(e.target.value)} />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button variant="primary" loading={busy === "test"} disabled={!edit.voice_id} onClick={test}>▶ Vygenerovat ukázku</Button>
              {audioUrl && <audio ref={audioRef} controls src={audioUrl} className="h-10" />}
              {audioUrl && <a href={audioUrl} download="ukazka.mp3" className="text-sm font-semibold text-accent">stáhnout</a>}
            </div>
            {!edit.voice_id && <p className="text-3 mt-2 text-xs">Nejdřív vyber hlas.</p>}
          </Card>

          <Card title="Hlasy v ElevenLabs" subtitle="Tvoje knihovna hlasů — klikni pro výběr" actions={<Button size="sm" loading={busy === "voices"} onClick={loadVoices}>{voices ? "Obnovit" : "Načíst hlasy"}</Button>}>
            {vErr && <p className="text-sm text-red-600">{vErr}</p>}
            {voices && (
              <>
                <input className="input mb-3" placeholder="Filtrovat (jméno, jazyk, přízvuk…)" value={filter} onChange={(e) => setFilter(e.target.value)} />
                <div className="grid max-h-[420px] gap-2 overflow-y-auto sm:grid-cols-2">
                  {shown.map((v) => (
                    <div key={v.voice_id} className={cx("rounded-xl border p-3 transition", edit.voice_id === v.voice_id ? "border-accent bg-accent-50 dark:bg-transparent" : "border-base")}>
                      <div className="flex items-center justify-between gap-2">
                        <button className="text-left font-semibold hover:underline" onClick={() => set({ voice_id: v.voice_id, voice_name: v.name })}>{v.name}</button>
                        <Badge>{v.category}</Badge>
                      </div>
                      <p className="text-3 mt-0.5 text-xs">{Object.values(v.labels).join(" · ")}</p>
                      {v.preview_url && <audio controls preload="none" src={v.preview_url} className="mt-2 h-8 w-full" />}
                    </div>
                  ))}
                </div>
              </>
            )}
            {!voices && !vErr && <p className="text-3 text-sm">Potřebuje klíč ElevenLabs.</p>}
          </Card>
        </div>
      )}
    </div>
  );
}
