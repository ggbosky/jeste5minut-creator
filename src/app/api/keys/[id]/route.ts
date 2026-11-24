import { route, body, logActivity } from "@/lib/api";
import { activateKey, deleteKey } from "@/lib/keys";
import { run } from "@/lib/db";

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const b = await body<{ active?: boolean; label?: string }>(req);
  if (b.active) activateKey(Number(params.id));
  if (b.label) run("UPDATE api_keys SET label = ? WHERE id = ?", b.label, Number(params.id));
  return { ok: true };
}, { role: "admin" });

export const DELETE = route<{ id: string }>(async (_req, { params, user }) => {
  deleteKey(Number(params.id));
  logActivity(user.id, "key.delete", "api_key", Number(params.id));
  return { ok: true };
}, { role: "admin" });
