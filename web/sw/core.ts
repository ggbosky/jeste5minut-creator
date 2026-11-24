// Jádro „backendu v prohlížeči“: nastavení, trezor klíčů, přihlášení, log aktivity.
import { add, all, get, put, del, nowIso, count } from "./db";
import { DEFAULT_SETTINGS, type Settings, type SettingsGroup } from "@/lib/settings-defaults";
import { CLAUDE_MODELS, DEFAULT_POSES, PROVIDERS, type Provider } from "@/lib/constants";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

// ---------------- nastavení ----------------
function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
export function deepMerge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : (over as T);
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) out[k] = k in out ? deepMerge(out[k], v) : v;
  return out as T;
}
export async function getSettings<K extends SettingsGroup>(g: K): Promise<Settings[K]> {
  const row = await get<{ key: string; value: unknown }>("settings", g);
  return deepMerge(DEFAULT_SETTINGS[g], row?.value ?? {});
}
export async function saveSettings<K extends SettingsGroup>(g: K, value: unknown) {
  const merged = deepMerge(await getSettings(g), value);
  await put("settings", { key: g, value: merged });
  return merged;
}

// ---------------- base64 / crypto ----------------
export const b64 = (u: Uint8Array | ArrayBuffer) => {
  const a = u instanceof Uint8Array ? u : new Uint8Array(u);
  let s = "";
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s);
};
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const enc = new TextEncoder();
const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const bs = (u: Uint8Array | ArrayBuffer) => u as BufferSource;

async function pbkdf2(password: string, salt: Uint8Array, iterations = 210_000): Promise<ArrayBuffer> {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: bs(salt), iterations }, base, 256);
}
async function aesKey(raw: ArrayBuffer | Uint8Array) {
  return crypto.subtle.importKey("raw", bs(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function aesEncrypt(keyRaw: ArrayBuffer | Uint8Array, data: Uint8Array) {
  const iv = rnd(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv) }, await aesKey(keyRaw), bs(data));
  return { iv: b64(iv), data: b64(ct) };
}
async function aesDecrypt(keyRaw: ArrayBuffer | Uint8Array, box: { iv: string; data: string }) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(unb64(box.iv)) }, await aesKey(keyRaw), bs(unb64(box.data))));
}

export type UserRec = {
  id: number;
  email: string;
  name: string;
  role: "admin" | "editor" | "viewer";
  pw: { salt: string; hash: string };
  vault: { salt: string; iv: string; data: string } | null;
  totp_secret: string | null;
  totp_enabled: number;
  active: number;
  created_at: string;
  last_login_at: string | null;
};
export const publicUser = (u: UserRec) => ({ id: u.id, email: u.email, name: u.name, role: u.role, totp_enabled: u.totp_enabled, active: u.active, created_at: u.created_at, last_login_at: u.last_login_at });

export async function hashPassword(pw: string) {
  const salt = rnd(16);
  return { salt: b64(salt), hash: b64(await pbkdf2(pw, salt)) };
}
export async function verifyPassword(pw: string, rec: { salt: string; hash: string }) {
  const h = b64(await pbkdf2(pw, unb64(rec.salt)));
  return h === rec.hash;
}
/** Trezorový klíč (náhodný) zabalený heslem uživatele. */
export async function wrapVault(vaultRaw: Uint8Array, password: string) {
  const salt = rnd(16);
  const kek = await pbkdf2(password, salt, 150_000);
  return { salt: b64(salt), ...(await aesEncrypt(kek, vaultRaw)) };
}
export async function unwrapVault(box: NonNullable<UserRec["vault"]>, password: string) {
  const kek = await pbkdf2(password, unb64(box.salt), 150_000);
  return aesDecrypt(kek, box);
}

// ---------------- relace (jedna na prohlížeč) ----------------
type Session = { key: "session"; user_id: number; vault: string; created_at: string; last_seen_at: string; expires_at: string; pending_2fa?: boolean; ua: string };

