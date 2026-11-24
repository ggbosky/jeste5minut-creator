// Stránky statické verze — tenké obaly nad stejnými klientskými komponentami jako Next.js verze.
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card, PageHeader, Spinner, Stat, fmtDate } from "@/components/ui";
import { BarChart, HBars } from "@/components/charts";
import { RenderBadge, actionLabel } from "@/components/bits";
import { statusMeta } from "@/lib/constants";
import { API } from "@/lib/nav";
import { VideoList } from "@/app/(app)/videos/VideoList";
import { NewVideo } from "@/app/(app)/videos/new/NewVideo";
import { Workspace } from "@/app/(app)/videos/[id]/Workspace";
import { TopicsClient } from "@/app/(app)/topics/TopicsClient";
import { LibraryClient } from "@/app/(app)/library/LibraryClient";
import { AssetsClient } from "@/app/(app)/assets/AssetsClient";
import { LabClient } from "@/app/(app)/lab/LabClient";
import { SettingsClient } from "@/app/(app)/settings/SettingsClient";
import { ElevenQuota } from "@/app/(app)/ElevenQuota";
import { usePageData } from "./usePageData";

function Loader<T>({ url, children }: { url: string; children: (d: T) => ReactNode }) {
  const { data, error } = usePageData<T>(url);
  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <div className="flex items-center gap-3 p-10"><Spinner /> Načítám…</div>;
  return <>{children(data)}</>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const VideosPage = () => <Loader<any> url={`${API}/pagedata/videos`}>{(d) => <VideoList videos={d.videos} chapters={d.chapters} />}</Loader>;
export const NewVideoPage = () => <Loader<any> url={`${API}/pagedata/new`}>{(d) => <NewVideo chapters={d.chapters} backlog={d.backlog} hasKey={d.hasKey} />}</Loader>;
export const VideoPage = ({ id }: { id: number }) => (
  <Loader<any> url={`${API}/pagedata/video/${id}`}>{(d) => <Workspace key={id} {...d} />}</Loader>
);
export const TopicsPage = () => <Loader<any> url={`${API}/pagedata/topics`}>{(d) => <TopicsClient chapters={d.chapters} hasKey={d.hasKey} />}</Loader>;
export const LibraryPage = () => <Loader<any> url={`${API}/pagedata/library`}>{(d) => <LibraryClient chapters={d.chapters} usage={d.usage} ebook={d.ebook} />}</Loader>;
export const AssetsPage = () => <Loader<any> url={`${API}/pagedata/assets`}>{(d) => <AssetsClient poses={d.poses} cover={d.cover} logo={d.logo} cfg={d.cfg} specCfg={d.specCfg} />}</Loader>;
export const LabPage = () => <Loader<any> url={`${API}/pagedata/lab`}>{(d) => <LabClient profiles={d.profiles} keys={d.keys} llm={d.llm} rules={d.rules} />}</Loader>;
export const SettingsPage = () => <Loader<any> url={`${API}/pagedata/settings`}>{(d) => <SettingsClient role={d.role} me={d.me} />}</Loader>;

export function ActivityPage() {
  return (
    <Loader<any> url={`${API}/pagedata/activity`}>
      {(d) => (
        <div>
          <PageHeader title="Aktivita a náklady" subtitle="Co se v aplikaci dělo a kolik stála API volání (odhad podle ceníku)" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Náklady 30 dní" value={`$${d.tot.c.toFixed(2)}`} sub={`${d.tot.n} volání API`} accent />
            <Stat label="Náklady celkem" value={`$${d.all.toFixed(2)}`} />
            <Stat label="ElevenLabs znaků (30 d)" value={d.chars.toLocaleString("cs-CZ")} sub="generování hlasu" />
            <Stat label="Rendery (30 d)" value={d.renders.n} sub={d.renders.s ? `${(d.renders.s / 60).toFixed(1)} min` : ""} />
          </div>
          <Card title="Využití API za 30 dní" className="mt-6" pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-3 text-left text-xs uppercase"><tr className="border-b border-base"><th className="px-5 py-2.5">Poskytovatel</th><th className="px-3">Model</th><th className="px-3">Úloha</th><th className="px-3 text-right">Volání</th><th className="px-3 text-right">Tokeny in/out</th><th className="px-3 text-right">Znaky</th><th className="px-5 text-right">Cena</th></tr></thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {d.byModel.length === 0 && <tr><td colSpan={7} className="text-3 px-5 py-4">Zatím žádná volání.</td></tr>}
                  {d.byModel.map((r: any, i: number) => (
                    <tr key={i}>
                      <td className="px-5 py-2.5">{r.provider}</td><td className="px-3 font-mono text-xs">{r.model}</td><td className="px-3">{r.task}</td>
                      <td className="px-3 text-right tabular-nums">{r.n}{r.fails ? <span className="text-red-600"> ({r.fails} ✗)</span> : null}</td>
                      <td className="px-3 text-right tabular-nums">{r.inp.toLocaleString("cs-CZ")} / {r.outp.toLocaleString("cs-CZ")}</td>
                      <td className="px-3 text-right tabular-nums">{r.chars ? r.chars.toLocaleString("cs-CZ") : "—"}</td>
                      <td className="px-5 text-right font-semibold tabular-nums">${r.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Log aktivity" className="mt-6" pad={false}>
            <ul className="divide-y divide-[var(--border)]">
              {d.rows.map((a: any) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="text-3 w-32 shrink-0 text-xs tabular-nums">{fmtDate(a.created_at)}</span>
                  <span className="w-28 shrink-0 truncate font-semibold">{a.name ?? "systém"}</span>
                  <span className="text-2 min-w-0 flex-1 truncate">{actionLabel(a.action)}{a.detail ? ` · ${a.detail}` : ""}</span>
                  {a.entity === "video" && a.entity_id ? <Link href={`/videos/${a.entity_id}`} className="text-xs font-semibold text-accent">video →</Link> : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </Loader>
  );
}

export function DashboardPage() {
  return (
    <Loader<any> url={`${API}/pagedata/dashboard`}>
      {(d) => {
        const videos = d.videos as { id: number; number: string; title: string; status: string; chapter: number }[];
        const finished = videos.filter((v) => ["done", "published"].includes(v.status)).length;
        const inProd = videos.length - finished;
        const todo = [
          ...videos.filter((v) => v.status === "idea").map((v) => ({ v, what: "Vygeneruj scénář", tab: "script" })),
          ...videos.filter((v) => v.status === "script").map((v) => ({ v, what: "Schval scénář", tab: "script" })),
          ...videos.filter((v) => ["approved", "awaiting_audio"].includes(v.status)).map((v) => ({ v, what: "Nahraj audio z ElevenLabs", tab: "audio" })),
          ...videos.filter((v) => v.status === "render").map((v) => ({ v, what: "Spusť render a zkontroluj video", tab: "render" })),
          ...videos.filter((v) => v.status === "done").map((v) => ({ v, what: "Publikuj na Reels a TikTok", tab: "export" })),
        ].slice(0, 8);
        const key = (p: string) => d.keys.find((k: any) => k.provider === p)?.configured;
        const setup = [
          { ok: key("anthropic"), label: "API klíč Anthropic", href: "/settings?tab=keys" },
          { ok: key("elevenlabs"), label: "API klíč ElevenLabs (volitelné)", href: "/settings?tab=keys" },
          { ok: d.ebook, label: "PDF e-booku v knihovně", href: "/library" },
          { ok: d.poses >= 6, label: `Pózy avatara (${d.poses}/6)`, href: "/assets" },
          { ok: typeof VideoEncoder !== "undefined", label: typeof VideoEncoder !== "undefined" ? "Render v prohlížeči (WebCodecs) připraven" : "Prohlížeč neumí WebCodecs — render nepůjde", href: "/settings?tab=system" },
        ];
        const hour = new Date().getHours();
        return (
          <div>
            <PageHeader
              title={`${hour < 10 ? "Dobré ráno" : hour < 18 ? "Ahoj" : "Dobrý večer"}, ${d.user.name}`}
              subtitle={`${d.brand.name} · ${d.brand.platforms.join(" + ")} · 1080 × 1920 · statická verze (data jen v tomto prohlížeči)`}
              actions={<>
                <Link href="/topics" className="surface inline-flex h-10 items-center rounded-[10px] px-4 text-sm font-semibold">Zásobník témat</Link>
                <Link href="/videos/new" className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-600">+ Nové video</Link>
              </>}
            />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Stat label="Videí celkem" value={videos.length} sub={`${finished} hotových`} />
              <Stat label="Ve výrobě" value={inProd} accent={inProd > 0} />
              <Stat label="Publikováno" value={d.statuses.find((s: any) => s.key === "published").value} />
              <Stat label="Témat v zásobě" value={d.topics} sub={d.topics < 5 ? "doplň zásobu" : "dost na pár týdnů"} />
              <Stat label="Průměrný render" value={d.avgRender ? `${d.avgRender.toFixed(0)} s` : "—"} sub="v prohlížeči" />
              <Stat label="API náklady 30 dní" value={`$${d.cost30.toFixed(2)}`} sub="odhad z tokenů a znaků" />
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-3">
              <Card title="Čeká na tebe" subtitle="Další krok u rozpracovaných videí" className="xl:col-span-2" pad={false}>
                {todo.length === 0 ? (
                  <div className="text-2 p-6 text-sm">Nic nečeká. <Link href="/videos/new" className="font-semibold text-accent">Začni nové video →</Link></div>
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {todo.map(({ v, what, tab }) => (
                      <li key={`${v.id}-${what}`}>
                        <Link href={`/videos/${v.id}?tab=${tab}`} className="flex items-center gap-4 px-5 py-3 hover:bg-[var(--surface-2)]">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-sm font-extrabold text-white">{v.number}</span>
                          <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{v.title}</span><span className="text-3 text-xs">Kapitola {v.chapter}</span></span>
                          <Badge color={statusMeta(v.status).color}>{statusMeta(v.status).label}</Badge>
                          <span className="hidden text-sm font-semibold text-accent sm:block">{what} →</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="Pipeline" subtitle="Videa podle stavu">
                <HBars data={d.statuses.map((s: any) => ({ label: s.label, value: s.value, color: s.color, href: `#/videos?status=${s.key}` }))} />
              </Card>
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-3">
              <Card title="Mapa kapitol" subtitle="Které kapitoly už mají video" className="xl:col-span-2">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {d.chapters.map((c: any) => {
                    const vs = videos.filter((v) => v.chapter === c.n);
                    return (
                      <Link key={c.n} href={vs.length ? `/videos?chapter=${c.n}` : `/videos/new?chapter=${c.n}`} className="rounded-xl border border-base p-3 transition hover:border-accent" style={vs.length ? { background: "var(--surface-2)" } : undefined}>
                        <div className="flex items-center justify-between">
                          <span className="text-3 text-xs font-bold">KAP. {c.n}</span>
                          {vs.length ? <Badge color="#10B981">{vs.length}× video</Badge> : <Badge color="#FB6720">volná</Badge>}
                        </div>
                        <p className="mt-1.5 text-sm font-bold leading-snug">{c.title}</p>
                        <p className="text-3 mt-1 line-clamp-2 text-xs">{c.idea}</p>
                      </Link>
                    );
                  })}
                </div>
              </Card>
              <Card title="Připravenost" subtitle="Co aplikace potřebuje">
                <ul className="space-y-2.5">
                  {setup.map((s) => (
                    <li key={s.label}>
                      <Link href={s.href} className="flex items-center gap-3 text-sm hover:underline">
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white ${s.ok ? "bg-emerald-500" : "bg-amber-500"}`}>{s.ok ? "✓" : "!"}</span>
                        <span className={s.ok ? "" : "font-semibold"}>{s.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 border-t border-base pt-4"><ElevenQuota enabled={!!key("elevenlabs")} /></div>
              </Card>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
              <Card title="Nová videa za týden" subtitle="Posledních 8 týdnů"><BarChart data={d.weeks} kind="videos" /></Card>
              <Card title="API náklady za den" subtitle="Posledních 14 dní (USD, odhad)"><BarChart data={d.days} kind="usd" color="#26406E" /></Card>
              <Card title="Poslední rendery" pad={false}>
                {d.renders.length === 0 ? <p className="text-3 p-5 text-sm">Zatím žádný render.</p> : (
                  <ul className="divide-y divide-[var(--border)]">
                    {d.renders.map((r: any) => (
                      <li key={r.id}>
                        <Link href={`/videos/${r.video_id}?tab=render`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-[var(--surface-2)]">
                          <span className="font-bold">{r.number}</span>
                          <span className="min-w-0 flex-1 truncate">{r.title} <span className="text-3">v{r.version}</span></span>
                          <span className="text-3 text-xs tabular-nums">{r.render_seconds ? `${r.render_seconds.toFixed(0)} s` : ""}</span>
                          <RenderBadge status={r.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
            <Card title="Poslední aktivita" className="mt-6" pad={false} actions={<Link href="/activity" className="text-sm font-semibold text-accent">Vše →</Link>}>
              <ul className="divide-y divide-[var(--border)]">
                {d.activity.map((a: any) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="text-3 w-32 shrink-0 text-xs tabular-nums">{fmtDate(a.created_at)}</span>
                    <span className="font-semibold">{a.name ?? "systém"}</span>
                    <span className="text-2 min-w-0 flex-1 truncate">{actionLabel(a.action)} {a.detail ? `· ${a.detail}` : ""}</span>
                    {a.entity === "video" && a.entity_id && <Link href={`/videos/${a.entity_id}`} className="text-xs font-semibold text-accent">video →</Link>}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        );
      }}
    </Loader>
  );
}
