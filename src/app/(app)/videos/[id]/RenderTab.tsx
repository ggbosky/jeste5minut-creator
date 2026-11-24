"use client";
import { API, STATIC } from "@/lib/nav";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Empty, Field, api, cx, fmtDate, useToast } from "@/components/ui";
import { RenderBadge } from "@/components/bits";
import type { Ctx, RenderRow } from "./Workspace";

type Live = RenderRow & { log: string };

export function RenderTab({ ctx }: { ctx: Ctx }) {
  const { data } = ctx;
  const toast = useToast();
  const [live, setLive] = useState<Live | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [comments, setComments] = useState<{ scene: number | null; comment: string }[]>([{ scene: null, comment: "" }]);
  const [shown, setShown] = useState<number | null>(null);
  const running = data.renders.find((r) => r.status === "queued" || r.status === "running");
  const s = data.script;

  useEffect(() => {
    if (!running) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await api<Live>(`${API}/renders/${running.id}`);
        if (!alive) return;
        setLive(r);
        if (r.status !== "queued" && r.status !== "running") {
          await ctx.reload();
          toast(r.status === "done" ? "ok" : "error", r.status === "done" ? `Render v${r.version} hotový a prošel kontrolou` : r.status === "qa_failed" ? `Render v${r.version} neprošel automatickou kontrolou` : `Render v${r.version} selhal`);
          return;
        }
      } catch {}
      if (alive) setTimeout(tick, 1000);
    };
    tick();
    return () => { alive = false; };
  }, [running?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return <Card><Empty title="Nejdřív scénář" /></Card>;
  const parts = s.audio_parts.length;
  const sel = new Set(data.takes.filter((t) => t.selected).map((t) => t.part)).size;
  const ready = !!data.video.script_locked && sel === parts;
  const finished = data.renders.filter((r) => r.has_output);
  const current = finished.find((r) => r.version === shown) ?? finished[0] ?? null;

  async function start() {
    setBusy("render");
    try {
      await api(`${API}/videos/${data.video.id}/render`, { body: {} });
      await ctx.reload();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function revise(render: boolean) {
    setBusy(render ? "revise" : "revise-only");
    try {
      const r = await api<{ summary: string; render: { version: number } | null }>(`${API}/videos/${data.video.id}/revise`, { body: { comments, render_version: current?.version, render } });
      toast("ok", r.summary + (r.render ? ` · spuštěn render v${r.render.version}` : ""));
      setComments([{ scene: null, comment: "" }]);
      await ctx.reload();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {running ? (
            <Card title={`Render v${running.version} běží`} subtitle={live?.stage ? `Fáze: ${{ start: "start", audio: "audio", timing: "časování slov", mix: "mix", render: "snímky", qa: "kontrola" }[live.stage] ?? live.stage}` : "Ve frontě"}>
              <div className="h-3 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div className="h-3 rounded-full bg-accent transition-all" style={{ width: `${Math.round((live?.progress ?? 0) * 100)}%` }} />
              </div>
              <p className="mt-2 text-sm font-bold tabular-nums">{Math.round((live?.progress ?? 0) * 100)} %</p>
              <pre className="mt-3 max-h-64 overflow-y-auto rounded-xl bg-navy-950 p-3 font-mono text-xs text-white/80">{live?.log || "Čekám…"}</pre>
            </Card>
          ) : current ? (
            <Card
              title={`Verze v${current.version}`}
              subtitle={`${current.duration_s?.toFixed(1)} s · render ${current.render_seconds?.toFixed(0)} s · ${fmtDate(current.finished_at)}`}
              actions={<RenderBadge status={current.status} />}
            >
              <div className="flex flex-col gap-4 md:flex-row">
                <video key={current.version} controls playsInline className="aspect-[9/16] w-full max-w-[300px] rounded-xl bg-black" src={`${API}/videos/${data.video.id}/files/mp4?v=${current.version}&inline=1`} />
                <div className="min-w-0 flex-1">
                  <h3 className="mb-2 text-sm font-bold">Automatická kontrola</h3>
                  <ul className="space-y-1.5 text-sm">
                    {current.qa?.checks.map((c) => (
                      <li key={c.key} className="flex gap-2">
                        <span className={c.ok ? "text-emerald-600" : c.level === "error" ? "text-red-600" : "text-amber-600"}>{c.ok ? "✓" : c.level === "error" ? "✗" : "⚠"}</span>
                        <span><b>{c.label}</b> <span className="text-2">{c.detail}</span></span>
                      </li>
                    ))}
                  </ul>
                  {current.notes && <p className="text-3 mt-3 text-xs">Poznámka: {current.notes}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a href={`${API}/videos/${data.video.id}/files/mp4?v=${current.version}`} className="inline-flex h-8 items-center rounded-[10px] bg-accent px-3 text-[13px] font-semibold text-white">Stáhnout MP4</a>
                    <a href={`${API}/videos/${data.video.id}/files/timeline`} className="surface inline-flex h-8 items-center rounded-[10px] px-3 text-[13px] font-semibold">timeline.json</a>
                    <a href={`${API}/videos/${data.video.id}/files/spec`} className="surface inline-flex h-8 items-center rounded-[10px] px-3 text-[13px] font-semibold">video_spec.json</a>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <Empty title={ready ? "Připraveno k renderu" : "Ještě to nejde vyrenderovat"} icon="▶">
                {ready ? "Pózy + audio + grafika ze šablon → MP4 1080×1920. Trvá zhruba minutu." : !data.video.script_locked ? "Nejdřív schval scénář." : `Chybí audio (${sel}/${parts} částí).`}
              </Empty>
            </Card>
          )}

          {current?.has_sheet ? (
            <Card title="Kontaktní arch" subtitle={`Snímek ze středu každé scény${STATIC ? "" : " přímo z MP4"} — čitelnost, zóny, zelený lem, synchron`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${API}/videos/${data.video.id}/files/sheet?v=${current.version}&inline=1`} alt="Kontaktní arch" className="w-full rounded-xl" />
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card title="Render">
            <Button variant="primary" className="w-full" loading={busy === "render"} disabled={!ready || !!running || !ctx.canEdit} onClick={start}>
              {finished.length ? `Vyrenderovat novou verzi v${(data.renders[0]?.version ?? 0) + 1}` : "Vyrenderovat video"}
            </Button>
            <p className="text-3 mt-2 text-xs">Audio se normalizuje jednou na {ctx.specCfg.render.target_lufs} LUFS, ořízne se ticho, slova se načasují ({ctx.keys.elevenlabs ? "ElevenLabs Scribe" : "slabikový odhad"}), pak se vykreslí snímky a proběhne automatická kontrola.</p>
          </Card>

          <Card title="Připomínky ke kontrole" subtitle="Připomínka změní scénář/spec a spustí render s vyšší verzí">
            <div className="space-y-3">
              {comments.map((c, k) => (
                <div key={k} className="space-y-1.5">
                  <select className="input" value={c.scene ?? ""} onChange={(e) => setComments(comments.map((x, j) => (j === k ? { ...x, scene: e.target.value ? Number(e.target.value) : null } : x)))}>
                    <option value="">Celé video</option>
                    {s.scenes.map((sc) => <option key={sc.n} value={sc.n}>Scéna {sc.n}: {sc.on_screen.replace(/\*/g, "")}</option>)}
                  </select>
                  <textarea className="input" rows={2} placeholder="např. jiná póza u třetí věty, zrychli úvod, větší číslo…" value={c.comment} onChange={(e) => setComments(comments.map((x, j) => (j === k ? { ...x, comment: e.target.value } : x)))} />
                </div>
              ))}
              <button className="text-sm font-semibold text-accent" onClick={() => setComments([...comments, { scene: null, comment: "" }])}>+ další připomínka</button>
              {data.video.script_locked ? <p className="text-3 text-xs">Audio je nahrané, takže se nemění mluvený text — jen pózy, grafika, titulky, efekty.</p> : null}
              <div className="flex flex-col gap-2">
                <Button variant="primary" loading={busy === "revise"} disabled={!ctx.keys.anthropic || !comments.some((c) => c.comment.trim()) || !!running || !ready || !ctx.canEdit} onClick={() => revise(true)}>Zapracovat a renderovat</Button>
                <Button size="sm" loading={busy === "revise-only"} disabled={!ctx.keys.anthropic || !comments.some((c) => c.comment.trim()) || !ctx.canEdit} onClick={() => revise(false)}>Jen upravit scénář</Button>
              </div>
              {!ctx.keys.anthropic && <p className="text-3 text-xs">Překlad připomínek potřebuje klíč Anthropic. Ručně můžeš upravit scénář v záložce 1.</p>}
            </div>
          </Card>
        </div>
      </div>

      <Card title="Historie verzí" pad={false}>
        {data.renders.length === 0 ? (
          <p className="text-3 p-5 text-sm">Zatím žádný render.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-3 text-left text-xs uppercase">
                <tr className="border-b border-base"><th className="px-5 py-2.5">Verze</th><th className="px-3">Stav</th><th className="px-3">Délka</th><th className="px-3">Render</th><th className="px-3">Kontrola</th><th className="px-3">Poznámka</th><th className="px-3">Vytvořeno</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.renders.map((r) => (
                  <tr key={r.id} className={cx(current?.version === r.version && "bg-[var(--surface-2)]")}>
                    <td className="px-5 py-2.5 font-bold">v{r.version}</td>
                    <td className="px-3"><RenderBadge status={r.status} /></td>
                    <td className="px-3 tabular-nums">{r.duration_s ? `${r.duration_s.toFixed(1)} s` : "—"}</td>
                    <td className="px-3 tabular-nums">{r.render_seconds ? `${r.render_seconds.toFixed(0)} s` : "—"}</td>
                    <td className="px-3">{r.qa ? <Badge color={r.qa.passed ? "#10B981" : "#DC2626"}>{r.qa.checks.filter((c) => c.ok).length}/{r.qa.checks.length}</Badge> : "—"}</td>
                    <td className="text-2 max-w-xs truncate px-3 text-xs" title={r.notes}>{r.notes}</td>
                    <td className="text-3 px-3 text-xs">{fmtDate(r.created_at)}</td>
                    <td className="px-3 text-right">{r.has_output ? <button className="text-xs font-semibold text-accent" onClick={() => setShown(r.version)}>zobrazit</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data.revisions.length > 0 && (
        <Card title="Zapracované připomínky" pad={false}>
          <ul className="divide-y divide-[var(--border)] text-sm">
            {data.revisions.map((r) => (
              <li key={r.id} className="flex gap-3 px-5 py-2.5">
                <span className="text-3 w-32 shrink-0 text-xs">{fmtDate(r.created_at)}</span>
                <span className="shrink-0 font-semibold">{r.render_version ? `v${r.render_version}` : ""}{r.scene ? ` · scéna ${r.scene}` : ""}</span>
                <span className="text-2">{r.comment}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Field label="" className="hidden"><span /></Field>
    </div>
  );
}
