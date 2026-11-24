import { requireUser } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { Card, PageHeader, Stat } from "@/components/ui";
import { actionLabel } from "@/components/bits";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  await requireUser();
  const rows = all<{ id: number; action: string; detail: string | null; created_at: string; name: string | null; entity: string | null; entity_id: number | null }>(
    "SELECT a.id, a.action, a.detail, a.created_at, u.name, a.entity, a.entity_id FROM activity a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200",
  );
  const byModel = all<{ provider: string; model: string; task: string; n: number; inp: number; outp: number; chars: number; cost: number; fails: number }>(
    "SELECT provider, model, task, COUNT(*) n, SUM(input_tokens) inp, SUM(output_tokens) outp, SUM(characters) chars, SUM(cost_usd) cost, SUM(1 - ok) fails FROM api_usage WHERE created_at >= datetime('now','-30 days') GROUP BY provider, model, task ORDER BY cost DESC",
  );
  const tot = one<{ c: number; n: number }>("SELECT COALESCE(SUM(cost_usd),0) c, COUNT(*) n FROM api_usage WHERE created_at >= datetime('now','-30 days')")!;
  const all_ = one<{ c: number }>("SELECT COALESCE(SUM(cost_usd),0) c FROM api_usage")!;
  const chars = one<{ c: number }>("SELECT COALESCE(SUM(characters),0) c FROM api_usage WHERE provider = 'elevenlabs' AND task = 'tts' AND created_at >= datetime('now','-30 days')")!;
  const renders = one<{ n: number; s: number | null }>("SELECT COUNT(*) n, SUM(render_seconds) s FROM renders WHERE created_at >= datetime('now','-30 days')")!;
  const fmt = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div>
      <PageHeader title="Aktivita a náklady" subtitle="Co se v aplikaci dělo a kolik stála API volání (odhad podle ceníku)" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Náklady 30 dní" value={`$${tot.c.toFixed(2)}`} sub={`${tot.n} volání API`} accent />
        <Stat label="Náklady celkem" value={`$${all_.c.toFixed(2)}`} />
        <Stat label="ElevenLabs znaků (30 d)" value={chars.c.toLocaleString("cs-CZ")} sub="generování hlasu" />
        <Stat label="Rendery (30 d)" value={renders.n} sub={renders.s ? `${(renders.s / 60).toFixed(1)} min CPU` : ""} />
      </div>
      <Card title="Využití API za 30 dní" className="mt-6" pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-3 text-left text-xs uppercase"><tr className="border-b border-base"><th className="px-5 py-2.5">Poskytovatel</th><th className="px-3">Model</th><th className="px-3">Úloha</th><th className="px-3 text-right">Volání</th><th className="px-3 text-right">Tokeny in/out</th><th className="px-3 text-right">Znaky</th><th className="px-5 text-right">Cena</th></tr></thead>
            <tbody className="divide-y divide-[var(--border)]">
              {byModel.length === 0 && <tr><td colSpan={7} className="text-3 px-5 py-4">Zatím žádná volání.</td></tr>}
              {byModel.map((r, i) => (
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
          {rows.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <span className="text-3 w-28 shrink-0 text-xs tabular-nums">{fmt(a.created_at)}</span>
              <span className="w-28 shrink-0 truncate font-semibold">{a.name ?? "systém"}</span>
              <span className="text-2 min-w-0 flex-1 truncate">{actionLabel(a.action)}{a.detail ? ` · ${a.detail}` : ""}</span>
              {a.entity === "video" && a.entity_id ? <Link href={`/videos/${a.entity_id}`} className="text-xs font-semibold text-accent">video →</Link> : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
