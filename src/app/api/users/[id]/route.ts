import { route, body, HttpError } from "@/lib/api";
import { one, run } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { validatePassword } from "@/lib/authflow";

export const PATCH = route<{ id: string }>(async (req, { params, user }) => {
  const id = Number(params.id);
  const b = await body<{ role?: string; active?: boolean; password?: string; name?: string; reset_2fa?: boolean }>(req);
  const admins = one<{ c: number }>("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND active = 1")!.c;
  const target = one<{ role: string }>("SELECT role FROM users WHERE id = ?", id);
  if (!target) throw new HttpError(404, "Uživatel nenalezen");
  const demoting = (b.role && b.role !== "admin") || b.active === false;
  if (target.role === "admin" && demoting && admins <= 1) throw new HttpError(400, "Musí zůstat aspoň jeden aktivní správce");
  if (b.role) run("UPDATE users SET role = ? WHERE id = ?", b.role, id);
  if (b.name) run("UPDATE users SET name = ? WHERE id = ?", b.name, id);
  if (b.active !== undefined) {
    run("UPDATE users SET active = ? WHERE id = ?", b.active ? 1 : 0, id);
    if (!b.active) run("DELETE FROM sessions WHERE user_id = ?", id);
  }
  if (b.password) {
    validatePassword(b.password);
    run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(b.password), id);
    if (id !== user.id) run("DELETE FROM sessions WHERE user_id = ?", id);
  }
  if (b.reset_2fa) run("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?", id);
  return { ok: true };
}, { role: "admin" });

export const DELETE = route<{ id: string }>(async (_req, { params, user }) => {
  const id = Number(params.id);
  if (id === user.id) throw new HttpError(400, "Sám sebe smazat nemůžeš");
  run("DELETE FROM users WHERE id = ?", id);
  return { ok: true };
}, { role: "admin" });
