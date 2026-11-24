import fs from "node:fs";
import { route, body, HttpError } from "@/lib/api";
import { one, run } from "@/lib/db";
import { savePoseUpload, type PoseRow } from "@/lib/poses";

type P = { key: string };
const pose = (k: string) => {
  const p = one<PoseRow>("SELECT * FROM poses WHERE key = ?", k);
  if (!p) throw new HttpError(404, "Neznámá póza");
  return p;
};

// ?source=1 vrátí originál (JPG se zeleným pozadím)
export const GET = route<P>(async (req, { params }) => {
  const p = pose(params.key);
  const src = new URL(req.url).searchParams.get("source") === "1";
  const f = src ? p.source_file : p.processed_file;
  if (!f || !fs.existsSync(f)) throw new HttpError(404, "Póza není nahraná");
  return new Response(new Uint8Array(fs.readFileSync(f)), { headers: { "content-type": src ? "image/jpeg" : "image/png", "cache-control": "private, max-age=86400" } });
});

export const POST = route<P>(async (req, { params }) => {
  pose(params.key);
  const fd = await req.formData();
  const f = fd.get("file");
  if (!(f instanceof File)) throw new HttpError(400, "Chybí soubor");
  if (f.size > 25 * 1024 * 1024) throw new HttpError(413, "Max 25 MB");
  await savePoseUpload(params.key, Buffer.from(await f.arrayBuffer()), f.name);
  return { ok: true };
});

export const PATCH = route<P>(async (req, { params }) => {
  const b = await body<{ file_name?: string; usage?: string }>(req);
  if (b.file_name !== undefined) run("UPDATE poses SET file_name = ? WHERE key = ?", b.file_name, params.key);
  if (b.usage !== undefined) run("UPDATE poses SET usage = ? WHERE key = ?", b.usage, params.key);
  return { ok: true };
});

export const DELETE = route<P>(async (_req, { params }) => {
  const p = pose(params.key);
  for (const f of [p.processed_file, p.source_file]) if (f) fs.rmSync(f, { force: true });
  run("UPDATE poses SET processed_file = NULL, source_file = NULL, updated_at = datetime('now') WHERE key = ?", params.key);
  return { ok: true };
});
