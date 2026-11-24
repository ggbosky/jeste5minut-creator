// Konfigurace pro klientské komponenty (náhled, editor) — načítá server.
import { all, one } from "./db";
import { getSettings } from "./settings";
import { brandFromSettings, layoutFromSettings } from "./pipeline";
import type { PreviewConfig } from "@/components/Preview";

export function previewConfig(): PreviewConfig {
  const content = getSettings("content");
  const r = getSettings("render");
  const poses = all<{ key: string; updated_at: string | null }>("SELECT key, updated_at FROM poses WHERE processed_file IS NOT NULL");
  const cover = one<{ updated_at: string }>("SELECT updated_at FROM assets WHERE key = 'cover'");
  return {
    brand: brandFromSettings(),
    layout: layoutFromSettings(),
    wps: content.words_per_second,
    gesture_s: r.gesture_s,
    poseKeys: poses.map((p) => p.key),
    hasCover: !!cover,
    poseVersion: [...poses.map((p) => p.updated_at), cover?.updated_at].join("|").replace(/\D/g, "").slice(-12),
  };
}

export function specSettings() {
  const b = getSettings("brand");
  return {
    videoFilePattern: getSettings("naming").video_pattern,
    abbr: b.abbr,
    yy: b.year,
    render: getSettings("render"),
    content: getSettings("content"),
  };
}
