import Link from "next/link";
import { all, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { VIDEO_STATUSES, statusMeta } from "@/lib/constants";
import { keyStatus } from "@/lib/keys";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { BarChart, HBars } from "@/components/charts";
import { getSettings } from "@/lib/settings";
import { ffmpegVersion } from "@/lib/audio";
import { queueState } from "@/lib/pipeline";
import { ElevenQuota } from "./ElevenQuota";
import { RenderBadge, actionLabel } from "@/components/bits";

export const dynamic = "force-dynamic";

type V = { id: number; number: string; title: string; status: string; chapter: number; updated_at: string; hook_type: string };

export default async function Dashboard() {
  const user = await requireUser();
  const videos = all<V>("SELECT id, number, title, status, chapter, updated_at, hook_type FROM videos ORDER BY CAST(number AS INTEGER) DESC");
  const chapters = all<{ n: number; title: string; idea: string }>("SELECT n, title, idea FROM chapters ORDER BY n");
  const byStatus = VIDEO_STATUSES.map((s) => ({ ...s, value: videos.filter((v) => v.status === s.key).length }));
  const inProd = videos.filter((v) => !["done", "published"].includes(v.status)).length;
  const finished = videos.filter((v) => ["done", "published"].includes(v.status)).length;
  const topics = one<{ c: number }>("SELECT COUNT(*) c FROM topics WHERE status = 'backlog'")!.c;
  const renders = all<{ id: number; video_id: number; version: number; status: string; render_seconds: number | null; created_at: string; number: string; title: string; duration_s: number | null }>(
    "SELECT r.id, r.video_id, r.version, r.status, r.render_seconds, r.created_at, r.duration_s, v.number, v.title FROM renders r JOIN videos v ON v.id = r.video_id ORDER BY r.id DESC LIMIT 6",
  );
  const avgRender = one<{ a: number | null }>("SELECT AVG(render_seconds) a FROM renders WHERE status IN ('done','qa_failed')")!.a;
  const cost30 = one<{ c: number }>("SELECT COALESCE(SUM(cost_usd),0) c FROM api_usage WHERE created_at >= datetime('now','-30 days')")!.c;
  const costByDay = all<{ d: string; c: number }>("SELECT date(created_at) d, SUM(cost_usd) c FROM api_usage WHERE created_at >= date('now','-13 days') GROUP BY d");
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400_000).toISOString().slice(0, 10);
    return { label: `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}.`, value: costByDay.find((x) => x.d === d)?.c ?? 0 };
  });
  const weekly = all<{ w: string; c: number }>("SELECT strftime('%Y-%W', created_at) w, COUNT(*) c FROM videos WHERE created_at >= date('now','-56 days') GROUP BY w");
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(Date.now() - (7 - i) * 7 * 86400_000);
    const w = one<{ w: string }>("SELECT strftime('%Y-%W', ?) w", d.toISOString())!.w;
    return { label: `T${w.slice(5)}`, value: weekly.find((x) => x.w === w)?.c ?? 0 };
  });
  const activity = all<{ id: number; action: string; detail: string | null; created_at: string; name: string | null; entity: string | null; entity_id: number | null }>(
    "SELECT a.id, a.action, a.detail, a.created_at, u.name, a.entity, a.entity_id FROM activity a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 8",
  );
  const keys = keyStatus();
  const ff = await ffmpegVersion();
  const q = queueState();
  const poses = one<{ c: number }>("SELECT COUNT(*) c FROM poses WHERE kind = 'pose' AND processed_file IS NOT NULL")!.c;
  const ebook = one("SELECT 1 FROM assets WHERE key = 'ebook_pdf'");
  const brand = getSettings("brand");

  const todo = [
    ...videos.filter((v) => v.status === "idea").map((v) => ({ v, what: "Vygeneruj scénář", tab: "script" })),
    ...videos.filter((v) => v.status === "script").map((v) => ({ v, what: "Schval scénář", tab: "script" })),
    ...videos.filter((v) => ["approved", "awaiting_audio"].includes(v.status)).map((v) => ({ v, what: "Nahraj audio z ElevenLabs", tab: "audio" })),
    ...videos.filter((v) => v.status === "render").map((v) => ({ v, what: "Spusť render a zkontroluj video", tab: "render" })),
    ...videos.filter((v) => v.status === "done").map((v) => ({ v, what: "Publikuj na Reels a TikTok", tab: "export" })),
  ].slice(0, 8);

  const setup = [
    { ok: keys.find((k) => k.provider === "anthropic")?.configured, label: "API klíč Anthropic", href: "/settings?tab=keys" },
    { ok: keys.find((k) => k.provider === "elevenlabs")?.configured, label: "API klíč ElevenLabs (volitelné)", href: "/settings?tab=keys" },
    { ok: !!ebook, label: "PDF e-booku v knihovně", href: "/library" },
    { ok: poses >= 6, label: `Pózy avatara (${poses}/6)`, href: "/assets" },
    { ok: !!ff, label: ff ? "ffmpeg připraven" : "ffmpeg chybí na serveru", href: "/settings?tab=system" },
  ];
  const hour = new Date().getHours();

  return (
    <div>
      <PageHeader
        title={`${hour < 10 ? "Dobré ráno" : hour < 18 ? "Ahoj" : "Dobrý večer"}, ${user.name}`}
        subtitle={`${brand.name} · ${brand.platforms.join(" + ")} · 1080 × 1920`}
        actions={
          <>
            <Link href="/topics" className="surface inline-flex h-10 items-center rounded-[10px] px-4 text-sm font-semibold">Zásobník témat</Link>
            <Link href="/videos/new" className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-600">+ Nové video</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Videí celkem" value={videos.length} sub={`${finished} hotových`} />
        <Stat label="Ve výrobě" value={inProd} sub={q.running ? "render právě běží" : "render nečinný"} accent={inProd > 0} />
        <Stat label="Publikováno" value={byStatus.find((s) => s.key === "published")!.value} />
        <Stat label="Témat v zásobě" value={topics} sub={topics < 5 ? "doplň zásobu" : "dost na pár týdnů"} />
        <Stat label="Průměrný render" value={avgRender ? `${avgRender.toFixed(0)} s` : "—"} sub="na 2 CPU ~1 min" />
        <Stat label="API náklady 30 dní" value={`$${cost30.toFixed(2)}`} sub="odhad z tokenů a znaků" />
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
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{v.title}</span>
                      <span className="text-3 text-xs">Kapitola {v.chapter}</span>
                    </span>
                    <Badge color={statusMeta(v.status).color}>{statusMeta(v.status).label}</Badge>
                    <span className="hidden text-sm font-semibold text-accent sm:block">{what} →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Pipeline" subtitle="Videa podle stavu">
          <HBars data={byStatus.map((s) => ({ label: s.label, value: s.value, color: s.color, href: `/videos?status=${s.key}` }))} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Mapa kapitol" subtitle="Které kapitoly už mají video — každé video = jedna kapitola, jeden tip" className="xl:col-span-2">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {chapters.map((c) => {
              const vs = videos.filter((v) => v.chapter === c.n);
              return (
                <Link
                  key={c.n}
                  href={vs.length ? `/videos?chapter=${c.n}` : `/videos/new?chapter=${c.n}`}
                  className="rounded-xl border border-base p-3 transition hover:border-accent"
                  style={vs.length ? { background: "var(--surface-2)" } : undefined}
                >
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
          <div className="mt-5 border-t border-base pt-4">
            <ElevenQuota enabled={!!keys.find((k) => k.provider === "elevenlabs")?.configured} />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card title="Nová videa za týden" subtitle="Posledních 8 týdnů">
          <BarChart data={weeks} kind="videos" />
        </Card>
        <Card title="API náklady za den" subtitle="Posledních 14 dní (USD, odhad)">
          <BarChart data={days} kind="usd" color="#26406E" />
        </Card>
        <Card title="Poslední rendery" pad={false}>
          {renders.length === 0 ? (
            <p className="text-3 p-5 text-sm">Zatím žádný render.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {renders.map((r) => (
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
        {activity.length === 0 ? (
          <p className="text-3 p-5 text-sm">Zatím nic.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="text-3 w-32 shrink-0 text-xs tabular-nums">{new Date(a.created_at.replace(" ", "T") + "Z").toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="font-semibold">{a.name ?? "systém"}</span>
                <span className="text-2 min-w-0 flex-1 truncate">{actionLabel(a.action)} {a.detail ? `· ${a.detail}` : ""}</span>
                {a.entity === "video" && a.entity_id && <Link href={`/videos/${a.entity_id}`} className="text-xs font-semibold text-accent">video →</Link>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

