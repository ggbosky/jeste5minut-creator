import fs from "node:fs";
import path from "node:path";
import { route, HttpError, logActivity } from "@/lib/api";
import { one, run } from "@/lib/db";
import { getVideo, videoDir, refreshAudioStatus } from "@/lib/videos";
import { probeDuration } from "@/lib/audio";

const MAX = 50 * 1024 * 1024;

// Nahrání takeu části: multipart (part, file). Víc souborů najednou → podle názvu castN.mp3
export const POST = route<{ id: string }>(async (req, { params, user }) => {
  const id = Number(params.id);
  getVideo(id);
  const fd = await req.formData();
  const files = fd.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) throw new HttpError(400, "Chybí soubor");
  const forced = fd.get("part") ? Number(fd.get("part")) : null;
  const added: { part: number; name: string; duration: number }[] = [];
  for (const f of files) {
    if (f.size > MAX) throw new HttpError(413, `${f.name}: max 50 MB`);
    const part = forced ?? Number(f.name.match(/cast\s*_?(\d+)/i)?.[1] ?? f.name.match(/(\d+)/)?.[1] ?? NaN);
    if (!part || part < 1 || part > 4) throw new HttpError(400, `${f.name}: nepoznám číslo části — pojmenuj soubor cast1.mp3 … cast4.mp3`);
    const ext = (path.extname(f.name) || ".mp3").toLowerCase();
    if (![".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"].includes(ext)) throw new HttpError(400, `${f.name}: nepodporovaný formát`);
    const file = videoDir(id, "audio", `cast${part}_${Date.now()}${ext}`);
    fs.writeFileSync(file, Buffer.from(await f.arrayBuffer()));
    let duration = 0;
    try {
      duration = await probeDuration(file);
    } catch {
      fs.rmSync(file, { force: true });
      throw new HttpError(400, `${f.name}: soubor nejde přečíst jako audio`);
    }
    const hasSel = one("SELECT 1 FROM audio_takes WHERE video_id = ? AND part = ? AND selected = 1", id, part);
    run("INSERT INTO audio_takes(video_id, part, file, original_name, source, duration_s, selected) VALUES(?, ?, ?, ?, 'upload', ?, ?)", id, part, file, f.name, duration, hasSel ? 0 : 1);
    added.push({ part, name: f.name, duration });
  }
  run("UPDATE videos SET audio_stale = 0 WHERE id = ?", id);
  refreshAudioStatus(id);
  logActivity(user.id, "video.audio", "video", id, added.map((a) => `cast${a.part}`).join(", "));
  return { added };
});
