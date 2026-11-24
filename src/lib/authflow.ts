import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { one, run } from "./db";
import { hashPassword, verifyPassword, verifyTotp } from "./crypto";
import { clientIp, createSession, destroySession, loginFailed, loginLocked, loginSucceeded, readSession, userCount } from "./auth";
import { HttpError, checkOrigin, errorResponse, logActivity } from "./api";

export function validatePassword(pw: string) {
  if (typeof pw !== "string" || pw.length < 10) throw new HttpError(400, "Heslo musí mít aspoň 10 znaků.");
  if (!/[A-Za-zÀ-ž]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, "Heslo musí obsahovat písmena i číslice.");
}
export function validateEmail(e: string) {
  if (typeof e !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new HttpError(400, "Neplatný e-mail.");
  return e.trim().toLowerCase();
}

export function publicRoute(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    try {
      checkOrigin(req);
      const out = await fn(req);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function setup(body: { name?: string; email?: string; password?: string }) {
  if (userCount() > 0) throw new HttpError(403, "Aplikace už je nastavená. Přihlas se.");
  const email = validateEmail(body.email ?? "");
  validatePassword(body.password ?? "");
  const name = (body.name ?? "").trim() || email.split("@")[0];
  const r = run("INSERT INTO users(email, name, password_hash, role, last_login_at) VALUES(?, ?, ?, 'admin', datetime('now'))", email, name, hashPassword(body.password!));
  const id = Number(r.lastInsertRowid);
  await createSession(id);
  logActivity(id, "auth.setup", "user", id, "Vytvořen první účet (admin)");
  return { ok: true };
}

export async function login(body: { email?: string; password?: string }) {
  const email = (body.email ?? "").trim().toLowerCase();
  const h = await headers();
  const key = `${clientIp(h)}|${email}`;
  const locked = loginLocked(key);
  if (locked) throw new HttpError(429, `Příliš mnoho pokusů. Zkus to znovu za ${Math.ceil(locked / 60)} min.`);
  const u = one<{ id: number; password_hash: string; active: number; totp_enabled: number }>("SELECT id, password_hash, active, totp_enabled FROM users WHERE email = ?", email);
  // konstantní čas i pro neexistující účet
  const ok = u ? verifyPassword(body.password ?? "", u.password_hash) : (verifyPassword(body.password ?? "", "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "=="), false);
  if (!u || !ok || !u.active) {
    loginFailed(key);
    if (u) logActivity(u.id, "auth.failed", "user", u.id, clientIp(h));
    throw new HttpError(401, "Nesprávný e-mail nebo heslo.");
  }
  loginSucceeded(key);
  if (u.totp_enabled) {
    await createSession(u.id, true);
    return { twofa: true };
  }
  await createSession(u.id);
  run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", u.id);
  logActivity(u.id, "auth.login", "user", u.id, clientIp(h));
  return { ok: true };
}

export async function secondFactor(body: { code?: string }) {
  const s = await readSession();
  if (!s || !s.session.pending_2fa) throw new HttpError(401, "Přihlášení vypršelo, začni znovu.");
  const h = await headers();
  const key = `2fa|${s.user.id}`;
  if (loginLocked(key)) throw new HttpError(429, "Příliš mnoho pokusů.");
  const u = one<{ totp_secret: string }>("SELECT totp_secret FROM users WHERE id = ?", s.user.id)!;
  if (!verifyTotp(u.totp_secret, body.code ?? "")) {
    loginFailed(key);
    throw new HttpError(401, "Neplatný kód.");
  }
  loginSucceeded(key);
  await destroySession();
  await createSession(s.user.id);
  run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", s.user.id);
  logActivity(s.user.id, "auth.login", "user", s.user.id, `${clientIp(h)} (2FA)`);
  return { ok: true };
}
