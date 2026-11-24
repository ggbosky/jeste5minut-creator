"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Spinner, Tabs, api, useToast } from "@/components/ui";
import { HOOK_TYPES, statusMeta, VIDEO_STATUSES } from "@/lib/constants";
import type { Check, ContentRules, Script } from "@/lib/script";
import type { PreviewConfig } from "@/components/Preview";
import type { VoiceProfile } from "@/lib/outputs";
import type { Timeline } from "@/render/timeline";
import type { Settings } from "@/lib/settings-defaults";
import { ScriptEditor } from "./ScriptEditor";
import { VoiceTab } from "./VoiceTab";
import { AudioTab } from "./AudioTab";
import { RenderTab } from "./RenderTab";
import { ExportTab } from "./ExportTab";

export type Take = { id: number; part: number; original_name: string; source: string; duration_s: number | null; selected: number; meta: { profile?: string; model?: string } | null; created_at: string };
export type RenderRow = { id: number; version: number; status: string; stage: string; progress: number; notes: string; duration_s: number | null; render_seconds: number | null; qa: { passed: boolean; checks: { key: string; label: string; ok: boolean; level: string; detail: string }[] } | null; created_at: string; finished_at: string | null; has_output: number; has_sheet: number };
export type VideoData = {
  video: { id: number; number: string; title: string; slug: string; chapter: number; hook_type: string; angle: string; status: string; script_locked: number; voice_profile_id: number | null; audio_stale: number; approved_at: string | null; published_at: string | null; publish_info: { legacy?: boolean; file?: string; duration_s?: number; scenes?: number; version?: number; note?: string; platforms?: Record<string, { done: boolean; url?: string }> } | null; created_at: string };
  script: Script | null;
  checks: Check[];
  takes: Take[];
  renders: RenderRow[];
  revisions: { id: number; render_version: number | null; scene: number | null; comment: string; status: string; created_at: string }[];
  versions: { id: number; source: string; note: string; created_at: string }[];
  timeline: Timeline | null;
};
export type SpecCfg = { videoFilePattern: string; abbr: string; yy: string; render: Settings["render"]; content: Settings["content"] };
export type Ctx = {
  data: VideoData;
  reload: () => Promise<void>;
  cfg: PreviewConfig;
  specCfg: SpecCfg;
  rules: ContentRules & Settings["content"];
  brand: Settings["brand"];
  profiles: VoiceProfile[];
  chapters: { n: number; title: string; idea: string }[];
  keys: { anthropic: boolean; elevenlabs: boolean };
  canEdit: boolean;
  goTab: (t: TabKey) => void;
};

type TabKey = "script" | "voice" | "audio" | "render" | "export";

export function Workspace(props: { id: number; role: string; cfg: PreviewConfig; specCfg: SpecCfg; rules: Settings["content"]; brand: Settings["brand"]; profiles: unknown[]; chapters: { n: number; title: string; idea: string }[]; keys: { anthropic: boolean; elevenlabs: boolean } }) {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<VideoData | null>(null);
  const [tab, setTab] = useState<TabKey>((sp.get("tab") as TabKey) || "script");

  const reload = useCallback(async () => {
    try {
      setData(await api<VideoData>(`/api/videos/${props.id}`));
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }, [props.id, toast]);
  useEffect(() => {
    reload();
  }, [reload]);

  const goTab = (t: TabKey) => {
    setTab(t);
    router.replace(`/videos/${props.id}?tab=${t}`, { scroll: false });
  };

  if (!data) return <div className="flex items-center gap-3 p-10"><Spinner /> Načítám video…</div>;
  const v = data.video;
  const st = statusMeta(v.status);
  const stepIdx = VIDEO_STATUSES.findIndex((s) => s.key === v.status);
  const ctx: Ctx = {
    data, reload, cfg: props.cfg, specCfg: props.specCfg, rules: props.rules as Ctx["rules"], brand: props.brand,
    profiles: props.profiles as VoiceProfile[], chapters: props.chapters, keys: props.keys, canEdit: props.role !== "viewer", goTab,
  };
  const selectedParts = new Set(data.takes.filter((t) => t.selected).map((t) => t.part));
  const parts = data.script?.audio_parts.length ?? 0;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/videos" className="text-3 text-sm hover:underline">← Videa</Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-navy-900 px-2 py-0.5 text-lg font-extrabold text-white">{v.number}</span>
            <h1 className="text-2xl font-extrabold tracking-tight">{v.title}</h1>
            <Badge color={st.color} solid>{st.label}</Badge>
            {v.script_locked ? <Badge color="#8B5CF6">🔒 schváleno</Badge> : null}
          </div>
          <p className="text-2 mt-1 text-sm">
            Kapitola {v.chapter} · {props.chapters.find((c) => c.n === v.chapter)?.title} · hook: {HOOK_TYPES.find((h) => h.key === v.hook_type)?.label}
            {v.angle ? ` · ${v.angle}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {props.role !== "viewer" && (
            <Button variant="ghost" size="sm" onClick={async () => {
              if (!confirm(`Smazat video ${v.number} „${v.title}“ včetně audia a renderů?`)) return;
              await api(`/api/videos/${v.id}`, { method: "DELETE" });
              router.push("/videos");
            }}>Smazat</Button>
          )}
        </div>
      </div>

      {/* průběh workflow */}
      <ol className="mb-5 grid grid-cols-7 gap-1">
        {VIDEO_STATUSES.map((s, i) => (
          <li key={s.key} className="text-center">
            <div className="h-1.5 rounded-full" style={{ background: i <= stepIdx ? s.color : "var(--border)" }} />
            <span className={`mt-1 hidden text-[11px] font-semibold sm:block ${i === stepIdx ? "" : "text-3"}`}>{s.label}</span>
          </li>
        ))}
      </ol>

      {v.publish_info?.legacy && (
        <div className="mb-4 rounded-xl border border-base bg-[var(--surface-2)] px-4 py-3 text-sm">
          Video z reálné výroby mimo aplikaci: <b>{v.publish_info.file}</b> · {v.publish_info.duration_s} s · {v.publish_info.scenes} scén {v.publish_info.note ? `· ${v.publish_info.note}` : ""}. Scénář není v aplikaci — můžeš ho vložit nebo napsat znovu.
        </div>
      )}

      <Tabs value={tab} onChange={goTab} tabs={[
        { key: "script", label: "1 · Scénář", badge: data.checks.some((c) => c.level === "error") ? <Badge color="#DC2626">{data.checks.filter((c) => c.level === "error").length}</Badge> : null },
        { key: "voice", label: "2 · Setup ElevenLabs" },
        { key: "audio", label: "3 · Audio", badge: parts ? <Badge color={selectedParts.size === parts ? "#10B981" : "#F59E0B"}>{selectedParts.size}/{parts}</Badge> : null },
        { key: "render", label: "4 · Render a kontrola", badge: data.renders[0] ? <Badge>v{data.renders[0].version}</Badge> : null },
        { key: "export", label: "5 · Export" },
      ]} />
      <div className="pt-5">
        {tab === "script" && <ScriptEditor ctx={ctx} />}
        {tab === "voice" && <VoiceTab ctx={ctx} />}
        {tab === "audio" && <AudioTab ctx={ctx} />}
        {tab === "render" && <RenderTab ctx={ctx} />}
        {tab === "export" && <ExportTab ctx={ctx} />}
      </div>
    </div>
  );
}
