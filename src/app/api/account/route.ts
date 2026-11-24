import { route, body, HttpError } from "@/lib/api";
import { one, run } from "@/lib/db";
import { hashPassword, verifyPassword, sha256 } from "@/lib/crypto";
import { validatePassword } from "@/lib/authflow";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";

export const GET = route(async (_req, { user }) => ({ user }), { role: "viewer" });

export const POST = route(async (req, { user }) => {
  const b = await body<{ name?: string; current_password?: string; new_password?: string }>(req);
  if (b.name?.trim()) run("UPDATE users SET name = ? WHERE id = ?", b.name.trim(), user.id);
  if (b.new_password) {
    const u = one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", user.id)!;
    if (!verifyPassword(b.current_password ?? "", u.password_hash)) throw new HttpError(400, "Současné heslo nesedí");
    validatePassword(b.new_password);
    run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(b.new_password), user.id);
    // odhlásit ostatní relace
    const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
    run("DELETE FROM sessions WHERE user_id = ? AND id != ?", user.id, sha256(token));
  }
  return { ok: true };
}, { role: "viewer" });
