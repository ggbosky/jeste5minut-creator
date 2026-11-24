"use client";
import { API } from "@/lib/nav";
import { useState } from "react";
import { Badge, Button, Card, Empty, Field, api, fmtDate, useCopy, useToast } from "@/components/ui";
import type { Ctx } from "./Workspace";

const PLATFORMS = [
  { key: "instagram", label: "Instagram Reels" },
  { key: "tiktok", label: "TikTok" },
];

export function ExportTab({ ctx }: { ctx: Ctx }) {
  const { data } = ctx;
  const copy = useCopy();
  const toast = useToast();
  const s = data.script;
  const good = data.renders.filter((r) => r.has_output);
  const best = good.find((r) => r.status === "done") ?? good[0];
  const [ver, setVer] = useState<number | undefined>(data.video.publish_info?.version ?? best?.version);
  const [plat, setPlat] = useState<Record<string, { done: boolean; url?: string }>>(data.video.publish_info?.platforms ?? {});
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  if (!s) return <Card><Empty title="Nejdřív scénář" /></Card>;
  const caption = `${s.caption}\n\n${s.hashtags.join(" ")}`;
  const published = data.video.status === "published";

  async function publish(flag: boolean) {
    setBusy(true);
    try {
      await api(`${API}/videos/${data.video.id}/publish`, { body: { published: flag, date: new Date(date).toISOString(), platforms: plat, version: ver } });
      toast("ok", flag ? "Označeno jako publikované" : "Publikace zrušena");
      await ctx.reload();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Card title="Video" subtitle="1080 × 1920 · 30 fps · H.264 CRF 18 · AAC 192 kb/s · faststart">
          {good.length === 0 ? (
            <p className="text-2 text-sm">Zatím žádný render. <button className="font-semibold text-accent" onClick={() => ctx.goTab("render")}>Vyrenderovat →</button></p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <select className="input w-auto" value={ver} onChange={(e) => setVer(Number(e.target.value))}>
                {good.map((r) => <option key={r.version} value={r.version}>v{r.version} · {r.duration_s?.toFixed(1)} s · {r.status === "done" ? "kontrola OK" : "kontrola ✗"}</option>)}
              </select>
              <a href={`${API}/videos/${data.video.id}/files/mp4?v=${ver}`} className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-sm font-semibold text-white">Stáhnout MP4</a>
              <a href={`${API}/videos/${data.video.id}/files/sheet?v=${ver}`} className="surface inline-flex h-10 items-center rounded-[10px] px-4 text-sm font-semibold">Kontaktní arch</a>
            </div>
          )}
        </Card>
        <Card title="Popisek a hashtagy" actions={<Button size="sm" variant="primary" onClick={() => copy(caption, "Popisek + hashtagy zkopírovány")}>Kopírovat vše</Button>}>
          <div className="rounded-xl bg-[var(--surface-2)] p-4">
            <p className="font-semibold">{s.caption}</p>
            <p className="mt-2 text-sm text-accent">{s.hashtags.join(" ")}</p>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => copy(s.caption)}>Jen popisek</Button>
            <Button size="sm" onClick={() => copy(s.hashtags.join(" "))}>Jen hashtagy</Button>
            {ctx.brand.cta.keyword && <Button size="sm" onClick={() => copy(ctx.brand.cta.keyword)}>Klíčové slovo: {ctx.brand.cta.keyword}</Button>}
          </div>
        </Card>
        <Card title="Záloha a podklady">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["elevenlabs", "ElevenLabs.md", "hlas, části, tagy"],
              ["strih", "Strih.md", "zadání střihu"],
              ["script", "scénář.json", "zdrojový JSON scénáře"],
              ["spec", "video_spec.json", "co má vzniknout"],
              ["timeline", "timeline.json", "kdy co nastane (po renderu)"],
            ].map(([k, n, d]) => (
              <a key={k} href={`${API}/videos/${data.video.id}/files/${k}`} className="surface flex items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:border-accent">
                <span><b>{n}</b><span className="text-3 block text-xs">{d}</span></span>↓
              </a>
            ))}
          </div>
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Publikace" subtitle="Zatím ručně — aplikace připraví soubory a pohlídá stav" actions={published ? <Badge color="#059669" solid>Publikováno</Badge> : null}>
          <div className="space-y-3">
            {PLATFORMS.map((p) => (
              <div key={p.key} className="rounded-xl border border-base p-3">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={!!plat[p.key]?.done} onChange={(e) => setPlat({ ...plat, [p.key]: { ...plat[p.key], done: e.target.checked } })} />
                  {p.label}
                </label>
                <input className="input mt-2" placeholder="Odkaz na příspěvek (volitelné)" value={plat[p.key]?.url ?? ""} onChange={(e) => setPlat({ ...plat, [p.key]: { done: plat[p.key]?.done ?? false, url: e.target.value } })} />
              </div>
            ))}
            <Field label="Datum publikace"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Button variant="primary" className="w-full" loading={busy} disabled={!ctx.canEdit} onClick={() => publish(true)}>{published ? "Uložit změny" : "Označit jako publikované"}</Button>
            {published && <Button size="sm" variant="ghost" className="w-full" onClick={() => publish(false)}>Zrušit stav Publikováno</Button>}
            {data.video.published_at && <p className="text-3 text-xs">Publikováno {fmtDate(data.video.published_at)}</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
