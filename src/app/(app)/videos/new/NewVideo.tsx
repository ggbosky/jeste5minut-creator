"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, Field, PageHeader, Tabs, api, cx, useToast } from "@/components/ui";
import { HOOK_TYPES } from "@/lib/constants";

type Topic = { id?: number; chapter: number; hook_type: string; title: string; angle: string; hook_line: string };

export function NewVideo({ chapters, backlog, hasKey }: { chapters: { n: number; title: string; idea: string; used: number }[]; backlog: Topic[]; hasKey: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const sp = useSearchParams();
  const [tab, setTab] = useState<"ai" | "own" | "backlog">(backlog.length && !sp.get("chapter") ? "backlog" : "ai");
  const [chapter, setChapter] = useState<string>(sp.get("chapter") ?? "");
  const [hook, setHook] = useState("");
  const [custom, setCustom] = useState("");
  const [proposals, setProposals] = useState<Topic[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [own, setOwn] = useState({ title: "", chapter: Number(sp.get("chapter") ?? 1), hook_type: "scene", angle: "" });
  const [autoGen, setAutoGen] = useState(hasKey);

  async function propose(count: number, save = false) {
    setBusy(save ? "bulk" : "propose");
    try {
      const r = await api<{ topics: Topic[] }>("/api/topics/generate", { body: { count, chapter: chapter ? Number(chapter) : null, hook_type: hook || null, custom, save } });
      if (save) {
        toast("ok", `${r.topics.length} témat uloženo do zásobníku`);
        router.push("/topics");
      } else setProposals(r.topics);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function create(t: { title: string; chapter: number; hook_type: string; angle: string; topic_id?: number }, sample = false) {
    setBusy(sample ? "sample" : t.title);
    try {
      const r = await api<{ id: number; warning?: string }>("/api/videos", { body: { ...t, generate: autoGen && !sample, sample } });
      if (r.warning) toast("error", `Video vytvořeno, ale scénář se nevygeneroval: ${r.warning}`);
      router.push(`/videos/${r.id}?tab=script`);
    } catch (e) {
      toast("error", (e as Error).message);
      setBusy(null);
    }
  }

  const TopicCard = ({ t }: { t: Topic }) => (
    <div className="surface flex flex-col rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <Badge color="#26406E">Kap. {t.chapter}</Badge>
        <Badge color="#FB6720">{HOOK_TYPES.find((h) => h.key === t.hook_type)?.label}</Badge>
      </div>
      <p className="mt-2 text-lg font-extrabold leading-snug">{t.title}</p>
      {t.hook_line && <p className="mt-1 text-sm italic">„{t.hook_line}“</p>}
      <p className="text-2 mt-1 flex-1 text-sm">{t.angle}</p>
      <Button variant="primary" className="mt-4" loading={busy === t.title} disabled={!!busy && busy !== t.title}
        onClick={() => create({ title: t.title, chapter: t.chapter, hook_type: t.hook_type, angle: [t.angle, t.hook_line && `Hook: „${t.hook_line}“`].filter(Boolean).join(" "), topic_id: t.id })}>
        Vybrat{autoGen ? " a napsat scénář" : ""}
      </Button>
    </div>
  );

  return (
    <div>
      <PageHeader title="Nové video" subtitle="Krok 1 — téma. Aplikace navrhne nepoužitou kapitolu a typ hooku, ty vybereš." />
      {!hasKey && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Bez API klíče Anthropic můžeš zadat téma ručně a scénář napsat v editoru, nebo vyzkoušet <button className="font-bold underline" onClick={() => create({ title: "Pět minut stačí", chapter: 2, hook_type: "myth", angle: "" }, true)}>ukázkový scénář</button>.{" "}
          <Link href="/settings?tab=keys" className="font-bold underline">Přidat klíč →</Link>
        </div>
      )}
      <Card pad={false}>
        <div className="px-5 pt-2">
          <Tabs value={tab} onChange={setTab} tabs={[
            { key: "ai", label: "Návrhy od AI" },
            { key: "backlog", label: "Ze zásobníku", badge: <Badge>{backlog.length}</Badge> },
            { key: "own", label: "Vlastní téma" },
          ]} />
        </div>
        <div className="p-5">
          {tab === "ai" && (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-[200px_200px_1fr]">
                <Field label="Kapitola">
                  <select className="input" value={chapter} onChange={(e) => setChapter(e.target.value)}>
                    <option value="">Nepoužité přednostně</option>
                    {chapters.map((c) => <option key={c.n} value={c.n}>{c.n}. {c.title}{c.used ? ` (${c.used}×)` : ""}</option>)}
                  </select>
                </Field>
                <Field label="Typ hooku">
                  <select className="input" value={hook} onChange={(e) => setHook(e.target.value)}>
                    <option value="">Střídat</option>
                    {HOOK_TYPES.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
                  </select>
                </Field>
                <Field label="Vlastní zadání (volitelné)">
                  <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="např. téma na začátek zkouškového, víc humoru…" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" loading={busy === "propose"} disabled={!hasKey || !!busy} onClick={() => propose(4)}>Navrhnout 4 témata</Button>
                <Button loading={busy === "bulk"} disabled={!hasKey || !!busy} onClick={() => propose(10, true)}>Hromadně 10 témat do zásoby</Button>
              </div>
              {proposals.length > 0 && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{proposals.map((t, i) => <TopicCard key={i} t={t} />)}</div>}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {chapters.map((c) => (
                  <button key={c.n} onClick={() => setChapter(String(c.n))} className={cx("rounded-xl border p-3 text-left text-sm transition", chapter === String(c.n) ? "border-accent bg-accent-50 dark:bg-transparent" : "border-base hover:border-accent")}>
                    <span className="text-3 text-xs font-bold">KAP. {c.n} {c.used ? `· ${c.used}× použito` : "· volná"}</span>
                    <span className="mt-0.5 block font-bold">{c.title}</span>
                    <span className="text-3 block text-xs">{c.idea}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab === "backlog" && (backlog.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{backlog.map((t) => <TopicCard key={t.id} t={t} />)}</div>
          ) : (
            <p className="text-2 text-sm">Zásobník je prázdný. <button className="font-semibold text-accent" onClick={() => setTab("ai")}>Vygeneruj témata →</button></p>
          ))}
          {tab === "own" && (
            <form className="grid max-w-2xl gap-4" onSubmit={(e) => { e.preventDefault(); create(own); }}>
              <Field label="Název / téma"><input className="input" required value={own.title} onChange={(e) => setOwn({ ...own, title: e.target.value })} placeholder="např. Mobil za dveře" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Kapitola">
                  <select className="input" value={own.chapter} onChange={(e) => setOwn({ ...own, chapter: Number(e.target.value) })}>
                    {chapters.map((c) => <option key={c.n} value={c.n}>{c.n}. {c.title}</option>)}
                  </select>
                </Field>
                <Field label="Typ hooku">
                  <select className="input" value={own.hook_type} onChange={(e) => setOwn({ ...own, hook_type: e.target.value })}>
                    {HOOK_TYPES.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Úhel / tip / hook" hint="Co má video divákovi dát. Můžeš napsat i první větu hooku.">
                <textarea className="input" rows={3} value={own.angle} onChange={(e) => setOwn({ ...own, angle: e.target.value })} />
              </Field>
              <div><Button variant="primary" type="submit" loading={busy === own.title}>Vytvořit video{autoGen ? " a napsat scénář" : ""}</Button></div>
            </form>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-base px-5 py-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoGen} disabled={!hasKey} onChange={(e) => setAutoGen(e.target.checked)} />
            Po výběru rovnou napsat scénář (Claude)
          </label>
          <span className="text-3 text-xs">Scénář jde vždy upravit v editoru.</span>
        </div>
      </Card>
    </div>
  );
}
