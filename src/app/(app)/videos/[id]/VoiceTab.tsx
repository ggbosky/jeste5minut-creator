"use client";
import { API } from "@/lib/nav";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, Empty, api, useCopy, useToast } from "@/components/ui";
import { ELEVEN_MODELS } from "@/lib/constants";
import { partTextFor } from "@/lib/outputs";
import { words } from "@/lib/script";
import type { Ctx } from "./Workspace";

export function VoiceTab({ ctx }: { ctx: Ctx }) {
  const { data, profiles } = ctx;
  const copy = useCopy();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const s = data.script;
  const profile = profiles.find((p) => p.id === data.video.voice_profile_id) ?? profiles[0] ?? null;
  if (!s) return <Card><Empty title="Nejdřív scénář">Setup pro ElevenLabs vznikne ze schváleného scénáře.</Empty></Card>;
  const model = ELEVEN_MODELS.find((m) => m.id === profile?.model_id);
  const dict = ctx.rules.pronunciation;

  const setProfile = async (id: number) => {
    await api(`${API}/videos/${data.video.id}`, { method: "PATCH", body: { voice_profile_id: id } });
    await ctx.reload();
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {!data.video.script_locked && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Scénář ještě není schválený. Hlas nahrávej až po schválení — každá změna textu znamená nové audio.
          </div>
        )}
        {s.audio_parts.map((p) => {
          const text = partTextFor(profile, p.tagged_text, dict);
          const spoken = p.scenes.map((n) => s.scenes.find((x) => x.n === n)?.spoken ?? "").join(" ");
          const sec = words(spoken).length / ctx.rules.words_per_second;
          return (
            <Card
              key={p.part}
              title={<span>cast{p.part}.mp3 <span className="text-3 font-medium">· scény {p.scenes.join(", ")}</span></span>}
              subtitle={`Nálada: ${p.mood || "—"} · ~${sec.toFixed(1)} s`}
              actions={
                <>
                  <Badge color="#26406E">Stability {Math.round((profile?.use_tags ? p.stability : profile?.stability ?? p.stability) * 100)} %</Badge>
                  <Button size="sm" variant="primary" onClick={() => copy(text, `Text části ${p.part} zkopírován`)}>Kopírovat</Button>
                </>
              }
            >
              <pre className="whitespace-pre-wrap rounded-xl bg-[var(--surface-2)] p-4 font-sans text-[15px] leading-relaxed">
                {text.split(/(\[[^\]]+\])/).map((part, k) => (part.startsWith("[") ? <span key={k} className="font-semibold text-accent">{part}</span> : <span key={k}>{part}</span>))}
              </pre>
              <p className="text-3 mt-2 text-xs">Vygeneruj 2–3× a vyber nejlepší verzi. Ulož jako <b>cast{p.part}.mp3</b>.</p>
            </Card>
          );
        })}
        <Card title="Popisek a hashtagy">
          <p className="font-semibold">{s.caption}</p>
          <p className="text-2 mt-1 text-sm">{s.hashtags.join(" ")}</p>
          <Button size="sm" className="mt-3" onClick={() => copy(`${s.caption}\n\n${s.hashtags.join(" ")}`)}>Kopírovat</Button>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Hlas" subtitle="Profil z Nastavení → Hlasy">
          <select className="input" value={profile?.id ?? ""} onChange={(e) => setProfile(Number(e.target.value))} disabled={!ctx.canEdit}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_default ? " (výchozí)" : ""}</option>)}
          </select>
          {profile && (
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-3">Model</dt><dd className="font-semibold">{model?.label ?? profile.model_id}</dd>
              <dt className="text-3">Hlas</dt><dd className="font-semibold">{profile.voice_name || "—"}</dd>
              <dt className="text-3">Similarity</dt><dd className="font-semibold">{Math.round(profile.similarity * 100)} %</dd>
              {profile.use_tags ? (
                <><dt className="text-3">Stability</dt><dd className="font-semibold">po částech ({Math.round(profile.stability_emotion * 100)}/{Math.round(profile.stability_normal * 100)}/{Math.round(profile.stability_tips * 100)} %)</dd></>
              ) : (
                <>
                  <dt className="text-3">Stability</dt><dd className="font-semibold">{Math.round(profile.stability * 100)} %</dd>
                  <dt className="text-3">Style</dt><dd className="font-semibold">{Math.round(profile.style * 100)} %</dd>
                  <dt className="text-3">Speed</dt><dd className="font-semibold">{profile.speed.toFixed(2)}</dd>
                </>
              )}
              <dt className="text-3">Audio tagy</dt><dd className="font-semibold">{profile.use_tags ? "ano" : "ne (odstraněny)"}</dd>
            </dl>
          )}
          {profile?.notes && <p className="text-3 mt-3 text-xs">{profile.notes}</p>}
          <p className="text-3 mt-3 text-xs">Hlas: rodilý český, mladší, kamarádský.</p>
          {dict.length > 0 && <p className="text-3 mt-1 text-xs">Výslovnost (už v textu): {dict.map((d) => `${d.from} → ${d.to}`).join(", ")}</p>}
          <Link href="/settings?tab=voices" className="mt-3 inline-block text-sm font-semibold text-accent">Upravit profily →</Link>
        </Card>
        <Card title="Soubory ke stažení" subtitle="Vždy dva oddělené výstupy">
          <div className="space-y-2">
            <a className="surface flex items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:border-accent" href={`${API}/videos/${data.video.id}/files/elevenlabs`}>
              <span><b>ElevenLabs.md</b><span className="text-3 block text-xs">pro tebe — hlas, části, tagy, popisek</span></span>↓
            </a>
            <a className="surface flex items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:border-accent" href={`${API}/videos/${data.video.id}/files/strih`}>
              <span><b>Strih.md</b><span className="text-3 block text-xs">pro renderer — bez nastavení ElevenLabs</span></span>↓
            </a>
          </div>
        </Card>
        {ctx.keys.elevenlabs && data.video.script_locked ? (
          <Card title="Generovat přes API" subtitle="Rozšíření: hlas rovnou z ElevenLabs">
            <p className="text-2 text-sm">Místo ručního nahrání můžeš takey vygenerovat přímo — v záložce Audio.</p>
            <Button className="mt-3" size="sm" onClick={() => ctx.goTab("audio")}>Do záložky Audio →</Button>
          </Card>
        ) : null}
        <Button variant="primary" className="w-full" loading={busy} disabled={!data.video.script_locked || !ctx.canEdit} onClick={async () => {
          setBusy(true);
          try {
            if (data.video.status === "approved") await api(`${API}/videos/${data.video.id}`, { method: "PATCH", body: { status: "awaiting_audio" } });
            await ctx.reload();
            ctx.goTab("audio");
          } catch (e) {
            toast("error", (e as Error).message);
          } finally {
            setBusy(false);
          }
        }}>Setup hotový → nahrát audio</Button>
      </div>
    </div>
  );
}
