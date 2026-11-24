"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Card, Empty, PageHeader, cx, fmtDate } from "@/components/ui";
import { HOOK_TYPES, VIDEO_STATUSES, statusMeta } from "@/lib/constants";
import { RenderBadge } from "@/components/bits";

type V = { id: number; number: string; title: string; chapter: number; hook_type: string; status: string; updated_at: string; published_at: string | null; last_version: number | null; last_status: string | null };

export function VideoList({ videos, chapters }: { videos: V[]; chapters: { n: number; title: string }[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const [view, setView] = useState<"board" | "table">("board");
  const [q, setQ] = useState("");
  const status = sp.get("status") ?? "";
  const chapter = sp.get("chapter") ?? "";
  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    router.replace(`/videos?${p.toString()}`);
  };
  const list = useMemo(
    () => videos.filter((v) => (!status || v.status === status) && (!chapter || String(v.chapter) === chapter) && (!q || `${v.number} ${v.title}`.toLowerCase().includes(q.toLowerCase()))),
    [videos, status, chapter, q],
  );
  const chTitle = (n: number) => chapters.find((c) => c.n === n)?.title ?? "";

  return (
    <div>
      <PageHeader
        title="Videa"
        subtitle="Nápad → Scénář → Schváleno → Čeká na audio → Render → Hotovo → Publikováno"
        actions={<Link href="/videos/new" className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-sm font-semibold text-white">+ Nové video</Link>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Hledat…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={status} onChange={(e) => setParam("status", e.target.value)}>
          <option value="">Všechny stavy</option>
          {VIDEO_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select className="input w-auto" value={chapter} onChange={(e) => setParam("chapter", e.target.value)}>
          <option value="">Všechny kapitoly</option>
          {chapters.map((c) => <option key={c.n} value={c.n}>{c.n}. {c.title}</option>)}
        </select>
        <div className="ml-auto flex rounded-[10px] border border-base p-0.5">
          {(["board", "table"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={cx("rounded-lg px-3 py-1.5 text-sm font-semibold", view === v ? "bg-navy-900 text-white" : "text-3")}>
              {v === "board" ? "Nástěnka" : "Tabulka"}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <Card><Empty title="Žádná videa" icon="▶">Začni tlačítkem Nové video nebo vyber téma ze zásobníku.</Empty></Card>
      ) : view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {VIDEO_STATUSES.filter((s) => !status || s.key === status).map((s) => {
            const col = list.filter((v) => v.status === s.key);
            return (
              <div key={s.key} className="w-64 shrink-0">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="text-sm font-bold">{s.label}</span>
                  <span className="text-3 text-xs">{col.length}</span>
                </div>
                <div className="space-y-2 rounded-2xl bg-[var(--surface-2)] p-2 min-h-24">
                  {col.map((v) => (
                    <Link key={v.id} href={`/videos/${v.id}`} className="surface block rounded-xl p-3 transition hover:border-accent">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-accent">#{v.number}</span>
                        {v.last_version ? <span className="text-3 text-[11px]">v{v.last_version}</span> : null}
                      </div>
                      <p className="mt-1 text-sm font-bold leading-snug">{v.title}</p>
                      <p className="text-3 mt-1 text-xs">Kap. {v.chapter} · {HOOK_TYPES.find((h) => h.key === v.hook_type)?.label}</p>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-3 text-left text-xs uppercase">
                <tr className="border-b border-base">
                  <th className="px-5 py-3">#</th><th className="px-3 py-3">Název</th><th className="px-3 py-3">Kapitola</th><th className="px-3 py-3">Hook</th><th className="px-3 py-3">Stav</th><th className="px-3 py-3">Render</th><th className="px-3 py-3">Upraveno</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {list.map((v) => (
                  <tr key={v.id} className="hover:bg-[var(--surface-2)]">
                    <td className="px-5 py-3 font-extrabold text-accent"><Link href={`/videos/${v.id}`}>{v.number}</Link></td>
                    <td className="px-3 py-3 font-semibold"><Link href={`/videos/${v.id}`}>{v.title}</Link></td>
                    <td className="text-2 px-3 py-3">{v.chapter}. {chTitle(v.chapter)}</td>
                    <td className="text-2 px-3 py-3">{HOOK_TYPES.find((h) => h.key === v.hook_type)?.label}</td>
                    <td className="px-3 py-3"><Badge color={statusMeta(v.status).color}>{statusMeta(v.status).label}</Badge></td>
                    <td className="px-3 py-3">{v.last_status ? <span className="flex items-center gap-1.5"><span className="text-3 text-xs">v{v.last_version}</span><RenderBadge status={v.last_status} /></span> : <span className="text-3">—</span>}</td>
                    <td className="text-3 px-3 py-3 text-xs">{fmtDate(v.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