export async function createSession(userId: number, vault: Uint8Array, pending2fa = false) {
  const days = (await getSettings("security")).session_days;
  const now = Date.now();
  const s: Session = {
    key: "session", user_id: userId, vault: b64(vault), created_at: nowIso(), last_seen_at: nowIso(),
    expires_at: new Date(now + (pending2fa ? 10 * 60_000 : days * 86400_000)).toISOString(), pending_2fa: pending2fa, ua: navigator.userAgent,
  };
  await put("kv", s);
}
export async function readSession(): Promise<{ s: Session; user: UserRec } | null> {
  const s = await get<Session>("kv", "session");
  if (!s) return null;
  if (new Date(s.expires_at).getTime() < Date.now()) {
    await del("kv", "session");
    return null;
  }
  const user = await get<UserRec>("users", s.user_id);
  if (!user || !user.active) return null;
  return { s, user };
}
export async function currentUser() {
  const r = await readSession();
  return r && !r.s.pending_2fa ? r : null;
}
export async function destroySession() {
  await del("kv", "session");
}
export async function sessionVault(): Promise<Uint8Array> {
  const r = await currentUser();
  if (!r) throw new HttpError(401, "Nepřihlášen");
  return unb64(r.s.vault);
}

// ---------------- API klíče v trezoru ----------------
export type KeyRec = { id: number; provider: Provider; label: string; secret: { iv: string; data: string }; last4: string; is_active: number; last_tested_at: string | null; test_status: string | null; test_message: string | null; created_at: string };
export const publicKey = (k: KeyRec) => ({ id: k.id, provider: k.provider, label: k.label, last4: k.last4, is_active: k.is_active, last_tested_at: k.last_tested_at, test_status: k.test_status, test_message: k.test_message, created_at: k.created_at });

export async function encryptSecret(secret: string) {
  return aesEncrypt(await sessionVault(), enc.encode(secret));
}
export async function decryptSecret(box: { iv: string; data: string }) {
  return new TextDecoder().decode(await aesDecrypt(await sessionVault(), box));
}
export async function activeKey(provider: Provider): Promise<string | null> {
  const k = (await all<KeyRec>("api_keys")).find((x) => x.provider === provider && x.is_active);
  return k ? decryptSecret(k.secret) : null;
}
export async function requireKey(provider: Provider) {
  const k = await activeKey(provider);
  if (!k) throw new HttpError(412, `Chybí API klíč pro ${PROVIDERS.find((p) => p.key === provider)?.label}. Přidej ho v Nastavení → API klíče.`);
  return k;
}
export async function keyStatus() {
  const keys = await all<KeyRec>("api_keys");
  return PROVIDERS.map((p) => {
    const k = keys.find((x) => x.provider === p.key && x.is_active);
    return { provider: p.key, label: p.label, configured: !!k, source: k ? "db" : null, key: k ? publicKey(k) : null };
  });
}
export async function hasKey(p: Provider) {
  return (await all<KeyRec>("api_keys")).some((x) => x.provider === p && x.is_active);
}

// ---------------- log a spotřeba ----------------
export async function logActivity(userId: number | null, action: string, entity?: string | null, entityId?: number | null, detail?: string) {
  await add("activity", { user_id: userId, action, entity: entity ?? null, entity_id: entityId ?? null, detail: detail ?? null, created_at: nowIso() });
}
export async function recordUsage(provider: string, model: string, task: string, u: { input?: number; output?: number; chars?: number; ok?: boolean }) {
  const m = CLAUDE_MODELS.find((x) => x.id === model);
  let cost = 0;
  if (provider === "anthropic" && m) cost = ((u.input ?? 0) * m.input + (u.output ?? 0) * m.output) / 1_000_000;
  if (provider === "elevenlabs") cost = ((u.chars ?? 0) / 1000) * 0.3;
  await add("api_usage", { provider, model, task, input_tokens: u.input ?? 0, output_tokens: u.output ?? 0, characters: u.chars ?? 0, cost_usd: cost, ok: u.ok === false ? 0 : 1, created_at: nowIso() });
}

