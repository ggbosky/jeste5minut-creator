import { route, body, HttpError, logActivity } from "@/lib/api";
import { all, one, run } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { validateEmail, validatePassword } from "@/lib/authflow";

export const GET = route(async () => ({ users: all("SELECT id, email, name, role, totp_enabled, active, created_at, last_login_at FROM users ORDER BY id") }), { role: "admin" });

export const POST = route(async (req, { user }) => {
  const b = await body<{ email: string; name: string; password: string; role: string }>(req);
  const email = validateEmail(b.email);
  validatePassword(b.password);
  if (!["admin", "editor", "viewer"].includes(b.role)) throw new HttpError(400, "Neplatná role");
  if (one("SELECT 1 FROM users WHERE email = ?", email)) throw new HttpError(409, "Uživatel s tímto e-mailem už existuje");
  const r = run("INSERT INTO users(email, name, password_hash, role) VALUES(?, ?, ?, ?)", email, b.name || email.split("@")[0], hashPassword(b.password), b.role);
  logActivity(user.id, "user.create", "user", Number(r.lastInsertRowid), email);
  return { id: Number(r.lastInsertRowid) };
}, { role: "admin" });
