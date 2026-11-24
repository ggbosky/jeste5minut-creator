// CLI: render(video_id) → MP4 mimo webové rozhraní.
//   npm run render -- <video_id>            vyrenderuje novou verzi
//   npm run render -- --demo                vytvoří ukázkové video se syntetickým audiem a vyrenderuje ho
import fs from "node:fs";
import path from "node:path";
import { one, run, dataPath } from "../src/lib/db";
import { sampleScript } from "../src/lib/sample";
import { normalizeScript } from "../src/lib/script";
import { nextNumber, saveScript, scriptChecks } from "../src/lib/videos";
import { renderVideo } from "../src/lib/pipeline";
import { sh } from "../src/lib/audio";

async function demoVideo(): Promise<number> {
  const n = nextNumber();
  const s = normalizeScript(sampleScript(n));
  const r = run("INSERT INTO videos(number, title, slug, chapter, hook_type, status, script_locked) VALUES(?, ?, ?, ?, ?, 'render', 1)", n, s.title, s.slug, s.chapter, s.hook_type);
  const id = Number(r.lastInsertRowid);
  saveScript(id, s, "demo");
  const checks = scriptChecks(s);
  console.log("Kontroly:", checks.map((c) => `${c.level}: ${c.message}`).join("\n  "));
  // syntetické „audio“: tóny s pauzami jako slova (jen pro test pipeline)
  for (const p of s.audio_parts) {
    const words = p.tagged_text.replace(/\[[^\]]*\]/g, "").trim().split(/\s+/).length;
    const segs: string[] = [];
    for (let i = 0; i < words; i++) segs.push(`sine=f=${180 + (i % 5) * 40}:d=0.36,volume=0.4,apad=pad_dur=0.12`);
    const file = dataPath("videos", String(id), "audio", `cast${p.part}_demo.wav`);
    const inputs = segs.flatMap((x) => ["-f", "lavfi", "-i", x]);
    const filter = segs.map((_, i) => `[${i}:a]`).join("") + `concat=n=${segs.length}:v=0:a=1,adelay=300,apad=pad_dur=0.4[o]`;
    await sh("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", filter, "-map", "[o]", "-ar", "48000", file]);
    run("INSERT INTO audio_takes(video_id, part, file, original_name, source, selected) VALUES(?, ?, ?, ?, 'demo', 1)", id, p.part, file, path.basename(file));
  }
  return id;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.log("Použití: npm run render -- <video_id> | --demo");
    process.exit(1);
  }
  const videoId = arg === "--demo" ? await demoVideo() : Number(arg);
  const last = one<{ v: number | null }>("SELECT MAX(version) v FROM renders WHERE video_id = ?", videoId);
  const version = (last?.v ?? 0) + 1;
  const rr = run("INSERT INTO renders(video_id, version, status) VALUES(?, ?, 'running')", videoId, version);
  const t0 = Date.now();
  const { qa, outFile } = await renderVideo(Number(rr.lastInsertRowid), (stage, p, line) => {
    if (line) console.log(`[${stage} ${(p * 100).toFixed(0)}%] ${line}`);
  });
  run("UPDATE renders SET status = ?, progress = 1, finished_at = datetime('now') WHERE id = ?", qa.passed ? "done" : "qa_failed", Number(rr.lastInsertRowid));
  console.log(`\n${qa.passed ? "✓ KONTROLA PROŠLA" : "✗ KONTROLA NEPROŠLA"} — ${outFile} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log("Velikost:", (fs.statSync(outFile).size / 1e6).toFixed(1), "MB");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
