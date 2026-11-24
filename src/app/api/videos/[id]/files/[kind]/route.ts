import fs from "node:fs";
import path from "node:path";
import { route, HttpError } from "@/lib/api";
import { one } from "@/lib/db";
import { getVideo, videoScript } from "@/lib/videos";
import { exportNames, safeUnderData, writeMarkdowns } from "@/lib/videoActions";
import { specForVideo } from "@/lib/pipeline";

// Stažení výstupů: elevenlabs | strih | script | spec | timeline | mp4 | sheet  (?v=verze, ?inline=1)
export const GET = route<{ id: string; kind: string }>(async (req, { params }) => {
  const id = Number(params.id);
  const v = getVideo(id);
  const url = new URL(req.url);
  const inline = url.searchParams.get("inline") === "1";
  const send = (data: Buffer | string, name: string, type: string) =>
    new Response(typeof data === "string" ? data : new Uint8Array(data), {
      headers: {
        "content-type": type,
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "cache-control": "private, no-cache",
      },
    });
  const names = exportNames(id);
  const base = `Scenar_${v.number}_${v.slug}`;
  switch (params.kind) {
    case "elevenlabs":
    case "strih": {
      const md = writeMarkdowns(id)[params.kind];
      return send(md.content, md.name, "text/markdown; charset=utf-8");
    }
    case "script": {
      const s = videoScript(v);
      if (!s) throw new HttpError(404, "Bez scénáře");
      return send(JSON.stringify(s, null, 2), `${base}.json`, "application/json");
    }
    case "spec":
      return send(JSON.stringify(specForVideo(id), null, 2), `video_spec_scenar${v.number}.json`, "application/json");
    case "timeline": {
      if (!v.timeline) throw new HttpError(404, "Timeline vznikne při renderu");
      return send(JSON.stringify(JSON.parse(v.timeline), null, 2), `timeline_scenar${v.number}.json`, "application/json");
    }
    case "mp4":
    case "sheet": {
      const ver = url.searchParams.get("v");
      const r = one<{ output_file: string | null; contact_sheet: string | null; version: number }>(
        ver ? "SELECT output_file, contact_sheet, version FROM renders WHERE video_id = ? AND version = ?" : "SELECT output_file, contact_sheet, version FROM renders WHERE video_id = ? AND output_file IS NOT NULL ORDER BY version DESC LIMIT 1",
        ...(ver ? [id, Number(ver)] : [id]),
      );
      if (!r) throw new HttpError(404, "Render nenalezen");
      if (params.kind === "sheet") {
        const f = safeUnderData(r.contact_sheet);
        return send(fs.readFileSync(f), `${base}_v${r.version}_kontakt.png`, "image/png");
      }
      const f = safeUnderData(r.output_file);
      const stat = fs.statSync(f);
      const range = req.headers.get("range");
      const name = names.video(r.version);
      if (range) {
        const m = range.match(/bytes=(\d*)-(\d*)/);
        const start = m?.[1] ? Number(m[1]) : 0;
        const end = m?.[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
        const stream = fs.createReadStream(f, { start, end });
        return new Response(stream as unknown as ReadableStream, {
          status: 206,
          headers: { "content-type": "video/mp4", "content-range": `bytes ${start}-${end}/${stat.size}`, "accept-ranges": "bytes", "content-length": String(end - start + 1) },
        });
      }
      return new Response(fs.createReadStream(f) as unknown as ReadableStream, {
        headers: {
          "content-type": "video/mp4",
          "content-length": String(stat.size),
          "accept-ranges": "bytes",
          "content-disposition": `${inline ? "inline" : "attachment"}; filename="${path.basename(name)}"`,
        },
      });
    }
  }
  throw new HttpError(404, "Neznámý typ souboru");
});
