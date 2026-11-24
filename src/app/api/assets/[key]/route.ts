import fs from "node:fs";
import path from "node:path";
import { route, HttpError } from "@/lib/api";
import { dataPath, one, run } from "@/lib/db";

const ALLOWED: Record<string, string[]> = {
  ebook_pdf: ["application/pdf"],
  cover: ["image/png", "image/jpeg", "image/webp"],
  logo: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
};
const check = (k: string) => {
  if (!ALLOWED[k]) throw new HttpError(404, "Neznámý asset");
  return k;
};

export const GET = route<{ key: string }>(async (_req, { params }) => {
  const a = one<{ file: string; mime: string; original_name: string }>("SELECT file, mime, original_name FROM assets WHERE key = ?", check(params.key));
  if (!a || !fs.existsSync(a.file)) throw new HttpError(404, "Není nahráno");
  return new Response(new Uint8Array(fs.readFileSync(a.file)), {
    headers: { "content-type": a.mime, "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.original_name)}`, "cache-control": "private, max-age=3600" },
  });
});

export const POST = route<{ key: string }>(async (req, { params }) => {
  const key = check(params.key);
  const fd = await req.formData();
  const f = fd.get("file");
  if (!(f instanceof File)) throw new HttpError(400, "Chybí soubor");
  if (!ALLOWED[key].includes(f.type)) throw new HttpError(400, `Nepodporovaný typ ${f.type}`);
  if (f.size > 32 * 1024 * 1024) throw new HttpError(413, "Max 32 MB");
  const file = dataPath("assets", `${key}${path.extname(f.name).toLowerCase() || ""}`);
  fs.writeFileSync(file, Buffer.from(await f.arrayBuffer()));
  run(
    "INSERT INTO assets(key, file, original_name, mime, size) VALUES(?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET file = excluded.file, original_name = excluded.original_name, mime = excluded.mime, size = excluded.size, updated_at = datetime('now')",
    key, file, f.name, f.type, f.size,
  );
  return { ok: true };
});

export const DELETE = route<{ key: string }>(async (_req, { params }) => {
  const a = one<{ file: string }>("SELECT file FROM assets WHERE key = ?", check(params.key));
  if (a) fs.rmSync(a.file, { force: true });
  run("DELETE FROM assets WHERE key = ?", params.key);
  return { ok: true };
});
