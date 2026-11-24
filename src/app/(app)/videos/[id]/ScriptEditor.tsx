"use client";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Empty, Field, Modal, Slider, Toggle, api, cx, fmtDate, useToast } from "@/components/ui";
import { VideoPreview } from "@/components/Preview";
import { HOOK_TYPES, SCRIPT_POSES, TEMPLATES, templateDef } from "@/lib/constants";
import { emptyScene, normalizeScript, rebuildAudioParts, sentences, validateScript, words, type Scene, type Script } from "@/lib/script";
import { buildSpec } from "@/lib/outputs";
import type { Ctx } from "./Workspace";

const POSE_LABEL: Record<string, string> = {
  Original: "Original — neutrální",
  Point_up: "Point_up — hook, tvrzení",
  Shrug: "Shrug — problém, absurdita",
  Arms_crossed: "Arms_crossed — mýtus",
  Thinking: "Thinking — otázka, zvrat",
  Point_down: "Point_down — CTA",
};

export function ScriptEditor({ ctx }: { ctx: Ctx }) {
  const toast = useToast();
  const { data, rules } = ctx;
  const locked = !!data.video.script_locked;
  const [s, setS] = useState<Script | null>(data.script);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [seek, setSeek] = useState<number | null>(null);
  const [regen, setRegen] = useState<{ n: number; instruction: string } | null>(null);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    if (!dirty) setS(data.script);
  }, [data.script, dirty]);

  const update = (fn: (x: Script) => Script) => {
    setS((cur) => (cur ? normalizeScript(fn(cur)) : cur));
    setDirty(true);
  };
  const setScene = (n: number, patch: Partial<Scene>) => update((x) => ({ ...x, scenes: x.scenes.map((sc) => (sc.n === n ? { ...sc, ...patch } : sc)) }));

  const checks = useMemo(() => (s ? validateScript(s, rules) : []), [s, rules]);
  const spec = useMemo(() => {
    if (!s) return null;
    try {
      return buildSpec(s, ctx.specCfg);
    } catch {
      return null;
    }
  }, [s, ctx.specCfg]);
  const wc = s ? words(s.scenes.map((x) => x.spoken).join(" ")).length : 0;
  const est = wc / rules.words_per_second;
  const errors = checks.filter((c) => c.level === "error");

  async function run<T>(key: string, fn: () => Promise<T>, ok?: string) {
    setBusy(key);
    try {
      const r = await fn();
      if (ok) toast("ok", ok);
      return r;
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const save = () =>
    run("save", async () => {
      await api(`/api/videos/${data.video.id}/script`, { method: "PUT", body: { script: s } });
      setDirty(false);
      await ctx.reload();
    }, "Scénář uložen");

  const generate = () =>
    run("gen", async () => {
      if (s && !confirm("Vygenerovat nový scénář? Současná verze zůstane v historii.")) return;
      await api(`/api/videos/${data.video.id}/generate`, { method: "POST" });
      setDirty(false);
      await ctx.reload();
    }, "Scénář vygenerován");

  const approve = () =>
    run("approve", async () => {
      if (dirty) await api(`/api/videos/${data.video.id}/script`, { method: "PUT", body: { script: s } });
      await api(`/api/videos/${data.video.id}/approve`, { method: "POST" });
      setDirty(false);
      await ctx.reload();
      ctx.goTab("voice");
    }, "Schváleno — text je zamčený. Teď hlas.");

  if (!s)
    return (
      <Card>
        <Empty title="Video zatím nemá scénář" icon="✎">
          <p>Claude napíše 60–80 slov v 5–8 scénách podle kapitoly, tónu a pravidel. Výstup se automaticky zkontroluje.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="primary" loading={busy === "gen"} disabled={!ctx.keys.anthropic || !ctx.canEdit} onClick={generate}>Napsat scénář (Claude)</Button>
            <Button loading={busy === "sample"} disabled={!ctx.canEdit} onClick={() => run("sample", async () => { await api(`/api/videos/${data.video.id}/script`, { method: "POST" }); await ctx.reload(); })}>Vložit ukázkový scénář</Button>
            <Button disabled={!ctx.canEdit} onClick={() => { setS(normalizeScript({ id: data.video.number, title: data.video.title, slug: data.video.slug, chapter: data.video.chapter, hook_type: data.video.hook_type as Script["hook_type"], word_count: 0, cta: ctx.brand.cta.text, scenes: [1, 2, 3, 4, 5].map(emptyScene).map((x, i, a) => (i === a.length - 1 ? { ...x, pose: "Point_down" as const, template: "ebook_cta", params: [{ key: "cta", value: ctx.brand.cta.text }] } : x)), audio_parts: [{ part: 1, scenes: [1, 2], mood: "", stability: 0.45, tagged_text: "" }, { part: 2, scenes: [3, 4, 5], mood: "", stability: 0.5, tagged_text: "" }], sfx: [], caption: "", hashtags: [] })); setDirty(true); }}>Psát ručně</Button>
          </div>
          {!ctx.keys.anthropic && <p className="mt-3 text-xs">Pro generování přidej klíč v Nastavení → API klíče.</p>}
        </Empty>
      </Card>
    );

  const disabled = !ctx.canEdit;
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        {/* lišta akcí */}
        <div className="surface sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3 lg:top-2">
          <div className="mr-auto flex flex-wrap items-center gap-3 text-sm">
            <span><b className={cx("tabular-nums", (wc < rules.words_min || wc > rules.words_max) && "text-red-600")}>{wc}</b> <span className="text-3">slov ({rules.words_min}–{rules.words_max})</span></span>
            <span><b className="tabular-nums">{s.scenes.length}</b> <span className="text-3">scén</span></span>
            <span title={`Reálné tempo hlasu ${rules.words_per_second} slova/s`}><b className="tabular-nums">~{est.toFixed(1)} s</b> <span className="text-3">(cíl {rules.target_duration_s} s)</span></span>
            {errors.length ? <Badge color="#DC2626">{errors.length} chyb</Badge> : <Badge color="#10B981">kontroly OK</Badge>}
            {dirty && <Badge color="#F59E0B">neuloženo</Badge>}
          </div>
          {!locked && <Button size="sm" loading={busy === "gen"} disabled={!ctx.keys.anthropic || disabled} onClick={generate} title="Přepíše celý scénář">↻ Nový scénář (AI)</Button>}
          <Button size="sm" variant="ghost" onClick={() => setShowJson(true)}>JSON</Button>
          <Button size="sm" variant="dark" loading={busy === "save"} disabled={!dirty || disabled} onClick={save}>Uložit</Button>
          {locked ? (
            <Button size="sm" loading={busy === "unlock"} disabled={disabled} onClick={() => confirm("Odemknout scénář? Změna textu znamená nové audio.") && run("unlock", async () => { await api(`/api/videos/${data.video.id}/unlock`, { method: "POST" }); await ctx.reload(); })}>🔓 Odemknout</Button>
          ) : (
            <Button size="sm" variant="primary" loading={busy === "approve"} disabled={errors.length > 0 || disabled} onClick={approve} title={errors.length ? "Nejdřív oprav chyby" : ""}>Schválit ✓</Button>
          )}
        </div>
        {locked && <p className="rounded-xl bg-violet-50 px-4 py-2.5 text-sm text-violet-900 dark:bg-violet-950/40 dark:text-violet-200">Scénář je schválený — mluvený text je zamčený (změna = nové audio). Pózy, grafiku, titulky a popisek můžeš dál upravovat.</p>}

        {/* metadata */}
        <Card title="Základ">
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Název" className="md:col-span-2"><input className="input" disabled={disabled} value={s.title} onChange={(e) => update((x) => ({ ...x, title: e.target.value }))} /></Field>
            <Field label="Slug (bez diakritiky)" className="md:col-span-2"><input className="input" disabled={disabled} value={s.slug} onChange={(e) => update((x) => ({ ...x, slug: e.target.value.replace(/[^A-Za-z0-9_]/g, "_") }))} /></Field>
            <Field label="Kapitola">
              <select className="input" disabled={disabled} value={s.chapter} onChange={(e) => update((x) => ({ ...x, chapter: Number(e.target.value) }))}>
                {ctx.chapters.map((c) => <option key={c.n} value={c.n}>{c.n}. {c.title}</option>)}
              </select>
            </Field>
            <Field label="Typ hooku">
              <select className="input" disabled={disabled} value={s.hook_type} onChange={(e) => update((x) => ({ ...x, hook_type: e.target.value as Script["hook_type"] }))}>
                {HOOK_TYPES.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
              </select>
            </Field>
            <Field label="CTA"><input className="input" disabled={disabled} value={s.cta} onChange={(e) => update((x) => ({ ...x, cta: e.target.value }))} /></Field>
            <Field label="ID"><input className="input" disabled value={s.id} /></Field>
          </div>
        </Card>

        {/* scény */}
        {s.scenes.map((sc, i) => {
          const tpl = templateDef(sc.template);
          const sw = words(sc.spoken);
          const sceneChecks = checks.filter((c) => c.scene === sc.n);
          const pObj = Object.fromEntries(sc.params.map((p) => [p.key, p.value]));
          const setParam = (k: string, val: string) => {
            const exists = sc.params.some((p) => p.key === k);
            setScene(sc.n, { params: exists ? sc.params.map((p) => (p.key === k ? { ...p, value: val } : p)) : [...sc.params, { key: k, value: val }] });
          };
          return (
            <Card key={i} pad={false} className={cx(sceneChecks.some((c) => c.level === "error") && "ring-1 ring-red-300")}>
              <div className="flex flex-wrap items-center gap-2 border-b border-base px-4 py-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-900 text-sm font-extrabold text-white">{sc.n}</span>
                <span className="text-3 text-xs">{sw.length} slov · ~{(sw.length / rules.words_per_second).toFixed(1)} s{i === 0 ? " · HOOK" : i === s.scenes.length - 1 ? " · CTA" : ""}</span>
                <div className="ml-auto flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => {
                    const tl = spec ? undefined : null;
                    void tl;
                    let t = 0;
                    for (let k = 0; k < i; k++) t += words(s.scenes[k].spoken).length / rules.words_per_second + 0.3;
                    setSeek(t + 0.05 + Math.random() * 1e-4);
                  }}>▶ náhled</Button>
                  {!locked && (
                    <>
                      <Button size="sm" variant="ghost" disabled={!ctx.keys.anthropic || disabled} onClick={() => setRegen({ n: sc.n, instruction: "" })}>✦ Přegenerovat{i === 0 ? " hook" : ""}</Button>
                      <Button size="sm" variant="ghost" disabled={i === 0 || disabled} onClick={() => update((x) => { const a = [...x.scenes]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return { ...x, scenes: a }; })}>↑</Button>
                      <Button size="sm" variant="ghost" disabled={i === s.scenes.length - 1 || disabled} onClick={() => update((x) => { const a = [...x.scenes]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; return { ...x, scenes: a }; })}>↓</Button>
                      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => confirm(`Smazat scénu ${sc.n}?`) && update((x) => ({ ...x, scenes: x.scenes.filter((_, k) => k !== i) }))}>✕</Button>
                    </>
                  )}
                </div>
              </div>
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <Field label="Mluvený text" hint={sentences(sc.spoken).map((x) => words(x).length).join(" + ") + " slov ve větách · čísla slovy"}>
                    <textarea className="input" rows={3} disabled={locked || disabled} value={sc.spoken} onChange={(e) => setScene(sc.n, { spoken: e.target.value })} />
                  </Field>
                  <Field label="Text na obrazovce (2–5 slov, *akcent*)">
                    <input className="input font-bold" disabled={disabled} value={sc.on_screen} onChange={(e) => setScene(sc.n, { on_screen: e.target.value })} />
                  </Field>
                  <p className="rounded-lg bg-navy-900 px-3 py-2 text-center text-lg font-extrabold text-white">
                    {sc.on_screen.split(/(\*[^*]+\*)/).map((part, k) => (part.startsWith("*") ? <span key={k} className="text-accent">{part.slice(1, -1)}</span> : <span key={k}>{part}</span>))}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Póza">
                      <select className="input" disabled={disabled} value={sc.pose} onChange={(e) => setScene(sc.n, { pose: e.target.value as Scene["pose"] })}>
                        {SCRIPT_POSES.map((p) => <option key={p} value={p}>{POSE_LABEL[p]}</option>)}
                      </select>
                    </Field>
                    <Field label="Počítadlo" hint="např. KROK 2/4">
                      <input className="input" disabled={disabled} value={sc.counter ?? ""} onChange={(e) => setScene(sc.n, { counter: e.target.value || null })} />
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <Toggle checked={sc.return_to_neutral} onChange={(v) => setScene(sc.n, { return_to_neutral: v })} label="Po gestu zpět na Original" />
                  </div>
                  <PoseExtras sc={sc} disabled={disabled} onChange={(pose_extra) => setScene(sc.n, { pose_extra })} />
                </div>
                <div className="space-y-3">
                  <Field label="Popis grafiky">
                    <textarea className="input" rows={2} disabled={disabled} value={sc.graphic} onChange={(e) => setScene(sc.n, { graphic: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                    <Field label="Šablona">
                      <select className="input" disabled={disabled} value={sc.template} onChange={(e) => {
                        const t = templateDef(e.target.value);
                        setScene(sc.n, { template: e.target.value, params: t ? t.params.map((p) => ({ key: p.key, value: pObj[p.key] ?? p.example })) : sc.params, events: [] });
                      }}>
                        {TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label} ({t.key})</option>)}
                      </select>
                    </Field>
                    <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold" title="Grafika plynule pokračuje z předchozí scény (stejná šablona)">
                      <input type="checkbox" disabled={disabled || i === 0} checked={sc.continue_from_scene} onChange={(e) => setScene(sc.n, { continue_from_scene: e.target.checked })} /> navazuje
                    </label>
                  </div>
                  {tpl && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {tpl.params.map((p) => (
                        <Field key={p.key} label={`${p.label}${p.list ? " (odděl |)" : ""}`}>
                          <input className="input" disabled={disabled} value={pObj[p.key] ?? ""} placeholder={p.example} onChange={(e) => setParam(p.key, e.target.value)} />
                        </Field>
                      ))}
                    </div>
                  )}
                  <div>
                    <span className="label">Události na slovech</span>
                    <div className="space-y-1.5">
                      {sc.events.map((ev, k) => (
                        <div key={k} className="flex gap-2">
                          <select className="input" disabled={disabled} value={ev.action} onChange={(e) => setScene(sc.n, { events: sc.events.map((x, j) => (j === k ? { ...x, action: e.target.value } : x)) })}>
                            {(tpl?.events ?? [ev.action]).map((a) => <option key={a}>{a}</option>)}
                          </select>
                          <select className="input" disabled={disabled} value={ev.word} onChange={(e) => setScene(sc.n, { events: sc.events.map((x, j) => (j === k ? { ...x, word: e.target.value } : x)) })}>
                            {[ev.word, ...sw.map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))].filter((x, j, a) => x && a.indexOf(x) === j).map((w) => <option key={w}>{w}</option>)}
                          </select>
                          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setScene(sc.n, { events: sc.events.filter((_, j) => j !== k) })}>✕</Button>
                        </div>
                      ))}
                      {tpl && tpl.events.length > 0 && (
                        <button disabled={disabled} className="text-xs font-semibold text-accent" onClick={() => setScene(sc.n, { events: [...sc.events, { action: tpl.events[0], word: sw[0]?.replace(/[^\p{L}\p{N}]/gu, "") ?? "" }] })}>+ událost</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {sceneChecks.length > 0 && (
                <ul className="space-y-1 border-t border-base px-4 py-2.5 text-xs">
                  {sceneChecks.map((c, k) => <li key={k} className={c.level === "error" ? "text-red-600" : "text-amber-600"}>{c.level === "error" ? "✗" : "⚠"} {c.message}</li>)}
                </ul>
              )}
            </Card>
          );
        })}
        {!locked && (
          <Button disabled={disabled} onClick={() => update((x) => ({ ...x, scenes: [...x.scenes.slice(0, -1), emptyScene(x.scenes.length), ...x.scenes.slice(-1)] }))}>+ Přidat scénu před CTA</Button>
        )}

        <AudioPartsEditor s={s} locked={locked} disabled={disabled} update={update} />

        <Card title="Efekty, popisek a hashtagy" subtitle={`Bez hudby — jen hlas a max ${rules.max_sfx} efekty`}>
          <div className="space-y-2">
            {s.sfx.map((f, k) => (
              <div key={k} className="grid grid-cols-[120px_100px_1fr_auto] gap-2">
                <select className="input" disabled={disabled} value={f.type} onChange={(e) => update((x) => ({ ...x, sfx: x.sfx.map((y, j) => (j === k ? { ...y, type: e.target.value as "pop" } : y)) }))}>
                  {["pop", "tick", "swoosh"].map((t) => <option key={t}>{t}</option>)}
                </select>
                <select className="input" disabled={disabled} value={f.scene} onChange={(e) => update((x) => ({ ...x, sfx: x.sfx.map((y, j) => (j === k ? { ...y, scene: Number(e.target.value) } : y)) }))}>
                  {s.scenes.map((x) => <option key={x.n} value={x.n}>scéna {x.n}</option>)}
                </select>
                <select className="input" disabled={disabled} value={f.word} onChange={(e) => update((x) => ({ ...x, sfx: x.sfx.map((y, j) => (j === k ? { ...y, word: e.target.value } : y)) }))}>
                  {[f.word, ...words(s.scenes.find((x) => x.n === f.scene)?.spoken ?? "").map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))].filter((x, j, a) => x && a.indexOf(x) === j).map((w) => <option key={w}>{w}</option>)}
                </select>
                <Button size="sm" variant="ghost" disabled={disabled} onClick={() => update((x) => ({ ...x, sfx: x.sfx.filter((_, j) => j !== k) }))}>✕</Button>
              </div>
            ))}
            {s.sfx.length < rules.max_sfx && <button disabled={disabled} className="text-sm font-semibold text-accent" onClick={() => update((x) => ({ ...x, sfx: [...x.sfx, { type: "pop", scene: 1, word: words(x.scenes[0]?.spoken ?? "")[0]?.replace(/[^\p{L}\p{N}]/gu, "") ?? "" }] }))}>+ efekt</button>}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Popisek (1 řádek: hook + šipka na odkaz)"><input className="input" disabled={disabled} value={s.caption} onChange={(e) => update((x) => ({ ...x, caption: e.target.value.replace(/\n/g, " ") }))} /></Field>
            <Field label={`Hashtagy (max ${rules.max_hashtags}, mezerou)`}><input className="input" disabled={disabled} value={s.hashtags.join(" ")} onChange={(e) => update((x) => ({ ...x, hashtags: e.target.value.split(/[\s,]+/).filter(Boolean).map((h) => (h.startsWith("#") ? h : `#${h}`)) }))} /></Field>
          </div>
        </Card>

        <Card title="Historie verzí scénáře" pad={false}>
          <ul className="divide-y divide-[var(--border)] text-sm">
            {data.versions.map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-5 py-2">
                <span className="text-3 w-36 text-xs">{fmtDate(v.created_at)}</span>
                <Badge color={v.source === "llm" ? "#8B5CF6" : v.source === "revision" ? "#FB6720" : "#7C8AA5"}>{{ llm: "AI", edit: "úprava", revision: "připomínky", sample: "ukázka", demo: "demo" }[v.source] ?? v.source}</Badge>
                <span className="text-2 truncate">{v.note}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* pravý panel */}
      <div className="space-y-4 xl:sticky xl:top-2 xl:self-start">
        <Card title="Živý náhled" subtitle="Odhad časů podle tempa — přesné po nahrání audia" pad>
          <div className="flex justify-center">
            <VideoPreview spec={spec} cfg={ctx.cfg} seekTo={seek} width={280} />
          </div>
        </Card>
        <Card title="Automatické kontroly" pad={false}>
          <ul className="max-h-[360px] space-y-1.5 overflow-y-auto p-4 text-sm">
            {checks.map((c, k) => (
              <li key={k} className={cx("flex gap-2", c.level === "error" ? "text-red-600" : c.level === "warn" ? "text-amber-600" : "text-emerald-600")}>
                <span>{c.level === "error" ? "✗" : c.level === "warn" ? "⚠" : "✓"}</span>
                <span>{c.scene ? <b>Scéna {c.scene}: </b> : null}{c.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Modal open={!!regen} onClose={() => setRegen(null)} title={`Přegenerovat scénu ${regen?.n}`}>
        <Field label="Co změnit (volitelné)" hint="např. „úderněji“, „víc humoru“, „konkrétnější situace z koleje“">
          <textarea className="input" rows={3} value={regen?.instruction ?? ""} onChange={(e) => setRegen(regen && { ...regen, instruction: e.target.value })} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setRegen(null)}>Zrušit</Button>
          <Button variant="primary" loading={busy === "scene"} onClick={() => regen && run("scene", async () => {
            const r = await api<{ scene: Scene }>(`/api/videos/${data.video.id}/scene`, { body: { n: regen.n, instruction: regen.instruction, script: s } });
            update((x) => {
              const next = { ...x, scenes: x.scenes.map((sc) => (sc.n === regen.n ? r.scene : sc)) };
              return rebuildAudioParts(next, true);
            });
            setRegen(null);
          }, "Scéna přepsána — zkontroluj a ulož")}>Přegenerovat</Button>
        </div>
      </Modal>
      <Modal open={showJson} onClose={() => setShowJson(false)} title="Scénář jako JSON" wide>
        <JsonEditor value={s} disabled={disabled} onApply={(v) => { update(() => v); setShowJson(false); }} />
      </Modal>
    </div>
  );
}

function PoseExtras({ sc, disabled, onChange }: { sc: Scene; disabled: boolean; onChange: (v: Scene["pose_extra"]) => void }) {
  const sw = words(sc.spoken).map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""));
  return (
    <div>
      {sc.pose_extra.map((p, k) => (
        <div key={k} className="mb-1.5 flex items-center gap-2 text-sm">
          <span className="text-3 text-xs">gesto</span>
          <select className="input" disabled={disabled} value={p.pose} onChange={(e) => onChange(sc.pose_extra.map((x, j) => (j === k ? { ...x, pose: e.target.value as Scene["pose"] } : x)))}>
            {SCRIPT_POSES.map((x) => <option key={x}>{x}</option>)}
          </select>
          <span className="text-3 text-xs">na</span>
          <select className="input" disabled={disabled} value={p.word} onChange={(e) => onChange(sc.pose_extra.map((x, j) => (j === k ? { ...x, word: e.target.value } : x)))}>
            {[p.word, ...sw].filter((x, j, a) => x && a.indexOf(x) === j).map((w) => <option key={w}>{w}</option>)}
          </select>
          <button disabled={disabled} className="text-3" onClick={() => onChange(sc.pose_extra.filter((_, j) => j !== k))}>✕</button>
        </div>
      ))}
      <button disabled={disabled} className="text-xs font-semibold text-accent" onClick={() => onChange([...sc.pose_extra, { pose: "Point_up", word: sw[0] ?? "" }])}>+ gesto na slově</button>
    </div>
  );
}

