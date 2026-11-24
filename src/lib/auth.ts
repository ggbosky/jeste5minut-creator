import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { one, run, all } from "./db";
import { randomToken, sha256 } from "./crypto";
import { getSettings } from "./settings";

export const SESSION_COOKIE = "j5m_session";

export type User = {
  id: number;
  email: string;
  name: string;
  role: "admin" | "editor" | "viewer";
  totp_enabled: number;
  active: number;
  created_at: string;
  last_login_at: string | null;
};

const USER_COLS = "u.id, u.email, u.name, u.role, u.totp_enabled, u.active, u.created_at, u.last_login_at";

export function userCount(): number {
  return one<{ c: number }>("SELECT COUNT(*) c FROM users")!.c;
}

async function isHttps() {
  const h = await headers();
  return h.get("x-forwarded-proto") === "https" || process.env.COOKIE_SECURE === "1";
}

export async function createSession(userId: number, pending2fa = false) {
  const token = randomToken();
  const days = getSettings("security").session_days;
  const h = await headers();
  const expires = new Date(Date.now() + (pending2fa ? 10 * 60_000 : days * 86400_000));
  run(
    "INSERT INTO sessions(id, user_id, expires_at, ip, user_agent, pending_2fa) VALUES(?, ?, ?, ?, ?, ?)",
    sha256(token),
    userId,
    expires.toISOString(),
    clientIp(h),
    (h.get("user-agent") || "").slice(0, 300),
    pending2fa ? 1 : 0,
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await isHttps(),
    path: "/",
    expires,
  });
  return token;
}

export function clientIp(h: Headers): string {
  return (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}

type SessionRow = { id: string; user_id: number; expires_at: string; pending_2fa: number; last_seen_at: string };

export async function readSession(): Promise<{ session: SessionRow; user: User } | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = one<SessionRow>("SELECT id, user_id, expires_at, pending_2fa, last_seen_at FROM sessions WHERE id = ?", sha256(token));
  if (!s) return null;
  if (new Date(s.expires_at).getTime() < Date.now()) {
    run("DELETE FROM sessions WHERE id = ?", s.id);
    return null;
  }
  const user = one<User>(`SELECT ${USER_COLS} FROM users u WHERE u.id = ? AND u.active = 1`, s.user_id);
  if (!user) return null;
  // posun last_seen jednou za minutu
  if (Date.now() - new Date(s.last_seen_at + "Z").getTime() > 60_000) {
    run("UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?", s.id);
  }
  return { session: s, user };
}

export async function currentUser(): Promise<User | null> {
  const r = await readSession();
  if (!r || r.session.pending_2fa) return null;
  return r.user;
}

/** Pro stránky — přesměruje na login. */
export async function requireUser(role?: User["role"]): Promise<User> {
  const u = await currentUser();
  if (!u) {
    if (userCount() === 0) redirect("/setup");
    redirect("/login");
  }
  if (role === "admin" && u.role !== "admin") redirect("/?denied=1");
  return u;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE id = ?", sha256(token));
  jar.delete(SESSION_COOKIE);
}

export function listSessions(userId: number) {
  return all<{ id: string; created_at: string; last_seen_at: string; ip: string; user_agent: string; expires_at: string }>(
    "SELECT id, created_at, last_seen_at, ip, user_agent, expires_at FROM sessions WHERE user_id = ? AND pending_2fa = 0 ORDER BY last_seen_at DESC",
    userId,
  );
}

// ---- omezení pokusů o přihlášení (v paměti procesu) ----
type Attempt = { count: number; first: number; lockedUntil: number };
const g = globalThis as typeof globalThis & { __j5mAttempts?: Map<string, Attempt> };
const attempts = (g.__j5mAttempts ??= new Map());

export function loginLocked(key: string): number {
  const a = attempts.get(key);
  if (a && a.lockedUntil > Date.now()) return Math.ceil((a.lockedUntil - Date.now()) / 1000);
  return 0;
}
export function loginFailed(key: string) {
  const { max_login_attempts, lockout_minutes } = getSettings("security");
  const now = Date.now();
  const a = attempts.get(key) ?? { count: 0, first: now, lockedUntil: 0 };
  if (now - a.first > lockout_minutes * 60_000) {
    a.count = 0;
    a.first = now;
  }
  a.count++;
  if (a.count >= max_login_attempts) {
    a.lockedUntil = now + lockout_minutes * 60_000;
    a.count = 0;
    a.first = now;
  }
  attempts.set(key, a);
}
export function loginSucceeded(key: string) {
  attempts.delete(key);
}
