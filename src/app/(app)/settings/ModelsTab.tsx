"use client";
import { useState } from "react";
import { Button, Card, Field, Spinner, Toggle, api, useToast } from "@/components/ui";
import { CLAUDE_MODELS, EFFORT_LEVELS, LLM_TASKS } from "@/lib/constants";
import { useSettings } from "./useSettings";

const TASK_HINT: Record<string, string> = {
  topics: "Krátký výstup, stačí nižší effort.",
  script: "Nejdůležitější úloha — kvalita textu a dodržení pravidel.",
  revision: "Překlad připomínky na minimální změnu scénáře.",
  scene: "Rychlé přepsání jedné scény / hooku.",
};

export function ModelsTab() {
  const toast = useToast();
  const { value: v, set, save, reset, dirty, saving } = useSettings("llm");
  const [apiModels, setApiModels] = useState<{ id: string; display_name: string }[] | null>(null);
  const [loading, setLoading] = useState(false);
  if (!v) return <Spinner />;
  const options = [...CLAUDE_MODELS.map((m) => ({ id: m.id, label: `${m.label} · $${m.input}/$${m.output} za 1M` })), ...(apiModels ?? []).filter((m) => !CLAUDE_MODELS.some((c) => c.id === m.id)).map((m) => ({ id: m.id, label: m.display_name }))];
  const setTask = (k: string, patch: Partial<{ model: string; effort: string; max_tokens: number }>) => set({ tasks: { ...v.tasks, [k]: { ...v.tasks[k], ...patch } } });

  return (
    <div className="space-y-4">
      <Card
        title="Model pro každou úlohu"
        subtitle="Výchozí je Claude Opus 5.5. Effort řídí hloubku přemýšlení a spotřebu tokenů."
        actions={
          <>
            <Button size="sm" loading={loading} onClick={async () => {
              setLoading(true);
              try {
                setApiModels((await api<{ models: { id: string; display_name: string }[] }>("/api/llm/models")).models);
                toast("ok", "Seznam modelů načten z API");
              } catch (e) {
                toast("error", (e as Error).message);
              } finally {
                setLoading(false);
              }
            }}>Načíst modely z API</Button>
            <Button size="sm" variant="ghost" onClick={reset}>Výchozí</Button>
            <Button size="sm" variant="primary" disabled={!dirty} loading={saving} onClick={save}>Uložit</Button>
          </>
        }
        pad={false}
      >
        <div className="divide-y divide-[var(--border)]">
          {LLM_TASKS.map((t) => {
            const c = v.tasks[t.key] ?? v.tasks.script;
            return (
              <div key={t.key} className="grid gap-3 px-5 py-4 md:grid-cols-[200px_1fr_140px_140px] md:items-end">
                <div>
                  <p className="font-semibold">{t.label}</p>
                  <p className="text-3 text-xs">{TASK_HINT[t.key]}</p>
                </div>
                <Field label="Model">
                  <select className="input" value={c.model} onChange={(e) => setTask(t.key, { model: e.target.value })}>
                    {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    {!options.some((o) => o.id === c.model) && <option value={c.model}>{c.model}</option>}
                  </select>
                </Field>
                <Field label="Effort">
                  <select className="input" value={c.effort} onChange={(e) => setTask(t.key, { effort: e.target.value })}>
                    {EFFORT_LEVELS.map((e) => <option key={e}>{e}</option>)}
                  </select>
                </Field>
                <Field label="Max tokenů">
                  <input type="number" className="input" min={1000} max={64000} step={1000} value={c.max_tokens} onChange={(e) => setTask(t.key, { max_tokens: Number(e.target.value) })} />
                </Field>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Chování">
        <div className="space-y-4">
          <Toggle checked={v.refusal_fallback} onChange={(x) => set({ refusal_fallback: x })} label="Záložní model při odmítnutí (server-side fallback)" hint="Když bezpečnostní filtr odmítne požadavek, API ho automaticky zopakuje na záložním modelu. Platí pro Opus 5.5, Opus 5, Sonnet 5.5 a Fable." />
          <Toggle checked={v.attach_ebook_pdf} onChange={(x) => set({ attach_ebook_pdf: x })} label="Přikládat PDF e-booku k návrhům témat a scénářům" hint="Claude čte přímo e-book (s prompt cachingem). Nahraj PDF v Knihovně obsahu." />
          <Field label="Automatické opravy scénáře" hint="Kolikrát Claude dostane zpět chyby z kontrol a opraví je, než scénář uvidíš.">
            <select className="input w-40" value={v.auto_fix_attempts} onChange={(e) => set({ auto_fix_attempts: Number(e.target.value) })}>
              {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}×</option>)}
            </select>
          </Field>
          <Field label="Doplněk systémového promptu" hint="Přidá se na konec instrukcí pro všechny úlohy. Hraj si — např. styl humoru, oblíbené formulace.">
            <textarea className="input" rows={4} value={v.system_prompt_extra} onChange={(e) => set({ system_prompt_extra: e.target.value })} />
          </Field>
          <a href="/lab?tab=llm" className="inline-block text-sm font-semibold text-accent">Vyzkoušet v Laboratoři →</a>
        </div>
      </Card>
    </div>
  );
}
