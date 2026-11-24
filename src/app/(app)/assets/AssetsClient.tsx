"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Field, PageHeader, Tabs, api, cx, useToast } from "@/components/ui";
import { VideoPreview, type PreviewConfig } from "@/components/Preview";
import { TEMPLATES, templateDef } from "@/lib/constants";
import { buildSpec } from "@/lib/outputs";
import { normalizeScript, type Script } from "@/lib/script";
import type { SpecCfg } from "../videos/[id]/Workspace";

type Pose = { key: string; file_name: string; usage: string; kind: string; in_script: number; processed: number; source: number; updated_at: string | null };
const KIND: Record<string, [string, string]> = { pose: ["póza ve scénáři", "#FB6720"], mouth: ["pusa", "#8B5CF6"], blink: ["mrkání", "#26406E"], unused: ["nepoužívá se", "#7C8AA5"] };
const NUMS = ["jedna", "dva", "tři", "čtyři", "pět", "šest", "sedm", "osm"];

export function AssetsClient({ poses, cover, logo, cfg, specCfg }: { poses: Pose[]; cover: string | null; logo: string | null; cfg: PreviewConfig; specCfg: SpecCfg }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"poses" | "templates" | "brand">("poses");
  const [busy, setBusy] = useState<string | null>(null);
  const [tpl, setTpl] = useState(TEMPLATES[0].key);
  const [params, setParams] = useState<Record<string, string>>({});
  const [pose, setPose] = useState<Script["scenes"][number]["pose"]>("Original");

  async function upload(url: string, f: File, key: string) {
    const fd = new FormData();
    fd.append("file", f);
    setBusy(key);
    try {
      await api(url, { form: fd });
      toast("ok", "Nahráno a zpracováno");
      router.refresh();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const def = templateDef(tpl)!;
  const spec = useMemo(() => {
    const p = def.params.map((x) => ({ key: x.key, value: params[x.key] ?? x.example }));
    const spoken = `Tohle je šablona ${def.label.toLowerCase().replace(/[^\p{L} ]/gu, "")}. ${NUMS.slice(0, Math.max(1, def.events.length)).map((n) => n.charAt(0).toUpperCase() + n.slice(1) + ".").join(" ")} A drží.`;
    const s: Script = normalizeScript({
      id: "00", title: "Ukázka", slug: "Ukazka", chapter: 1, hook_type: "scene", word_count: 0, cta: "Odkaz v bio",
      scenes: [{
        n: 1, spoken, on_screen: `${def.label.split(" ")[0]} *šablona*`, pose, return_to_neutral: false, counter: tpl === "sort_columns" ? "KROK 1/3" : null,
        graphic: "", template: tpl, params: p, events: def.events.map((a, i) => ({ action: a, word: NUMS[i] ?? NUMS[0] })), continue_from_scene: false, pose_extra: [],
      }],
      audio_parts: [{ part: 1, scenes: [1], mood: "", stability: 0.5, tagged_text: spoken }], sfx: [], caption: "", hashtags: [],
    });
    return buildSpec(s, specCfg);
  }, [tpl, params, def, specCfg, pose]);

  const uploaded = poses.filter((p) => p.kind === "pose" && p.processed).length;

  return (
    <div>
      <PageHeader title="Avatar a šablony" subtitle="Pózy se předklíčují jednou při nahrání a uloží jako PNG s průhledností" />
      <Tabs value={tab} onChange={setTab} tabs={[
        { key: "poses", label: "Pózy avatara", badge: <Badge color={uploaded === 6 ? "#10B981" : "#F59E0B"}>{uploaded}/6</Badge> },
        { key: "templates", label: "Knihovna šablon", badge: <Badge>{TEMPLATES.length}</Badge> },
        { key: "brand", label: "Obálka a logo" },
      ]} />
      <div className="pt-5">
        {tab === "poses" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base bg-[var(--surface-2)] px-4 py-3 text-sm">
              <p className="text-2">Zdroj: JPG 1536 × 2752 na čistě zeleném pozadí #00FF00, postava od pasu nahoru, hlava všude na stejném místě. Chroma key: prahy 15–70, eroze 5 px, rozmazání 1,2 px, despill. Bez nahraných póz renderer použije zástupnou vektorovou postavu.</p>
              <Button size="sm" loading={busy === "rekey"} onClick={async () => { setBusy("rekey"); try { await api("/api/poses/rekey", { method: "POST" }); toast("ok", "Pózy znovu předklíčovány"); router.refresh(); } catch (e) { toast("error", (e as Error).message); } finally { setBusy(null); } }}>Předklíčovat znovu</Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {poses.map((p) => (
                <Card key={p.key} pad={false}>
                  <div className="checker relative flex aspect-[3/4] items-end justify-center overflow-hidden rounded-t-2xl">
                    {p.processed ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/poses/${p.key}?v=${encodeURIComponent(p.updated_at ?? "")}`} alt={p.key} className="h-full w-full object-contain object-bottom" />
                    ) : (
                      <span className="text-3 m-auto text-sm">nenahráno</span>
                    )}
                    <span className="absolute left-2 top-2"><Badge color={KIND[p.kind][1]} solid>{KIND[p.kind][0]}</Badge></span>
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-bold">{p.key}</p>
                      {p.processed ? <span className="text-xs text-emerald-600">✓ předklíčováno</span> : null}
                    </div>
                    <p className="text-3 text-xs">{p.usage}</p>
                    <Field label="Soubor v projektu" hint="mapování názvu ze scénáře na soubor">
                      <input className="input h-8 py-1 text-xs" defaultValue={p.file_name} onBlur={(e) => e.target.value !== p.file_name && api(`/api/poses/${p.key}`, { method: "PATCH", body: { file_name: e.target.value } }).then(() => toast("ok", "Mapování uloženo"))} />
                    </Field>
                    <div className="flex gap-2">
                      <label className={cx("inline-flex h-8 flex-1 cursor-pointer items-center justify-center rounded-[10px] bg-accent px-3 text-[13px] font-semibold text-white", busy === p.key && "opacity-50")}>
                        {busy === p.key ? "Zpracovávám…" : p.processed ? "Nahradit" : "Nahrát"}
                        <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => e.target.files?.[0] && upload(`/api/poses/${p.key}`, e.target.files[0], p.key)} />
                      </label>
                      {p.source ? <a href={`/api/poses/${p.key}?source=1`} target="_blank" className="surface inline-flex h-8 items-center rounded-[10px] px-2 text-xs font-semibold">zdroj</a> : null}
                      {p.processed ? <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Odebrat pózu?")) { await api(`/api/poses/${p.key}`, { method: "DELETE" }); router.refresh(); } }}>✕</Button> : null}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
        {tab === "templates" && (
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {TEMPLATES.map((t) => (
                  <button key={t.key} onClick={() => { setTpl(t.key); setParams({}); }} className={cx("rounded-xl border p-3 text-left transition", tpl === t.key ? "border-accent bg-accent-50 dark:bg-transparent" : "border-base hover:border-accent")}>
                    <p className="font-bold">{t.label}</p>
                    <p className="text-3 font-mono text-xs">{t.key}</p>
                    <p className="text-2 mt-1 text-xs">{t.usage}</p>
                    <p className="text-3 mt-1 text-[11px]">události: {t.events.join(", ") || "—"}</p>
                  </button>
                ))}
              </div>
              <Card title={`Parametry — ${def.label}`} subtitle="Hraj si s hodnotami, náhled se mění živě. Ve scénáři je vyplní Claude.">
                <div className="grid gap-3 sm:grid-cols-2">
                  {def.params.map((p) => (
                    <Field key={p.key} label={`${p.label}${p.list ? " (odděl |)" : ""}`}>
                      <input className="input" value={params[p.key] ?? p.example} onChange={(e) => setParams({ ...params, [p.key]: e.target.value })} />
                    </Field>
                  ))}
                  <Field label="Póza avatara">
                    <select className="input" value={pose} onChange={(e) => setPose(e.target.value as typeof pose)}>
                      {["Original", "Point_up", "Shrug", "Arms_crossed", "Thinking", "Point_down"].map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </Field>
                </div>
                <p className="text-3 mt-3 text-xs">V ukázce zazní „jedna, dva, tři…“ — každá událost šablony je navázaná na jedno z těch slov.</p>
              </Card>
            </div>
            <div className="lg:sticky lg:top-2 lg:self-start">
              <Card title="Náhled">
                <div className="flex justify-center"><VideoPreview key={tpl} spec={spec} cfg={cfg} width={290} /></div>
              </Card>
            </div>
          </div>
        )}
        {tab === "brand" && (
          <div className="grid gap-4 md:grid-cols-2">
            {[["cover", "Obálka e-booku", "Použije se v šabloně ebook_cta místo zástupné karty.", cover], ["logo", "Logo", "Uložené jako konfigurace brandu, ne v kódu.", logo]].map(([k, label, hint, upd]) => (
              <Card key={k as string} title={label as string} subtitle={hint as string}>
                <div className="checker flex h-64 items-center justify-center rounded-xl">
                  {upd ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/assets/${k}?v=${encodeURIComponent(upd as string)}`} alt={label as string} className="max-h-60 max-w-full object-contain" />
                  ) : <span className="text-3 text-sm">nenahráno — zástupná karta</span>}
                </div>
                <div className="mt-3 flex gap-2">
                  <label className="inline-flex h-8 cursor-pointer items-center rounded-[10px] bg-accent px-3 text-[13px] font-semibold text-white">
                    {busy === k ? "Nahrávám…" : "Nahrát obrázek"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(`/api/assets/${k}`, e.target.files[0], k as string)} />
                  </label>
                  {upd ? <Button size="sm" variant="ghost" onClick={async () => { await api(`/api/assets/${k}`, { method: "DELETE" }); router.refresh(); }}>Odebrat</Button> : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
