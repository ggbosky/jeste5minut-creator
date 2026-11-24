"use client";
import { API } from "@/lib/nav";
import { useRef, useState } from "react";
import { Badge, Button, Card, Empty, api, cx, useToast } from "@/components/ui";
import { words } from "@/lib/script";
import type { Ctx } from "./Workspace";

export function AudioTab({ ctx }: { ctx: Ctx }) {
  const { data } = ctx;
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [drag, setDrag] = useState<number | "all" | null>(null);
  const [count, setCount] = useState(3);
  const s = data.script;
  if (!s) return <Card><Empty title="Nejdřív scénář" /></Card>;
  const locked = !!data.video.script_locked;

  async function upload(files: FileList | File[], part?: number) {
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("file", f);
    if (part) fd.append("part", String(part));
    setBusy(`up${part ?? "all"}`);
    try {
      const r = await api<{ added: { part: number; name: string; duration: number }[] }>(`${API}/videos/${data.video.id}/audio`, { form: fd });
      toast("ok", r.added.map((a) => `cast${a.part}: ${a.duration.toFixed(1)} s`).join(", "));
      await ctx.reload();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function generate(part: number) {
    setBusy(`tts${part}`);
    try {
      await api(`${API}/videos/${data.video.id}/tts`, { body: { part, count } });
      toast("ok", `Vygenerováno ${count} takeů pro část ${part}`);
      await ctx.reload();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const selected = data.takes.filter((t) => t.selected);
  const totalVoice = selected.reduce((a, t) => a + (t.duration_s ?? 0), 0) + ctx.specCfg.render.gap_s * Math.max(0, s.audio_parts.length - 1);
  const target = ctx.rules.target_duration_s;
  const complete = s.audio_parts.every((p) => selected.some((t) => t.part === p.part));
  const diff = complete ? Math.abs(totalVoice + ctx.specCfg.render.tail_s - target) / target : 0;

  return (
    <div className="space-y-4">
      {!locked && <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">Scénář není schválený — po změně textu bude potřeba audio nahrát znovu.</div>}
      {data.video.audio_stale ? <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">Scénář se od nahrání audia změnil — zkontroluj, že takey odpovídají textu.</div> : null}

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag("all"); }}
        onDragLeave={() => setDrag(null)}
        onDrop={(e) => { e.preventDefault(); setDrag(null); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
        className={cx("rounded-2xl border-2 border-dashed p-6 text-center transition", drag === "all" ? "border-accent bg-accent-50" : "border-base")}
      >
        <p className="font-bold">Přetáhni sem všechny části najednou</p>
        <p className="text-3 text-sm">cast1.mp3 … cast{s.audio_parts.length}.mp3 — přiřadí se podle čísla v názvu</p>
        <label className="mt-3 inline-block cursor-pointer text-sm font-semibold text-accent">
          nebo vyber soubory
          <input type="file" multiple accept="audio/*" className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
        </label>
        {busy === "upall" && <p className="mt-2 text-sm">Nahrávám…</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="surface rounded-2xl p-4">
          <p className="text-3 text-xs font-semibold uppercase">Části s vybraným takem</p>
          <p className="mt-1 text-2xl font-extrabold">{new Set(selected.map((t) => t.part)).size} / {s.audio_parts.length}</p>
        </div>
        <div className="surface rounded-2xl p-4">
          <p className="text-3 text-xs font-semibold uppercase">Délka hlasu (+{ctx.specCfg.render.tail_s} s konec)</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums">{complete ? `${(totalVoice + ctx.specCfg.render.tail_s).toFixed(1)} s` : "—"}</p>
          <p className="text-3 text-xs">před ořezem ticha</p>
        </div>
        <div className="surface rounded-2xl p-4">
          <p className="text-3 text-xs font-semibold uppercase">Odchylka od cíle {target} s</p>
          <p className={cx("mt-1 text-2xl font-extrabold tabular-nums", diff > ctx.rules.duration_tolerance && "text-amber-600")}>{complete ? `${(diff * 100).toFixed(0)} %` : "—"}</p>
          <p className="text-3 text-xs">{diff > ctx.rules.duration_tolerance ? "Víc než 15 % — délku řídí hlas, video bude delší/kratší" : "v toleranci"}</p>
        </div>
      </div>

      {s.audio_parts.map((p) => {
        const takes = data.takes.filter((t) => t.part === p.part);
        const est = words(p.scenes.map((n) => s.scenes.find((x) => x.n === n)?.spoken ?? "").join(" ")).length / ctx.rules.words_per_second;
        return (
          <Card
            key={p.part}
            title={<span>cast{p.part}.mp3 <span className="text-3 font-medium">· scény {p.scenes.join(", ")} · odhad ~{est.toFixed(1)} s</span></span>}
            subtitle={p.mood}
            actions={
              <>
                {ctx.keys.elevenlabs && locked && (
                  <>
                    <select className="input h-8 w-auto py-0 text-xs" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                      {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}× take</option>)}
                    </select>
                    <Button size="sm" loading={busy === `tts${p.part}`} disabled={!!busy || !ctx.canEdit} onClick={() => generate(p.part)}>✦ Generovat (ElevenLabs)</Button>
                  </>
                )}
                <label className={cx("inline-flex h-8 cursor-pointer items-center rounded-[10px] bg-accent px-3 text-[13px] font-semibold text-white", (!ctx.canEdit || !!busy) && "pointer-events-none opacity-50")}>
                  {busy === `up${p.part}` ? "Nahrávám…" : "Nahrát take"}
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files && upload(e.target.files, p.part)} />
                </label>
              </>
            }
            pad={false}
          >
            <div
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDrag(p.part); }}
              onDragLeave={() => setDrag(null)}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDrag(null); if (e.dataTransfer.files.length) upload(e.dataTransfer.files, p.part); }}
              className={cx("min-h-16 transition", drag === p.part && "bg-accent-50")}
            >
              {takes.length === 0 ? (
                <p className="text-3 px-5 py-5 text-sm">Zatím žádný take — přetáhni sem soubor.</p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {takes.map((t) => {
                    const off = t.duration_s ? Math.abs(t.duration_s - est) / est : 0;
                    return (
                      <li key={t.id} className={cx("flex flex-wrap items-center gap-3 px-5 py-3", t.selected && "bg-emerald-50/60 dark:bg-emerald-950/20")}>
                        <label className="flex items-center gap-2 text-sm font-semibold">
                          <input type="radio" name={`part${p.part}`} checked={!!t.selected} disabled={!ctx.canEdit} onChange={async () => { await api(`${API}/videos/${data.video.id}/audio/${t.id}`, { method: "PATCH", body: { selected: true } }); await ctx.reload(); }} />
                          {t.selected ? "Použít ✓" : "Použít"}
                        </label>
                        <audio controls preload="none" src={`${API}/videos/${data.video.id}/audio/${t.id}`} className="h-9 min-w-[220px] flex-1" />
                        <span className="text-2 max-w-[220px] truncate text-xs" title={t.original_name}>{t.original_name}</span>
                        <Badge color={t.source === "tts" ? "#8B5CF6" : "#26406E"}>{t.source === "tts" ? `API${t.meta?.profile ? ` · ${t.meta.profile}` : ""}` : t.source === "demo" ? "demo" : "nahráno"}</Badge>
                        <span className={cx("text-xs font-bold tabular-nums", off > 0.35 && "text-amber-600")}>{t.duration_s?.toFixed(1)} s</span>
                        <Button size="sm" variant="ghost" disabled={!ctx.canEdit} onClick={async () => { if (confirm("Smazat take?")) { await api(`${API}/videos/${data.video.id}/audio/${t.id}`, { method: "DELETE" }); await ctx.reload(); } }}>✕</Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        );
      })}
      <div className="flex justify-end">
        <Button variant="primary" disabled={!complete || !locked} onClick={() => ctx.goTab("render")}>Pokračovat na render →</Button>
      </div>
    </div>
  );
}
