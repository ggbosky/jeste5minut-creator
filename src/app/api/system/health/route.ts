import fs from "node:fs";
import { route } from "@/lib/api";
import { DATA_DIR, one } from "@/lib/db";
import { ffmpegVersion } from "@/lib/audio";
import { queueState } from "@/lib/pipeline";

function dirSize(d: string): number {
  if (!fs.existsSync(d)) return 0;
  let s = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = `${d}/${e.name}`;
    s += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return s;
}

export const GET = route(async () => ({
  node: process.version,
  ffmpeg: await ffmpegVersion(),
  data_dir: DATA_DIR,
  data_size_mb: +(dirSize(DATA_DIR) / 1e6).toFixed(1),
  queue: queueState(),
  counts: one("SELECT (SELECT COUNT(*) FROM videos) videos, (SELECT COUNT(*) FROM renders) renders, (SELECT COUNT(*) FROM audio_takes) takes, (SELECT COUNT(*) FROM users) users"),
  app_secret_from_env: !!process.env.APP_SECRET,
}));
