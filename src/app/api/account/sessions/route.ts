import { cookies } from "next/headers";
import { route, body } from "@/lib/api";
import { run } from "@/lib/db";
import { listSessions, SESSION_COOKIE } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";

export const GET = route(async (_req, { user }) => {
  const cur = sha256((await cookies()).get(SESSION_COOKIE)?.value ?? "");
  return { sessions: listSessions(user.id).map((s) => ({ ...s, id: s.id.slice(0, 12), current: s.id === cur })) };
}, { role: "viewer" });

// Odhlášení relace podle prefixu ID, nebo všech ostatních
export const DELETE = route(async (req, { user }) => {
  const b = await body<{ id?: string; others?: boolean }>(req);
  const cur = sha256((await cookies()).get(SESSION_COOKIE)?.value ?? "");
  if (b.others) run("DELETE FROM sessions WHERE user_id = ? AND id != ?", user.id, cur);
  else if (b.id) run("DELETE FROM sessions WHERE user_id = ? AND substr(id, 1, 12) = ? AND id != ?", user.id, b.id, cur);
  return { ok: true };
}, { role: "viewer" });
