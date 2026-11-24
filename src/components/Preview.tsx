"use client";
import { API } from "@/lib/nav";
import { useEffect, useMemo, useRef, useState } from "react";
import type { VideoSpec } from "@/lib/outputs";
import { estimatedTimeline, type Timeline } from "@/render/timeline";
import { avatarTrack, drawFrame, type Assets, type Layout } from "@/render/frame";
import type { Brand } from "@/render/draw";
import { cx } from "./ui";

export type PreviewConfig = { brand: Brand; layout: Layout; wps: number; gesture_s: number; poseKeys: string[]; hasCover: boolean; poseVersion?: string };

// Načtení assetů jednou na stránku
const cache: { key?: string; promise?: Promise<Assets> } = {};
export function loadAssets(poseKeys: string[], hasCover: boolean, version = ""): Promise<Assets> {
  const key = poseKeys.join(",") + hasCover + version;
  if (cache.key === key && cache.promise) return cache.promise;
  const img = (src: string) =>
    new Promise<HTMLImageElement | null>((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = src;
    });
  cache.key = key;
  cache.promise = (async () => {
    const poses: Assets["poses"] = {};
    await Promise.all(poseKeys.map(async (k) => (poses[k] = await img(`${API}/poses/${k}?v=${version}`))));
    const cover = hasCover ? await img(`${API}/assets/cover?v=${version}`) : null;
    if (document.fonts) await Promise.all(["800 40px Inter", "700 40px Inter", "600 40px Inter"].map((f) => document.fonts.load(f).catch(() => null)));
    return { poses, cover };
  })();
  return cache.promise;
}

export function VideoPreview({
  spec, cfg, timeline, audioSrc, seekTo, className, showZonesDefault = false, width = 300,
}: { spec: VideoSpec | null; cfg: PreviewConfig; timeline?: Timeline | null; audioSrc?: string | null; seekTo?: number | null; className?: string; showZonesDefault?: boolean; width?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [assets, setAssets] = useState<Assets | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zones, setZones] = useState(showZonesDefault);
  const startRef = useRef<{ wall: number; t: number } | null>(null);

  useEffect(() => {
    loadAssets(cfg.poseKeys, cfg.hasCover, cfg.poseVersion).then(setAssets);
  }, [cfg.poseKeys, cfg.hasCover, cfg.poseVersion]);

  const tl = useMemo(() => {
    if (!spec) return null;
    if (timeline && timeline.scenes.length === spec.scenes.length) return timeline;
    try {
      return estimatedTimeline(spec, cfg.wps, cfg.gesture_s);
    } catch {
      return null;
    }
  }, [spec, timeline, cfg.wps, cfg.gesture_s]);
  const track = useMemo(() => (tl ? avatarTrack(tl, 30, null, cfg.layout) : []), [tl, cfg.layout]);
  const useAudio = !!audioSrc && tl?.timing_source !== "estimate";

  useEffect(() => {
    if (seekTo != null) {
      setT(seekTo);
      if (audioRef.current) audioRef.current.currentTime = seekTo;
    }
  }, [seekTo]);

  // smyčka přehrávání
  useEffect(() => {
    if (!playing || !tl) return;
    let raf = 0;
    startRef.current = { wall: performance.now(), t };
    const loop = () => {
      let nt: number;
      if (useAudio && audioRef.current) nt = audioRef.current.currentTime;
      else nt = startRef.current!.t + (performance.now() - startRef.current!.wall) / 1000;
      if (nt >= tl.duration_s) {
        nt = tl.duration_s;
        setPlaying(false);
      }
      setT(nt);
      if (nt < tl.duration_s) raf = requestAnimationFrame(loop);
    };
    if (useAudio && audioRef.current) {
      audioRef.current.currentTime = t;
      audioRef.current.play().catch(() => {});
    }
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      audioRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, tl, useAudio]);

  // kreslení
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !spec || !tl || !assets) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = width * dpr, H = Math.round((width * 16) / 9) * dpr;
    if (c.width !== W) { c.width = W; c.height = H; }
    const scale = W / cfg.layout.width;
    const f = Math.min(track.length - 1, Math.max(0, Math.floor(t * 30)));
    try {
      drawFrame(ctx, t, spec, tl, assets, track[f] ?? null, { brand: cfg.brand, layout: cfg.layout, scale, debugZones: zones });
    } catch (e) {
      ctx.fillStyle = "#300";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.fillText(String(e), 10, 20);
    }
  }, [t, spec, tl, assets, track, cfg, zones, width]);

  const scene = tl?.scenes.find((s) => t >= s.start_s && t < s.end_s);
  if (!spec || !tl) return <div className={cx("flex aspect-[9/16] items-center justify-center rounded-2xl bg-navy-900 text-sm text-white/60", className)} style={{ width }}>Náhled po vytvoření scénáře</div>;

  return (
    <div className={className} style={{ width }}>
      <div className="relative overflow-hidden rounded-2xl bg-navy-900 shadow-lg">
        <canvas ref={canvasRef} style={{ width, height: (width * 16) / 9, display: "block" }} />
        {!assets && <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">Načítám…</div>}
      </div>
      {useAudio && <audio ref={audioRef} src={audioSrc!} preload="auto" />}
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => {
            if (t >= tl.duration_s - 0.05) setT(0);
            setPlaying(!playing);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white"
          aria-label={playing ? "Pauza" : "Přehrát"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <input
          type="range" min={0} max={tl.duration_s} step={0.01} value={t} className="flex-1"
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setT(v);
            if (startRef.current) startRef.current = { wall: performance.now(), t: v };
            if (audioRef.current) audioRef.current.currentTime = v;
          }}
        />
        <span className="text-3 w-20 text-right text-xs tabular-nums">{t.toFixed(1)} / {tl.duration_s.toFixed(1)} s</span>
      </div>
      <div className="text-3 mt-1 flex items-center justify-between text-[11px]">
        <span>Scéna {scene?.n ?? "—"} · {tl.timing_source === "estimate" ? `odhad ${cfg.wps} sl/s` : tl.timing_source === "stt" ? "časy ze STT" : "časy ze slabik"}</span>
        <label className="flex items-center gap-1"><input type="checkbox" checked={zones} onChange={(e) => setZones(e.target.checked)} /> zóny</label>
      </div>
    </div>
  );
}
