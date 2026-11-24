import { route, body } from "@/lib/api";
import { run } from "@/lib/db";

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const b = await body<{ title?: string; angle?: string; hook_line?: string; chapter?: number; hook_type?: string; status?: string }>(req);
  for (const k of ["title", "angle", "hook_line", "chapter", "hook_type", "status"] as const)
    if (b[k] !== undefined) run(`UPDATE topics SET ${k} = ? WHERE id = ?`, b[k], Number(params.id));
  return { ok: true };
});

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  run("DELETE FROM topics WHERE id = ?", Number(params.id));
  return { ok: true };
});