// ---------------- seed ----------------
const CHAPTERS: [number, string, string][] = [
  [1, "Proč odkládáme", "Smyčka: úkol → pocit → útěk → úleva → výčitky"],
  [2, "Pravidlo pěti minut", "5 minut, pak smíš přestat; Mlha vs. krok"],
  [3, "Mobil", "Vyhrává vzdálenost, ne vůle; pravidla když–pak"],
  [4, "Zkouškové", "Plán na 14 dní; když zbývají 3 dny: třiď, začni častým, pusť zbytek, spi"],
  [5, "Bakalářská práce", "Osnova, ošklivý draft, 25 minut denně"],
  [6, "Perfekcionismus", "„Hotové se dá vylepšit. Nezačaté ne.“"],
  [7, "Když to nevyjde", "Nedoháněj, zmenši, vrať se"],
  [8, "Tvůj plán", "Bloky 25 + 5 minut, nedělní revize"],
];
let seeded: Promise<void> | null = null;
export function ensureSeed() {
  if (!seeded) seeded = (async () => {
    if (await get("kv", "seeded")) return;
    for (const [n, title, idea] of CHAPTERS) await put("chapters", { n, title, idea, body: "" });
    let i = 0;
    for (const p of DEFAULT_POSES) await put("poses", { key: p.key, file_name: p.file, usage: p.usage, kind: p.kind, in_script: p.inScript ? 1 : 0, processed: 0, source: 0, updated_at: null, order: i++ });
    await add("voice_profiles", { name: "Josef — Multilingual v2", voice_id: "", voice_name: "Josef", model_id: "eleven_multilingual_v2", use_tags: 0, stability: 0.4, similarity: 0.75, style: 0.2, speed: 1.05, speaker_boost: 1, stability_emotion: 0.45, stability_normal: 0.5, stability_tips: 0.55, notes: "Použito u obou hotových videí. Bez audio tagů. Doplň voice_id v Nastavení → Hlasy.", is_default: 1, created_at: nowIso() });
    await add("voice_profiles", { name: "Cílový — Eleven v3 s tagy", voice_id: "", voice_name: "", model_id: "eleven_v3", use_tags: 1, stability: 0.5, similarity: 0.75, style: 0, speed: 1, speaker_boost: 1, stability_emotion: 0.45, stability_normal: 0.5, stability_tips: 0.55, notes: "Cílový setup: tagy [confident], [sighs], [softly, warm]. Stability 45 % emoce · 50 % běžný text · 55 % tipy.", is_default: 0, created_at: nowIso() });
    if ((await count("videos")) === 0) {
      const base = { script: null, script_locked: 0, voice_profile_id: 1, spec: null, timeline: null, audio_stale: 0, approved_at: null, published_at: null, created_by: null, created_at: nowIso(), updated_at: nowIso() };
      await add("videos", { ...base, number: "01", title: "Nejsi líný", slug: "Nejsi_liny", chapter: 1, hook_type: "myth", status: "done", angle: "Smyčka odkládání: nejsi líný, utíkáš od pocitu.", publish_info: { legacy: true, file: "Jeste5minut_nejsi-liny_v2.mp4", duration_s: 34.6, scenes: 7, version: 2, note: "v2 (opraven uříznutý konec zvuku)" } });
      await add("videos", { ...base, number: "02", title: "3 dny do zkoušky", slug: "3_Dny_do_zkousky", chapter: 4, hook_type: "scene", status: "done", angle: "Když zbývají 3 dny: třiď, začni častým, pusť zbytek, spi.", publish_info: { legacy: true, file: "Scenar_02_3_Dny_do_zkousky_J5M_26_v1.mp4", duration_s: 34.4, scenes: 8, version: 1 } });
    }
    await put("kv", { key: "seeded", at: nowIso() });
  })();
  return seeded;
}

// ---------------- TOTP (WebCrypto HMAC-SHA1) ----------------
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function newTotpSecret() {
  const buf = rnd(20);
  let bits = 0, value = 0, out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function b32decode(s: string) {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const i = B32.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}
async function hotp(secret: Uint8Array, counter: number) {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey("raw", bs(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1_000_000).padStart(6, "0");
}
export async function verifyTotp(secret: string, code: string) {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  const step = Math.floor(Date.now() / 30000);
  for (let w = -1; w <= 1; w++) if ((await hotp(b32decode(secret), step + w)) === c) return true;
  return false;
}
