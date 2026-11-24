"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Empty, Field, PageHeader, api, useToast } from "@/components/ui";
import { HOOK_TYPES } from "@/lib/constants";

type T = { id: number; chapter: number; hook_type: string; title: string; angle: string; hook_line: string; status: string; video_id: number | null; video_number: string | null; created_at: string };

export function TopicsClient({ chapters, hasKey }: { chapters: { n: number; title: string }[]; hasKey: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [topics, setTopics] = useState<T[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [gen, setGen] = useState({ count: 10, chapter: "", hook_type: "", custom: "" });
  const [manual, setManual] = useState({ title: "", chapter: 1, hook_type: "scene", angle: "", hook_line: "" });
  const [fCh, setFCh] = useState("");
  const load = () => api<{ topics: T[] }>("/api/topics").then((r) => setTopics(r.topics));
  useEffect(() => {
    load();
  }, []);

  const backlog = topics.filter((t) => t.status === "backlog" && (!fCh || String(t.chapter) === fCh));
  const used = topics.filter((t) => t.status === "used");
  const byChapter = chapters.map((c) => ({ ...c, count: topics.filter((t) => t.status === "backlog" && t.chapter === c.n).length }));

  return (
    <div>
      <PageHeader title="Zásobník témat" subtitle="Hromadně vygenerovaná témata do zásoby — z každého jedno video" />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setFCh("")} className={`rounded-full px-3 py-1 text-sm font-semibold ${!fCh ? "bg-navy-900 text-white" : "surface"}`}>Vše ({topics.filter((t) => t.status === "backlog").length})</button>
            {byChapter.map((c) => (
              <button key={c.n} onClick={() => setFCh(String(c.n))} className={`rounded-full px-3 py-1 text-sm font-semibold ${fCh === String(c.n) ? "bg-navy-900 text-white" : "surface"}`}>{c.n}. {c.title} ({c.count})</button>
            ))}
          </div>
          {backlog.length === 0 ? (
            <Card><Empty title="Zásobník je prázdný" icon="☰">Vygeneruj 10 témat najednou vpravo, nebo přidej vlastní.</Empty></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {backlog.map((t) => (
                <div key={t.id} className="surface flex flex-col rounded-2xl p-4">
                  <div className="flex items-center gap-2">
                    <Badge color="#26406E">Kap. {t.chapter}</Badge>
                    <Badge color="#FB6720">{HOOK_TYPES.find((h) => h.key === t.hook_type)?.label}</Badge>
                    <button className="text-3 ml-auto text-sm hover:text-red-600" title="Smazat" onClick={async () => { await api(`/api/topics/${t.id}`, { method: "DELETE" }); load(); }}>✕</button>
                  </div>
                  <p className="mt-2 font-extrabold">{t.title}</p>
                  {t.hook_line && <p className="mt-1 text-sm italic">„{t.hook_line}“</p>}
                  <p className="text-2 mt-1 flex-1 text-sm">{t.angle}</p>
                  <Button size="sm" variant="primary" className="mt-3" loading={busy === `v${t.id}`} onClick={async () => {
                    setBusy(`v${t.id}`);
                    try {
                      const r = await api<{ id: number; warning?: string }>("/api/videos", { body: { topic_id: t.id, generate: hasKey } });
                      if (r.warning) toast("error", r.warning);
                      router.push(`/videos/${r.id}?tab=script`);
                    } catch (e) {
                      toast("error", (e as Error).message);
                      setBusy(null);
                    }
                  }}>Vytvořit video{hasKey ? " + scénář" : ""}</Button>
                </div>
              ))}
            </div>
          )}
          {used.length > 0 && (
            <Card title="Použitá témata" pad={false}>
              <ul className="divide-y divide-[var(--border)] text-sm">
                {used.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="text-3 text-xs">Kap. {t.chapter}</span>
                    <span className="flex-1">{t.title}</span>
                    {t.video_id && <Link href={`/videos/${t.video_id}`} className="text-xs font-semibold text-accent">video {t.video_number} →</Link>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card title="Generovat do zásoby">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Počet"><input type="number" min={1} max={15} className="input" value={gen.count} onChange={(e) => setGen({ ...gen, count: Number(e.target.value) })} /></Field>
                <Field label="Kapitola">
                  <select className="input" value={gen.chapter} onChange={(e) => setGen({ ...gen, chapter: e.target.value })}>
                    <option value="">mix</option>
                    {chapters.map((c) => <option key={c.n} value={c.n}>{c.n}. {c.title}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Typ hooku">
                <select className="input" value={gen.hook_type} onChange={(e) => setGen({ ...gen, hook_type: e.target.value })}>
                  <option value="">střídat</option>
                  {HOOK_TYPES.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
                </select>
              </Field>
              <Field label="Zadání (volitelné)"><textarea className="input" rows={2} value={gen.custom} onChange={(e) => setGen({ ...gen, custom: e.target.value })} placeholder="např. série k zkouškovému" /></Field>
              <Button variant="primary" className="w-full" disabled={!hasKey} loading={busy === "gen"} onClick={async () => {
                setBusy("gen");
                try {
                  const r = await api<{ topics: unknown[] }>("/api/topics/generate", { body: { count: gen.count, chapter: gen.chapter ? Number(gen.chapter) : null, hook_type: gen.hook_type || null, custom: gen.custom, save: true } });
                  toast("ok", `Přidáno ${r.topics.length} témat`);
                  load();
                } catch (e) {
                  toast("error", (e as Error).message);
                } finally {
                  setBusy(null);
                }
              }}>Vygenerovat {gen.count} témat</Button>
              {!hasKey && <p className="text-3 text-xs">Potřebuje klíč Anthropic.</p>}
            </div>
          </Card>
          <Card title="Přidat ručně">
            <form className="space-y-3" onSubmit={async (e) => {
              e.preventDefault();
              await api("/api/topics", { body: { topics: [manual] } });
              setManual({ ...manual, title: "", angle: "", hook_line: "" });
              load();
            }}>
              <Field label="Název"><input className="input" required value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <select className="input" value={manual.chapter} onChange={(e) => setManual({ ...manual, chapter: Number(e.target.value) })}>
                  {chapters.map((c) => <option key={c.n} value={c.n}>Kap. {c.n}</option>)}
                </select>
                <select className="input" value={manual.hook_type} onChange={(e) => setManual({ ...manual, hook_type: e.target.value })}>
                  {HOOK_TYPES.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
                </select>
              </div>
              <Field label="Úhel / tip"><input className="input" value={manual.angle} onChange={(e) => setManual({ ...manual, angle: e.target.value })} /></Field>
              <Field label="První věta hooku"><input className="input" value={manual.hook_line} onChange={(e) => setManual({ ...manual, hook_line: e.target.value })} /></Field>
              <Button type="submit" className="w-full">Přidat</Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
