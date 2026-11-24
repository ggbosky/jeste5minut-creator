import { all, one, run } from "./db";
import { decrypt, encrypt } from "./crypto";
import { PROVIDERS, type Provider } from "./constants";
import { HttpError } from "./api";

export type ApiKeyRow = {
  id: number;
  provider: Provider;
  label: string;
  last4: string;
  is_active: number;
  last_tested_at: string | null;
  test_status: string | null;
  test_message: string | null;
  created_at: string;
};

export function listKeys(): ApiKeyRow[] {
  return all<ApiKeyRow>(
    "SELECT id, provider, label, last4, is_active, last_tested_at, test_status, test_message, created_at FROM api_keys ORDER BY provider, created_at",
  );
}

export function addKey(provider: Provider, label: string, secret: string, activate: boolean) {
  const clean = secret.trim();
  if (clean.length < 8) throw new HttpError(400, "Klíč je příliš krátký");
  const r = run(
    "INSERT INTO api_keys(provider, label, secret_enc, last4) VALUES(?, ?, ?, ?)",
    provider,
    label || "Klíč",
    encrypt(clean),
    clean.slice(-4),
  );
  const id = Number(r.lastInsertRowid);
  const hasActive = one("SELECT 1 FROM api_keys WHERE provider = ? AND is_active = 1", provider);
  if (activate || !hasActive) activateKey(id);
  return id;
}

export function activateKey(id: number) {
  const k = one<{ provider: string }>("SELECT provider FROM api_keys WHERE id = ?", id);
  if (!k) throw new HttpError(404, "Klíč nenalezen");
  run("UPDATE api_keys SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE provider = ?", id, k.provider);
}

export function deleteKey(id: number) {
  run("DELETE FROM api_keys WHERE id = ?", id);
}

export function keySecret(id: number): string {
  const k = one<{ secret_enc: string }>("SELECT secret_enc FROM api_keys WHERE id = ?", id);
  if (!k) throw new HttpError(404, "Klíč nenalezen");
  return decrypt(k.secret_enc);
}

/** Aktivní klíč poskytovatele — z DB, jinak z proměnné prostředí. */
export function activeKey(provider: Provider): { key: string; source: "db" | "env"; id?: number } | null {
  const k = one<{ id: number; secret_enc: string }>("SELECT id, secret_enc FROM api_keys WHERE provider = ? AND is_active = 1", provider);
  if (k) return { key: decrypt(k.secret_enc), source: "db", id: k.id };
  const env = PROVIDERS.find((p) => p.key === provider)?.env;
  const v = env ? process.env[env] : undefined;
  return v ? { key: v, source: "env" } : null;
}

export function requireKey(provider: Provider): string {
  const k = activeKey(provider);
  if (!k) {
    const label = PROVIDERS.find((p) => p.key === provider)?.label ?? provider;
    throw new HttpError(412, `Chybí API klíč pro ${label}. Přidej ho v Nastavení → API klíče.`);
  }
  return k.key;
}

export function recordTest(id: number, ok: boolean, message: string) {
  run(
    "UPDATE api_keys SET last_tested_at = datetime('now'), test_status = ?, test_message = ? WHERE id = ?",
    ok ? "ok" : "error",
    message.slice(0, 500),
    id,
  );
}

export function keyStatus() {
  return PROVIDERS.map((p) => {
    const k = one<ApiKeyRow>("SELECT id, provider, label, last4, is_active, last_tested_at, test_status FROM api_keys WHERE provider = ? AND is_active = 1", p.key);
    const env = !!process.env[p.env];
    return { provider: p.key, label: p.label, configured: !!k || env, source: k ? "db" : env ? "env" : null, key: k ?? null };
  });
}