function AudioPartsEditor({ s, locked, disabled, update }: { s: Script; locked: boolean; disabled: boolean; update: (fn: (x: Script) => Script) => void }) {
  const setPart = (k: number, patch: Partial<Script["audio_parts"][number]>) => update((x) => ({ ...x, audio_parts: x.audio_parts.map((p, j) => (j === k ? { ...p, ...patch } : p)) }));
  return (
    <Card
      title="Části pro ElevenLabs"
      subtitle="2–4 části, každá jiná nálada, 7–18 s. Text bez tagů = mluvený text slovo od slova."
      actions={!locked && <Button size="sm" disabled={disabled} onClick={() => update((x) => rebuildAudioParts(x, true))} title="Doplní text z mluveného textu scén, zachová úvodní tag">Sestavit texty ze scén</Button>}
    >
      <div className="space-y-4">
        {s.audio_parts.map((p, k) => (
          <div key={k} className="rounded-xl border border-base p-3">
            <div className="flex flex-wrap items-center gap-3">
              <b>cast{p.part}.mp3</b>
              <span className="text-3 text-xs">scény:</span>
              {s.scenes.map((sc) => (
                <label key={sc.n} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" disabled={locked || disabled} checked={p.scenes.includes(sc.n)} onChange={(e) => setPart(k, { scenes: e.target.checked ? [...p.scenes, sc.n].sort((a, b) => a - b) : p.scenes.filter((n) => n !== sc.n) })} />
                  {sc.n}
                </label>
              ))}
              <span className="text-3 ml-auto text-xs">~{(words(p.scenes.map((n) => s.scenes.find((x) => x.n === n)?.spoken ?? "").join(" ")).length / 2.1).toFixed(1)} s</span>
              {!locked && s.audio_parts.length > 2 && <button disabled={disabled} className="text-3 text-xs" onClick={() => update((x) => ({ ...x, audio_parts: x.audio_parts.filter((_, j) => j !== k).map((q, j) => ({ ...q, part: j + 1 })) }))}>✕ odebrat</button>}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_200px]">
              <Field label="Nálada"><input className="input" disabled={disabled} value={p.mood} onChange={(e) => setPart(k, { mood: e.target.value })} /></Field>
              <Slider label="Stability" value={p.stability} onChange={(v) => setPart(k, { stability: v })} min={0.3} max={0.7} step={0.05} format={(v) => `${Math.round(v * 100)} %`} />
            </div>
            <Field label="Text s audio tagy" className="mt-2">
              <textarea className="input font-mono text-[13px]" rows={3} disabled={locked || disabled} value={p.tagged_text} onChange={(e) => setPart(k, { tagged_text: e.target.value })} />
            </Field>
          </div>
        ))}
        {!locked && s.audio_parts.length < 4 && <button disabled={disabled} className="text-sm font-semibold text-accent" onClick={() => update((x) => ({ ...x, audio_parts: [...x.audio_parts, { part: x.audio_parts.length + 1, scenes: [], mood: "", stability: 0.5, tagged_text: "" }] }))}>+ část</button>}
      </div>
    </Card>
  );
}

function JsonEditor({ value, onApply, disabled }: { value: Script; onApply: (v: Script) => void; disabled: boolean }) {
  const [txt, setTxt] = useState(JSON.stringify(value, null, 2));
  const [err, setErr] = useState("");
  return (
    <div>
      <textarea className="input h-[60vh] font-mono text-xs" value={txt} onChange={(e) => setTxt(e.target.value)} />
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button onClick={() => navigator.clipboard.writeText(txt)}>Kopírovat</Button>
        <Button variant="primary" disabled={disabled} onClick={() => {
          try {
            onApply(JSON.parse(txt));
          } catch (e) {
            setErr((e as Error).message);
          }
        }}>Použít</Button>
      </div>
    </div>
  );
}
