"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, Field, PageHeader, api, fmtDate, useToast } from "@/components/ui";

type Ch = { n: number; title: string; idea: string; body: string };

export function LibraryClient({ chapters, usage, ebook }: { chapters: Ch[]; usage: { chapter: number; number: string; title: string; id: number }[]; ebook: { original_name: string; size: number; updated_at: string } | null }) {
  const toast = useToast();
  const router = useRouter();
  const [edit, setEdit] = useState<Ch | null>(null);
  const [busy, setBusy] = useState(false);

  async function uploadPdf(f: File) {
    const fd = new FormData();
    fd.append("file", f);
    setBusy(true);
    try {
      await api("/api/assets/ebook_pdf", { form: fd });
      toast("ok", "E-book nahrán — Claude ho bude číst při psaní scénářů");
      router.refresh();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Knihovna obsahu" subtitle="Veškerý obsah scénářů se bere z e-booku a pravidel. Kapitoly = zásobník témat." />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {chapters.map((c) => {
            const vs = usage.filter((u) => u.chapter === c.n);
            return (
              <Card key={c.n} pad={false}>
                <div className="flex flex-wrap items-start gap-4 p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-lg font-extrabold text-white">{c.n}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-extrabold">{c.title}</p>
                    <p className="text-2 text-sm">{c.idea}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {vs.length ? vs.map((v) => <Link key={v.id} href={`/videos/${v.id}`}><Badge color="#10B981">Video {v.number} · {v.title}</Badge></Link>) : <Badge color="#FB6720">zatím bez videa</Badge>}
                      {c.body ? <Badge color="#26406E">text kapitoly: {c.body.length} znaků</Badge> : null}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setEdit(c)}>Upravit</Button>
                    <Link href={`/videos/new?chapter=${c.n}`} className="inline-flex h-8 items-center rounded-[10px] bg-accent px-3 text-[13px] font-semibold text-white">+ Video</Link>
                  </div>
                </div>
                {edit?.n === c.n && (
                  <div className="space-y-3 border-t border-base p-5">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Název"><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
                      <Field label="Nosná myšlenka"><input className="input" value={edit.idea} onChange={(e) => setEdit({ ...edit, idea: e.target.value })} /></Field>
                    </div>
                    <Field label="Text kapitoly (volitelné)" hint="Když nenahráváš PDF, vlož sem text kapitoly — Claude z něj vychází.">
                      <textarea className="input" rows={8} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
                    </Field>
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => setEdit(null)}>Zrušit</Button>
                      <Button variant="primary" onClick={async () => { await api(`/api/chapters/${c.n}`, { method: "PUT", body: edit }); setEdit(null); toast("ok", "Uloženo"); router.refresh(); }}>Uložit</Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
        <div className="space-y-4">
          <Card title="E-book (PDF)" subtitle="28 stran, 8 kapitol — přikládá se k promptům">
            {ebook ? (
              <div className="space-y-2 text-sm">
                <p className="font-semibold">{ebook.original_name}</p>
                <p className="text-3 text-xs">{(ebook.size / 1e6).toFixed(1)} MB · {fmtDate(ebook.updated_at)}</p>
                <div className="flex gap-2">
                  <a href="/api/assets/ebook_pdf" target="_blank" className="surface inline-flex h-8 items-center rounded-[10px] px-3 text-[13px] font-semibold">Otevřít</a>
                  <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Odebrat PDF?")) { await api("/api/assets/ebook_pdf", { method: "DELETE" }); router.refresh(); } }}>Odebrat</Button>
                </div>
              </div>
            ) : (
              <p className="text-3 text-sm">Zatím nenahráno.</p>
            )}
            <label className="mt-4 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-base p-5 text-center text-sm hover:border-accent">
              <span className="font-semibold">{busy ? "Nahrávám…" : ebook ? "Nahrát novou verzi" : "Nahrát PDF e-booku"}</span>
              <span className="text-3 text-xs">max 32 MB</span>
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && uploadPdf(e.target.files[0])} />
            </label>
          </Card>
          <Card title="Pravidla obsahu">
            <p className="text-2 text-sm">Tón, zakázané věci, rozsah slov a scén, tempo hlasu a výslovnost.</p>
            <Link href="/settings?tab=content" className="mt-2 inline-block text-sm font-semibold text-accent">Upravit v Nastavení →</Link>
          </Card>
          <Card title="Brand a CTA">
            <p className="text-2 text-sm">Barvy, písmo, claim, CTA „Odkaz v bio“, cena, odkaz a klíčové slovo.</p>
            <Link href="/settings?tab=brand" className="mt-2 inline-block text-sm font-semibold text-accent">Upravit v Nastavení →</Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
