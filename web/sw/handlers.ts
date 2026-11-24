// Všechny api/* endpointy statické verze — stejné rozhraní jako Next.js route handlery.
import QRCode from "qrcode";
import { add, all, count, del, delBlob, get, getBlob, nowIso, patch, put, putBlob } from "./db";
import {
  HttpError, activeKey, createSession, currentUser, decryptSecret, destroySession, encryptSecret, ensureSeed, getSettings, hasKey, hashPassword,
  keyStatus, logActivity, newTotpSecret, publicKey, publicUser, readSession, saveSettings, sessionVault, unwrapVault, verifyPassword,
  verifyTotp, wrapVault, deepMerge, type KeyRec, type UserRec,
} from "./core";
import {
  anthropic, applyRevision, callClaude, checks, elModels, elSubscription, elVoices, exportNames, generateForVideo, getVideo, markdowns, nextNumber,
  previewConfig, refreshAudioStatus, regenerateScene, saveScript, setStatus, specCfg, specFor, suggestTopics, systemPrompt, takes, tts, voiceProfile,
  type RenderRec, type TakeRec, type VideoRec,
} from "./services";
import { DEFAULT_SETTINGS, type SettingsGroup } from "@/lib/settings-defaults";
import { PROVIDERS, VIDEO_STATUSES, type Provider } from "@/lib/constants";
import { normalizeScript, ScriptSchema, slugify, type Script } from "@/lib/script";
import { sampleScript } from "@/lib/sample";
import { applyPronunciation, partTextFor, stripAllTags, type VoiceProfile } from "@/lib/outputs";
import { pageJob, broadcast } from "./bridge";

type Ctx = { req: Request; url: URL; params: Record<string, string>; user: UserRec };
type H = (c: Ctx) => Promise<unknown>;
type Route = { method: string; pattern: RegExp; keys: string[]; h: H; role: "public" | "viewer" | "editor" | "admin" };
const routes: Route[] = [];
function on(method: string, path: string, h: H, role?: Route["role"]) {
  const keys: string[] = [];
  const pattern = new RegExp("^" + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$");
  routes.push({ method, pattern, keys, h, role: role ?? (method === "GET" ? "viewer" : "editor") });
}
const RANK = { public: -1, viewer: 0, editor: 1, admin: 2 } as const;

export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data ?? { ok: true }), { status, headers: { "content-type": "application/json" } });
const body = async <T = Record<string, unknown>>(r: Request): Promise<T> => {
  try {
    return (await r.json()) as T;
  } catch {
    throw new HttpError(400, "Neplatné JSON tělo");
  }
};
const file = (data: Blob | string, name: string, type: string, inline = false) =>
  new Response(data, { headers: { "content-type": type, "content-disposition": `${inline ? "inline" : "attachment"}; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`, "cache-control": "no-cache" } });

export async function handle(req: Request, path: string): Promise<Response> {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = path.match(r.pattern);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      let user = null as UserRec | null;
      if (r.role !== "public") {
        const s = await currentUser();
        if (!s) throw new HttpError(401, "Nepřihlášen");
        user = s.user;
        await patch("kv", "session", { last_seen_at: nowIso() });
        if (RANK[user.role] < RANK[r.role]) throw new HttpError(403, "Nedostatečná oprávnění");
      }
      const out = await r.h({ req, url, params, user: user! });
      return out instanceof Response ? out : json(out);
    }
    throw new HttpError(404, `Neznámý endpoint ${req.method} ${path}`);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, details: e.details }, e.status);
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

const vid = (c: Ctx) => Number(c.params.id);
const validatePassword = (pw: string) => {
  if (typeof pw !== "string" || pw.length < 10) throw new HttpError(400, "Heslo musí mít aspoň 10 znaků.");
  if (!/[A-Za-zÀ-ž]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, "Heslo musí obsahovat písmena i číslice.");
};
const validateEmail = (e: string) => {
  if (typeof e !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new HttpError(400, "Neplatný e-mail.");
  return e.trim().toLowerCase();
};

// ================= auth =================
const attempts = new Map<string, { n: number; until: number }>();
on("GET", "auth/state", async () => {
  const s = await readSession();
  return { setup_needed: (await count("users")) === 0, user: s && !s.s.pending_2fa ? publicUser(s.user) : null, pending_2fa: !!s?.s.pending_2fa };
}, "public");
on("POST", "auth/setup", async ({ req }) => {
  if ((await count("users")) > 0) throw new HttpError(403, "Aplikace už je nastavená. Přihlas se.");
  const b = await body<{ name?: string; email?: string; password?: string }>(req);
  const email = validateEmail(b.email ?? "");
  validatePassword(b.password ?? "");
  const vault = crypto.getRandomValues(new Uint8Array(32));
  const id = await add("users", { email, name: (b.name ?? "").trim() || email.split("@")[0], role: "admin", pw: await hashPassword(b.password!), vault: await wrapVault(vault, b.password!), totp_secret: null, totp_enabled: 0, active: 1, created_at: nowIso(), last_login_at: nowIso() });
  await createSession(id, vault);
  await logActivity(id, "auth.setup", "user", id, "Vytvořen první účet (admin)");
  return { ok: true };
}, "public");
on("POST", "auth/login", async ({ req }) => {
  const b = await body<{ email?: string; password?: string }>(req);
  const email = (b.email ?? "").trim().toLowerCase();
  const sec = await getSettings("security");
  const a = attempts.get(email);
  if (a && a.until > Date.now()) throw new HttpError(429, `Příliš mnoho pokusů. Zkus to znovu za ${Math.ceil((a.until - Date.now()) / 60000)} min.`);
  const u = (await all<UserRec>("users")).find((x) => x.email === email);
  const ok = u && u.active ? await verifyPassword(b.password ?? "", u.pw) : false;
  if (!u || !ok) {
    const cur = attempts.get(email) ?? { n: 0, until: 0 };
    cur.n++;
    if (cur.n >= sec.max_login_attempts) {
      cur.until = Date.now() + sec.lockout_minutes * 60000;
      cur.n = 0;
    }
    attempts.set(email, cur);
    if (u) await logActivity(u.id, "auth.failed", "user", u.id, "prohlížeč");
    throw new HttpError(401, "Nesprávný e-mail nebo heslo.");
  }
  attempts.delete(email);
  const vault = u.vault ? await unwrapVault(u.vault, b.password!) : crypto.getRandomValues(new Uint8Array(32));
  if (u.totp_enabled) {
    await createSession(u.id, vault, true);
    return { twofa: true };
  }
  await createSession(u.id, vault);
  await patch("users", u.id, { last_login_at: nowIso() });
  await logActivity(u.id, "auth.login", "user", u.id, "prohlížeč");
  return { ok: true };
}, "public");
on("POST", "auth/2fa", async ({ req }) => {
  const s = await readSession();
  if (!s || !s.s.pending_2fa) throw new HttpError(401, "Přihlášení vypršelo, začni znovu.");
  const b = await body<{ code: string }>(req);
  if (!s.user.totp_secret || !(await verifyTotp(s.user.totp_secret, b.code ?? ""))) throw new HttpError(401, "Neplatný kód.");
  const days = (await getSettings("security")).session_days;
  await patch("kv", "session", { pending_2fa: false, expires_at: new Date(Date.now() + days * 86400_000).toISOString() });
  await patch("users", s.user.id, { last_login_at: nowIso() });
  await logActivity(s.user.id, "auth.login", "user", s.user.id, "prohlížeč (2FA)");
  return { ok: true };
}, "public");
on("POST", "auth/logout", async () => {
  const s = await currentUser();
  await destroySession();
  if (s) await logActivity(s.user.id, "auth.logout", "user", s.user.id);
  return { ok: true };
}, "public");

// ================= účet =================
on("GET", "account", async ({ user }) => ({ user: publicUser(user) }));
on("POST", "account", async ({ req, user }) => {
  const b = await body<{ name?: string; current_password?: string; new_password?: string }>(req);
  if (b.name?.trim()) await patch("users", user.id, { name: b.name.trim() });
  if (b.new_password) {
    if (!(await verifyPassword(b.current_password ?? "", user.pw))) throw new HttpError(400, "Současné heslo nesedí");
    validatePassword(b.new_password);
    await patch("users", user.id, { pw: await hashPassword(b.new_password), vault: await wrapVault(await sessionVault(), b.new_password) });
  }
  return { ok: true };
}, "viewer");
on("GET", "account/2fa", async ({ user }) => {
  const secret = newTotpSecret();
  if (!user.totp_enabled) await patch("users", user.id, { totp_secret: secret });
  const issuer = encodeURIComponent((await getSettings("brand")).name + " Studio");
  const uri = `otpauth://totp/${issuer}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${issuer}&digits=6&period=30`;
  const svg = await QRCode.toString(uri, { type: "svg", margin: 1, width: 220 });
  return { secret, qr: "data:image/svg+xml;base64," + btoa(svg) };
}, "viewer");
on("POST", "account/2fa", async ({ req, user }) => {
  const b = await body<{ code: string }>(req);
  const u = (await get<UserRec>("users", user.id))!;
  if (!u.totp_secret || !(await verifyTotp(u.totp_secret, b.code))) throw new HttpError(400, "Kód nesedí — zkontroluj čas v telefonu");
  await patch("users", user.id, { totp_enabled: 1 });
  return { ok: true };
}, "viewer");
on("DELETE", "account/2fa", async ({ req, user }) => {
  const b = await body<{ password: string }>(req);
  if (!(await verifyPassword(b.password ?? "", user.pw))) throw new HttpError(400, "Heslo nesedí");
  await patch("users", user.id, { totp_enabled: 0, totp_secret: null });
  return { ok: true };
}, "viewer");
on("GET", "account/sessions", async () => {
  const s = await readSession();
  return { sessions: s ? [{ id: "tento-prohlizec", created_at: s.s.created_at, last_seen_at: s.s.last_seen_at, ip: "lokálně", user_agent: s.s.ua, expires_at: s.s.expires_at, current: true }] : [] };
}, "viewer");
on("DELETE", "account/sessions", async () => ({ ok: true }), "viewer");

// ================= uživatelé =================
on("GET", "users", async () => ({ users: (await all<UserRec>("users")).map(publicUser) }), "admin");
on("POST", "users", async ({ req, user }) => {
  const b = await body<{ email: string; name: string; password: string; role: string }>(req);
  const email = validateEmail(b.email);
  validatePassword(b.password);
  if (!["admin", "editor", "viewer"].includes(b.role)) throw new HttpError(400, "Neplatná role");
  if ((await all<UserRec>("users")).some((u) => u.email === email)) throw new HttpError(409, "Uživatel s tímto e-mailem už existuje");
  const id = await add("users", { email, name: b.name || email.split("@")[0], role: b.role, pw: await hashPassword(b.password), vault: await wrapVault(await sessionVault(), b.password), totp_secret: null, totp_enabled: 0, active: 1, created_at: nowIso(), last_login_at: null });
  await logActivity(user.id, "user.create", "user", id, email);
  return { id };
}, "admin");
on("PATCH", "users/:id", async (c) => {
  const id = vid(c);
  const b = await body<{ role?: string; active?: boolean; password?: string; name?: string; reset_2fa?: boolean }>(c.req);
  const users = await all<UserRec>("users");
  const target = users.find((u) => u.id === id);
  if (!target) throw new HttpError(404, "Uživatel nenalezen");
  const admins = users.filter((u) => u.role === "admin" && u.active).length;
  if (target.role === "admin" && ((b.role && b.role !== "admin") || b.active === false) && admins <= 1) throw new HttpError(400, "Musí zůstat aspoň jeden aktivní správce");
  const p: Partial<UserRec> = {};
  if (b.role) p.role = b.role as UserRec["role"];
  if (b.name) p.name = b.name;
  if (b.active !== undefined) p.active = b.active ? 1 : 0;
  if (b.password) {
    validatePassword(b.password);
    p.pw = await hashPassword(b.password);
    p.vault = await wrapVault(await sessionVault(), b.password);
  }
  if (b.reset_2fa) Object.assign(p, { totp_enabled: 0, totp_secret: null });
  await patch("users", id, p);
  return { ok: true };
}, "admin");
on("DELETE", "users/:id", async (c) => {
  if (vid(c) === c.user.id) throw new HttpError(400, "Sám sebe smazat nemůžeš");
  await del("users", vid(c));
  return { ok: true };
}, "admin");

// ================= nastavení =================
const groups = Object.keys(DEFAULT_SETTINGS) as SettingsGroup[];
const grp = (g: string) => {
  if (!groups.includes(g as SettingsGroup)) throw new HttpError(404, "Neznámá skupina nastavení");
  return g as SettingsGroup;
};
on("GET", "settings/:group", async ({ params }) => ({ value: await getSettings(grp(params.group)), defaults: DEFAULT_SETTINGS[grp(params.group)] }));
on("PUT", "settings/:group", async ({ params, req, user }) => {
  const g = grp(params.group);
  if (g === "security" && user.role !== "admin") throw new HttpError(403, "Jen správce");
  const b = await body<{ value: unknown }>(req);
  const value = await saveSettings(g, b.value);
  await logActivity(user.id, "settings.save", "settings", null, g);
  return { value };
});
on("DELETE", "settings/:group", async ({ params, user }) => {
  const g = grp(params.group);
  await del("settings", g);
  await logActivity(user.id, "settings.save", "settings", null, `${g} → výchozí`);
  return { value: await getSettings(g) };
}, "admin");

// ================= API klíče =================
on("GET", "keys", async () => ({ keys: (await all<KeyRec>("api_keys")).map(publicKey), status: await keyStatus() }));
on("POST", "keys", async ({ req, user }) => {
  const b = await body<{ provider: Provider; label: string; secret: string; activate?: boolean }>(req);
  if (!PROVIDERS.some((p) => p.key === b.provider)) throw new HttpError(400, "Neznámý poskytovatel");
  const secret = (b.secret ?? "").trim();
  if (secret.length < 8) throw new HttpError(400, "Klíč je příliš krátký");
  const id = await add("api_keys", { provider: b.provider, label: b.label || "Klíč", secret: await encryptSecret(secret), last4: secret.slice(-4), is_active: 0, last_tested_at: null, test_status: null, test_message: null, created_at: nowIso() });
  const keys = await all<KeyRec>("api_keys");
  if (b.activate || !keys.some((k) => k.provider === b.provider && k.is_active)) await activate(id);
  await logActivity(user.id, "key.add", "api_key", id, `${b.provider}: ${b.label}`);
  return { id };
}, "admin");
async function activate(id: number) {
  const keys = await all<KeyRec>("api_keys");
  const k = keys.find((x) => x.id === id);
  if (!k) throw new HttpError(404, "Klíč nenalezen");
  for (const x of keys.filter((x) => x.provider === k.provider)) await put("api_keys", { ...x, is_active: x.id === id ? 1 : 0 });
}
on("PATCH", "keys/:id", async (c) => {
  const b = await body<{ active?: boolean; label?: string }>(c.req);
  if (b.active) await activate(vid(c));
  if (b.label) await patch("api_keys", vid(c), { label: b.label });
  return { ok: true };
}, "admin");
on("DELETE", "keys/:id", async (c) => {
  await del("api_keys", vid(c));
  await logActivity(c.user.id, "key.delete", "api_key", vid(c));
  return { ok: true };
}, "admin");
on("POST", "keys/:id/test", async (c) => {
  const k = await get<KeyRec>("api_keys", vid(c));
  if (!k) throw new HttpError(404, "Klíč nenalezen");
  const secret = await decryptSecret(k.secret);
  let ok = true, message = "";
  try {
    if (k.provider === "anthropic") {
      const page = await anthropic(secret).models.list({ limit: 20 });
      message = `OK · ${page.data.length} modelů dostupných (${page.data.slice(0, 3).map((m) => m.id).join(", ")}…)`;
    } else {
      const s = await elSubscription(secret);
      message = `OK · ${s.tier} · ${s.character_count.toLocaleString("cs-CZ")}/${s.character_limit.toLocaleString("cs-CZ")} znaků`;
    }
  } catch (e) {
    ok = false;
    message = e instanceof Error ? e.message : String(e);
  }
  await patch("api_keys", k.id, { last_tested_at: nowIso(), test_status: ok ? "ok" : "error", test_message: message.slice(0, 500) });
  return { ok, message };
}, "admin");

// ================= hlasy =================
const VFIELDS = ["name", "voice_id", "voice_name", "model_id", "use_tags", "stability", "similarity", "style", "speed", "speaker_boost", "stability_emotion", "stability_normal", "stability_tips", "notes"];
const num01 = (v: unknown) => (typeof v === "boolean" ? (v ? 1 : 0) : v);
on("GET", "voices", async () => ({ profiles: (await all<VoiceProfile>("voice_profiles")).sort((a, b) => b.is_default - a.is_default || a.id - b.id) }));
on("POST", "voices", async ({ req }) => {
  const b = await body<Record<string, unknown>>(req);
  const base = { name: "Nový profil", voice_id: "", voice_name: "", model_id: "eleven_multilingual_v2", use_tags: 0, stability: 0.5, similarity: 0.75, style: 0, speed: 1, speaker_boost: 1, stability_emotion: 0.45, stability_normal: 0.5, stability_tips: 0.55, notes: "", is_default: 0 };
  for (const f of VFIELDS) if (b[f] !== undefined) (base as Record<string, unknown>)[f] = num01(b[f]);
  return { id: await add("voice_profiles", { ...base, created_at: nowIso() }) };
});
on("PATCH", "voices/:id", async (c) => {
  const b = await body<Record<string, unknown>>(c.req);
  const p: Record<string, unknown> = {};
  for (const f of VFIELDS) if (b[f] !== undefined) p[f] = num01(b[f]);
  await patch("voice_profiles", vid(c), p);
  if (b.is_default) for (const x of await all<VoiceProfile>("voice_profiles")) await put("voice_profiles", { ...x, is_default: x.id === vid(c) ? 1 : 0 });
  return { ok: true };
});
on("DELETE", "voices/:id", async (c) => {
  const ps = await all<VoiceProfile>("voice_profiles");
  if (ps.length <= 1) throw new HttpError(400, "Musí zůstat aspoň jeden profil");
  await del("voice_profiles", vid(c));
  const rest = ps.filter((p) => p.id !== vid(c));
  if (!rest.some((p) => p.is_default)) await patch("voice_profiles", rest[0].id, { is_default: 1 });
  return { ok: true };
});
on("GET", "elevenlabs/voices", async () => ({ voices: await elVoices() }));
on("GET", "elevenlabs/models", async () => ({ models: await elModels() }));
on("GET", "elevenlabs/subscription", async () => elSubscription());
on("POST", "elevenlabs/tts", async ({ req }) => {
  const b = await body<{ text: string; voice_id: string; model_id: string; stability: number; similarity: number; style: number; speed: number; speaker_boost: boolean; use_tags: boolean }>(req);
  if (!b.text?.trim()) throw new HttpError(400, "Zadej text");
  if (b.text.length > 1500) throw new HttpError(400, "Max 1500 znaků v laboratoři");
  const text = applyPronunciation(b.use_tags ? b.text : stripAllTags(b.text), (await getSettings("content")).pronunciation);
  return new Response(await tts({ voice_id: b.voice_id, model_id: b.model_id, similarity: b.similarity, style: b.style, speed: b.speed, speaker_boost: b.speaker_boost ? 1 : 0 }, text, b.stability), { headers: { "content-type": "audio/mpeg" } });
});

// ================= Claude =================
on("GET", "llm/models", async () => {
  const key = await activeKey("anthropic");
  if (!key) throw new HttpError(412, "Chybí API klíč pro Anthropic.");
  const out: { id: string; display_name: string }[] = [];
  for await (const m of anthropic(key).models.list({ limit: 100 })) out.push({ id: m.id, display_name: m.display_name });
  return { models: out };
});
on("POST", "llm/playground", async ({ req }) => {
  const b = await body<{ prompt: string; system?: string; use_app_system?: boolean; model?: string; effort?: string; max_tokens?: number }>(req);
  if (!b.prompt?.trim()) throw new HttpError(400, "Zadej prompt");
  const system = b.use_app_system ? (await systemPrompt()) + (b.system ? `\n\n${b.system}` : "") : b.system || "Jsi užitečný asistent. Odpovídej česky.";
  const r = await callClaude({ task: "playground", system, content: [{ type: "text", text: b.prompt }], override: { model: b.model, effort: b.effort, max_tokens: b.max_tokens } });
  return { text: r.text, model: r.model, usage: r.usage, ms: r.ms };
});

// ================= témata =================
type TopicRec = { id: number; chapter: number; hook_type: string; title: string; angle: string; hook_line: string; status: string; video_id: number | null; created_at: string };
on("GET", "topics", async () => {
  const vs = await all<VideoRec>("videos");
  const ts = (await all<TopicRec>("topics")).map((t) => ({ ...t, video_number: vs.find((v) => v.id === t.video_id)?.number ?? null }));
  return { topics: ts.sort((a, b) => Number(a.status === "used") - Number(b.status === "used") || b.id - a.id) };
});
on("POST", "topics", async ({ req }) => {
  const b = await body<{ topics: Partial<TopicRec>[] }>(req);
  for (const t of b.topics ?? []) if (t.title?.trim()) await add("topics", { chapter: t.chapter, hook_type: t.hook_type, title: t.title.trim(), angle: t.angle ?? "", hook_line: t.hook_line ?? "", status: "backlog", video_id: null, created_at: nowIso() });
  return { ok: true };
});
on("POST", "topics/generate", async ({ req, user }) => {
  const b = await body<{ count?: number; chapter?: number | null; hook_type?: string | null; custom?: string; save?: boolean }>(req);
  const topics = await suggestTopics({ count: Math.max(1, Math.min(15, b.count ?? 5)), chapter: b.chapter, hook_type: b.hook_type, custom: b.custom });
  if (b.save) for (const t of topics) await add("topics", { ...t, status: "backlog", video_id: null, created_at: nowIso() });
  await logActivity(user.id, "topics.generate", null, null, `${topics.length} témat${b.save ? " do zásobníku" : ""}`);
  return { topics };
});
on("PATCH", "topics/:id", async (c) => {
  await patch("topics", vid(c), await body(c.req));
  return { ok: true };
});
on("DELETE", "topics/:id", async (c) => {
  await del("topics", vid(c));
  return { ok: true };
});

// ================= videa =================
on("GET", "videos", async () => ({ videos: (await all<VideoRec>("videos")).sort((a, b) => parseInt(b.number) - parseInt(a.number)) }));
on("POST", "videos", async ({ req, user }) => {
  const b = await body<{ title?: string; chapter?: number; hook_type?: string; angle?: string; topic_id?: number; generate?: boolean; sample?: boolean }>(req);
  let { title = "", chapter = 1, hook_type = "scene", angle = "" } = b;
  if (b.topic_id) {
    const t = await get<TopicRec>("topics", b.topic_id);
    if (!t) throw new HttpError(404, "Téma nenalezeno");
    ({ chapter, hook_type, title } = t);
    angle = [t.angle, t.hook_line && `Hook: „${t.hook_line}“`].filter(Boolean).join(" ");
  }
  if (!title.trim()) throw new HttpError(400, "Zadej název");
  const number = await nextNumber();
  const def = await voiceProfile(null);
  const id = await add("videos", { number, title: title.trim(), slug: slugify(title), chapter, hook_type, angle, status: "idea", script: null, script_locked: 0, voice_profile_id: def?.id ?? null, spec: null, timeline: null, audio_stale: 0, approved_at: null, published_at: null, publish_info: null, created_by: user.id, created_at: nowIso(), updated_at: nowIso() });
  if (b.topic_id) await patch("topics", b.topic_id, { status: "used", video_id: id });
  await logActivity(user.id, "video.create", "video", id, `${number} ${title}`);
  if (b.sample) {
    await saveScript(id, normalizeScript(sampleScript(number)), "sample");
    await setStatus(id, "script");
  } else if (b.generate) {
    try {
      await generateForVideo(id, user.id);
    } catch (e) {
      return { id, warning: e instanceof Error ? e.message : String(e) };
    }
  }
  return { id };
});
on("GET", "videos/:id", async (c) => {
  const v = await getVideo(vid(c));
  const renders = (await all<RenderRec>("renders")).filter((r) => r.video_id === v.id).sort((a, b) => b.version - a.version);
  await staleRenders(renders);
  return {
    video: { ...v, script: undefined, spec: undefined, timeline: undefined },
    script: v.script,
    checks: v.script ? await checks(v.script) : [],
    takes: await takes(v.id),
    renders: renders.map(({ log: _l, spec: _s, timeline: _t, ...r }) => r),
    revisions: (await all<{ video_id: number; id: number }>("revisions")).filter((r) => r.video_id === v.id).sort((a, b) => b.id - a.id),
    versions: (await all<{ video_id: number; id: number; source: string; note: string; created_at: string }>("script_versions")).filter((r) => r.video_id === v.id).sort((a, b) => b.id - a.id).slice(0, 30).map(({ id, source, note, created_at }) => ({ id, source, note, created_at })),
    timeline: v.timeline,
  };
});
on("PATCH", "videos/:id", async (c) => {
  const v = await getVideo(vid(c));
  const b = await body<Partial<VideoRec>>(c.req);
  const p: Partial<VideoRec> = { updated_at: nowIso() };
  if (b.title !== undefined) Object.assign(p, { title: b.title, slug: slugify(b.title) });
  for (const k of ["angle", "chapter", "hook_type", "voice_profile_id", "status"] as const) if (b[k] !== undefined) (p as Record<string, unknown>)[k] = b[k];
  await patch("videos", v.id, p);
  return { ok: true };
});
on("DELETE", "videos/:id", async (c) => {
  const v = await getVideo(vid(c));
  for (const t of await takes(v.id)) {
    await delBlob(`take-${t.id}`);
    await del("audio_takes", t.id);
  }
  for (const r of (await all<RenderRec>("renders")).filter((r) => r.video_id === v.id)) {
    await delBlob(`render-${r.id}-mp4`);
    await delBlob(`render-${r.id}-sheet`);
    await del("renders", r.id);
  }
  for (const t of (await all<TopicRec>("topics")).filter((t) => t.video_id === v.id)) await patch("topics", t.id, { status: "backlog", video_id: null });
  await del("videos", v.id);
  await logActivity(c.user.id, "video.delete", "video", null, `${v.number} ${v.title}`);
  return { ok: true };
});
on("POST", "videos/:id/generate", async (c) => generateForVideo(vid(c), c.user.id));

async function saveEdited(id: number, raw: unknown, userId: number, source = "edit") {
  const parsed = ScriptSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "Scénář neodpovídá schématu", parsed.error.issues.slice(0, 5));
  const v = await getVideo(id);
  const script = normalizeScript({ ...parsed.data, id: v.number });
  const sig = (s: Script) => JSON.stringify({ sp: s.scenes.map((x) => x.spoken), ap: s.audio_parts.map((p) => [p.scenes, p.tagged_text]) });
  if (v.script_locked && v.script && sig(v.script) !== sig(script)) throw new HttpError(409, "Scénář je schválený — změna mluveného textu = nové audio. Odemkni ho, pokud chceš měnit text.");
  await saveScript(id, script, source);
  if (v.status === "idea") await setStatus(id, "script");
  await logActivity(userId, "video.save", "video", id);
  return { script, checks: await checks(script) };
}
on("PUT", "videos/:id/script", async (c) => saveEdited(vid(c), (await body<{ script: unknown }>(c.req)).script, c.user.id));
on("POST", "videos/:id/script", async (c) => {
  const v = await getVideo(vid(c));
  return saveEdited(v.id, normalizeScript(sampleScript(v.number)), c.user.id, "sample");
});
on("POST", "videos/:id/scene", async (c) => {
  const b = await body<{ n: number; instruction?: string; script?: Script }>(c.req);
  const v = await getVideo(vid(c));
  if (v.script_locked) throw new HttpError(409, "Scénář je schválený.");
  const s = b.script ?? v.script;
  if (!s) throw new HttpError(400, "Video nemá scénář");
  return { scene: { ...(await regenerateScene(s, b.n, b.instruction ?? "")), n: b.n } };
});
on("POST", "videos/:id/approve", async (c) => {
  const v = await getVideo(vid(c));
  if (!v.script) throw new HttpError(400, "Video nemá scénář");
  const errors = (await checks(v.script)).filter((x) => x.level === "error");
  if (errors.length) throw new HttpError(422, `Scénář má ${errors.length} chyb(y) — oprav je před schválením.`, errors);
  const hasAudio = (await takes(v.id)).some((t) => t.selected);
  await patch("videos", v.id, { script_locked: 1, approved_at: nowIso(), audio_stale: 0, status: hasAudio ? "awaiting_audio" : "approved", updated_at: nowIso() });
  await logActivity(c.user.id, "video.approve", "video", v.id, v.script.title);
  return { ok: true };
});
on("POST", "videos/:id/unlock", async (c) => {
  const v = await getVideo(vid(c));
  await patch("videos", v.id, { script_locked: 0, audio_stale: (await takes(v.id)).length ? 1 : 0, status: "script", updated_at: nowIso() });
  await logActivity(c.user.id, "video.unlock", "video", v.id);
  return { ok: true };
});
on("GET", "videos/:id/markdown", async (c) => markdowns(await getVideo(vid(c))));

async function startRender(id: number, userId: number, notes = "") {
  const v = await getVideo(id);
  if (!v.script) throw new HttpError(400, "Video nemá scénář");
  if (!v.script_locked) throw new HttpError(409, "Nejdřív schval scénář.");
  const sel = (await takes(id)).filter((t) => t.selected).map((t) => t.part);
  const missing = v.script.audio_parts.filter((p) => !sel.includes(p.part)).map((p) => `cast${p.part}.mp3`);
  if (missing.length) throw new HttpError(409, `Chybí audio: ${missing.join(", ")}`);
  const rs = (await all<RenderRec>("renders")).filter((r) => r.video_id === id);
  await staleRenders(rs);
  if (rs.some((r) => r.status === "queued" || r.status === "running")) throw new HttpError(409, "Render tohoto videa už běží.");
  const version = Math.max(0, ...rs.map((r) => r.version)) + 1;
  const rid = await add("renders", { video_id: id, version, status: "queued", stage: "", progress: 0, log: "", qa: null, spec: null, timeline: null, notes, duration_s: null, render_seconds: null, has_output: 0, has_sheet: 0, created_by: userId, created_at: nowIso(), finished_at: null, heartbeat: Date.now() });
  if (v.status !== "published") await setStatus(id, "render");
  await logActivity(userId, "render.start", "video", id, `v${version}`);
  broadcast({ type: "render", id: rid });
  return { id: rid, version };
}
/** Render běží ve stránce — když přestane posílat heartbeat (zavřená karta), označí se jako přerušený. */
async function staleRenders(rs: RenderRec[]) {
  for (const r of rs) {
    if ((r.status === "running" || r.status === "queued") && Date.now() - (r.heartbeat ?? 0) > 45_000) {
      r.status = "error";
      r.log += "Přerušeno — karta s renderem byla zavřena.\n";
      await put("renders", r);
    }
  }
}
on("POST", "videos/:id/render", async (c) => {
  const b = await body<{ notes?: string }>(c.req).catch(() => ({ notes: "" }));
  return startRender(vid(c), c.user.id, b.notes ?? "");
});
on("POST", "videos/:id/revise", async (c) => {
  const id = vid(c);
  const b = await body<{ comments: { scene: number | null; comment: string }[]; render_version?: number; render?: boolean; preview?: boolean }>(c.req);
  const comments = (b.comments ?? []).filter((x) => x.comment?.trim());
  if (!comments.length) throw new HttpError(400, "Napiš aspoň jednu připomínku");
  const v = await getVideo(id);
  if (!v.script) throw new HttpError(400, "Video nemá scénář");
  const r = await applyRevision(v.script, comments, !!v.script_locked);
  const next = normalizeScript({ ...r.script, id: v.number });
  if (b.preview) return { summary: r.summary, script: next, checks: await checks(next) };
  const saved = await saveEdited(id, next, c.user.id, "revision");
  for (const x of comments) await add("revisions", { video_id: id, render_version: b.render_version ?? null, scene: x.scene, comment: x.comment, patch: r.summary, status: "applied", created_by: c.user.id, created_at: nowIso() });
  await logActivity(c.user.id, "video.revise", "video", id, r.summary.slice(0, 200));
  const render = b.render ? await startRender(id, c.user.id, `Připomínky: ${comments.map((x) => x.comment).join("; ").slice(0, 300)}`) : null;
  return { summary: r.summary, checks: saved.checks, render };
});
on("POST", "videos/:id/publish", async (c) => {
  const v = await getVideo(vid(c));
  const b = await body<{ published: boolean; date?: string; platforms?: Record<string, { done: boolean; url?: string }>; version?: number }>(c.req);
  const prev = v.publish_info ?? {};
  const info = { ...prev, platforms: b.platforms ?? prev.platforms ?? {}, version: b.version ?? prev.version };
  if (b.published) {
    await patch("videos", v.id, { status: "published", published_at: b.date || nowIso(), publish_info: info, updated_at: nowIso() });
    await logActivity(c.user.id, "video.publish", "video", v.id, Object.entries(info.platforms as Record<string, { done: boolean }>).filter(([, x]) => x.done).map(([k]) => k).join(", "));
  } else await patch("videos", v.id, { status: v.status === "published" ? "done" : v.status, published_at: null, publish_info: info });
  return { ok: true };
});

// ---- audio ----
on("POST", "videos/:id/audio", async (c) => {
  const id = vid(c);
  await getVideo(id);
  const fd = await c.req.formData();
  const files = fd.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) throw new HttpError(400, "Chybí soubor");
  const forced = fd.get("part") ? Number(fd.get("part")) : null;
  const added = [];
  for (const f of files) {
    if (f.size > 50 * 1024 * 1024) throw new HttpError(413, `${f.name}: max 50 MB`);
    const part = forced ?? Number(f.name.match(/cast\s*_?(\d+)/i)?.[1] ?? f.name.match(/(\d+)/)?.[1] ?? NaN);
    if (!part || part < 1 || part > 4) throw new HttpError(400, `${f.name}: nepoznám číslo části — pojmenuj soubor cast1.mp3 … cast4.mp3`);
    const hasSel = (await takes(id)).some((t) => t.part === part && t.selected);
    const tid = await add("audio_takes", { video_id: id, part, original_name: f.name, source: "upload", duration_s: null, selected: hasSel ? 0 : 1, meta: null, created_at: nowIso() });
    await putBlob(`take-${tid}`, f);
    let duration = 0;
    try {
      duration = (await pageJob<{ duration: number }>("probe", { blob: `take-${tid}` })).duration;
    } catch (e) {
      await del("audio_takes", tid);
      await delBlob(`take-${tid}`);
      throw new HttpError(400, `${f.name}: soubor nejde přečíst jako audio (${e instanceof Error ? e.message : e})`);
    }
    await patch("audio_takes", tid, { duration_s: duration });
    added.push({ part, name: f.name, duration });
  }
  await patch("videos", id, { audio_stale: 0 });
  await refreshAudioStatus(id);
  await logActivity(c.user.id, "video.audio", "video", id, added.map((a) => `cast${a.part}`).join(", "));
  return { added };
});
const takeOf = async (c: Ctx) => {
  const t = await get<TakeRec>("audio_takes", Number(c.params.takeId));
  if (!t || t.video_id !== vid(c)) throw new HttpError(404, "Take nenalezen");
  return t;
};
on("GET", "videos/:id/audio/:takeId", async (c) => {
  const b = await getBlob(`take-${(await takeOf(c)).id}`);
  if (!b) throw new HttpError(404, "Soubor chybí");
  return new Response(b, { headers: { "content-type": b.type || "audio/mpeg" } });
});
on("PATCH", "videos/:id/audio/:takeId", async (c) => {
  const t = await takeOf(c);
  if ((await body<{ selected?: boolean }>(c.req)).selected) {
    for (const x of (await takes(t.video_id)).filter((x) => x.part === t.part)) await patch("audio_takes", x.id, { selected: x.id === t.id ? 1 : 0 });
    await refreshAudioStatus(t.video_id);
  }
  return { ok: true };
});
on("DELETE", "videos/:id/audio/:takeId", async (c) => {
  const t = await takeOf(c);
  await del("audio_takes", t.id);
  await delBlob(`take-${t.id}`);
  if (t.selected) {
    const other = (await takes(t.video_id)).filter((x) => x.part === t.part).pop();
    if (other) await patch("audio_takes", other.id, { selected: 1 });
  }
  await refreshAudioStatus(t.video_id);
  return { ok: true };
});
on("POST", "videos/:id/tts", async (c) => {
  const id = vid(c);
  const v = await getVideo(id);
  if (!v.script) throw new HttpError(400, "Video nemá scénář");
  if (!v.script_locked) throw new HttpError(409, "Nejdřív schval scénář — změna textu = nové audio.");
  const b = await body<{ part: number; count?: number; profile_id?: number }>(c.req);
  const p = v.script.audio_parts.find((x) => x.part === b.part);
  if (!p) throw new HttpError(400, "Neznámá část");
  const profile = await voiceProfile(b.profile_id ?? v.voice_profile_id);
  if (!profile) throw new HttpError(400, "Žádný profil hlasu");
  const voice = await getSettings("voice");
  const text = partTextFor(profile, p.tagged_text, (await getSettings("content")).pronunciation);
  const n = Math.max(1, Math.min(4, b.count ?? voice.takes_per_part));
  const stability = profile.use_tags ? p.stability : profile.stability;
  const out = [];
  for (let i = 0; i < n; i++) {
    const audio = await tts(profile, text, stability, voice.output_format);
    const hasSel = (await takes(id)).some((t) => t.part === p.part && t.selected);
    const tid = await add("audio_takes", { video_id: id, part: p.part, original_name: `cast${p.part}.mp3 (take ${i + 1})`, source: "tts", duration_s: null, selected: hasSel ? 0 : 1, meta: { profile: profile.name, model: profile.model_id, stability, text }, created_at: nowIso() });
    await putBlob(`take-${tid}`, audio);
    const { duration } = await pageJob<{ duration: number }>("probe", { blob: `take-${tid}` });
    await patch("audio_takes", tid, { duration_s: duration });
    out.push({ duration });
  }
  await refreshAudioStatus(id);
  await logActivity(c.user.id, "video.tts", "video", id, `cast${p.part} × ${n} (${profile.name})`);
  return { takes: out };
});

// ---- soubory ----
on("GET", "videos/:id/files/:kind", async (c) => {
  const v = await getVideo(vid(c));
  const inline = c.url.searchParams.get("inline") === "1";
  switch (c.params.kind) {
    case "elevenlabs":
    case "strih": {
      const md = (await markdowns(v))[c.params.kind];
      return file(md.content, md.name, "text/markdown; charset=utf-8", inline);
    }
    case "script":
      if (!v.script) throw new HttpError(404, "Bez scénáře");
      return file(JSON.stringify(v.script, null, 2), `Scenar_${v.number}_${v.slug}.json`, "application/json", inline);
    case "spec":
      return file(JSON.stringify(await specFor(v), null, 2), `video_spec_scenar${v.number}.json`, "application/json", inline);
    case "timeline":
      if (!v.timeline) throw new HttpError(404, "Timeline vznikne při renderu");
      return file(JSON.stringify(v.timeline, null, 2), `timeline_scenar${v.number}.json`, "application/json", inline);
    case "mp4":
    case "sheet": {
      const ver = c.url.searchParams.get("v");
      const rs = (await all<RenderRec>("renders")).filter((r) => r.video_id === v.id && r.has_output).sort((a, b) => b.version - a.version);
      const r = ver ? rs.find((x) => x.version === Number(ver)) : rs[0];
      if (!r) throw new HttpError(404, "Render nenalezen");
      if (c.params.kind === "sheet") {
        const b = await getBlob(`render-${r.id}-sheet`);
        if (!b) throw new HttpError(404, "Kontaktní arch chybí");
        return file(b, `Scenar_${v.number}_${v.slug}_v${r.version}_kontakt.png`, "image/png", inline);
      }
      const b = await getBlob(`render-${r.id}-mp4`);
      if (!b) throw new HttpError(404, "MP4 chybí");
      const range = c.req.headers.get("range");
      if (range) {
        const m = range.match(/bytes=(\d*)-(\d*)/);
        const start = m?.[1] ? Number(m[1]) : 0;
        const end = m?.[2] ? Math.min(Number(m[2]), b.size - 1) : b.size - 1;
        return new Response(b.slice(start, end + 1), { status: 206, headers: { "content-type": "video/mp4", "content-range": `bytes ${start}-${end}/${b.size}`, "accept-ranges": "bytes", "content-length": String(end - start + 1) } });
      }
      const res = file(b, (await exportNames(v)).video(r.version), "video/mp4", inline);
      res.headers.set("accept-ranges", "bytes");
      return res;
    }
  }
  throw new HttpError(404, "Neznámý typ souboru");
});
on("GET", "renders/:id", async (c) => {
  const r = await get<RenderRec>("renders", vid(c));
  if (!r) throw new HttpError(404, "Render nenalezen");
  await staleRenders([r]);
  const { spec: _s, timeline: _t, ...rest } = r;
  return rest;
});
on("GET", "queue", async () => {
  const rs = (await all<RenderRec>("renders")).filter((r) => r.status === "running" || r.status === "queued");
  await staleRenders(rs);
  const live = rs.filter((r) => r.status === "running" || r.status === "queued");
  return { running: live.some((r) => r.status === "running"), queued: live.filter((r) => r.status === "queued").length };
});

// ================= pózy a assety =================
type PoseRec = { key: string; file_name: string; usage: string; kind: string; in_script: number; processed: number; source: number; updated_at: string | null; order: number };
on("GET", "poses/:key", async (c) => {
  const src = c.url.searchParams.get("source") === "1";
  const b = await getBlob(src ? `pose-src-${c.params.key}` : `pose-${c.params.key}`);
  if (!b) throw new HttpError(404, "Póza není nahraná");
  return new Response(b, { headers: { "content-type": b.type || "image/png" } });
});
on("POST", "poses/rekey", async () => {
  for (const p of await all<PoseRec>("poses")) {
    if (!p.source) continue;
    await pageJob("chroma", { key: p.key });
    await patch("poses", p.key, { updated_at: nowIso() });
  }
  return { ok: true };
});
on("POST", "poses/:key", async (c) => {
  if (!(await get<PoseRec>("poses", c.params.key))) throw new HttpError(404, "Neznámá póza");
  const f = (await c.req.formData()).get("file");
  if (!(f instanceof File)) throw new HttpError(400, "Chybí soubor");
  await putBlob(`pose-src-${c.params.key}`, f);
  await pageJob("chroma", { key: c.params.key });
  await patch("poses", c.params.key, { processed: 1, source: 1, updated_at: nowIso() });
  return { ok: true };
});
on("PATCH", "poses/:key", async (c) => {
  const b = await body<{ file_name?: string; usage?: string }>(c.req);
  await patch("poses", c.params.key, Object.fromEntries(Object.entries(b).filter(([k]) => ["file_name", "usage"].includes(k))));
  return { ok: true };
});
on("DELETE", "poses/:key", async (c) => {
  await delBlob(`pose-${c.params.key}`);
  await delBlob(`pose-src-${c.params.key}`);
  await patch("poses", c.params.key, { processed: 0, source: 0, updated_at: nowIso() });
  return { ok: true };
});
const ALLOWED: Record<string, string[]> = { ebook_pdf: ["application/pdf"], cover: ["image/png", "image/jpeg", "image/webp"], logo: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] };
on("GET", "assets/:key", async (c) => {
  const b = await getBlob(`asset-${c.params.key}`);
  if (!b) throw new HttpError(404, "Není nahráno");
  return new Response(b, { headers: { "content-type": b.type } });
});
on("POST", "assets/:key", async (c) => {
  const allowed = ALLOWED[c.params.key];
  if (!allowed) throw new HttpError(404, "Neznámý asset");
  const f = (await c.req.formData()).get("file");
  if (!(f instanceof File)) throw new HttpError(400, "Chybí soubor");
  if (!allowed.includes(f.type)) throw new HttpError(400, `Nepodporovaný typ ${f.type}`);
  if (f.size > 32 * 1024 * 1024) throw new HttpError(413, "Max 32 MB");
  await putBlob(`asset-${c.params.key}`, f);
  await put("assets", { key: c.params.key, original_name: f.name, mime: f.type, size: f.size, updated_at: nowIso() });
  return { ok: true };
});
on("DELETE", "assets/:key", async (c) => {
  await delBlob(`asset-${c.params.key}`);
  await del("assets", c.params.key);
  return { ok: true };
});
on("PUT", "chapters/:n", async (c) => {
  const b = await body<{ title: string; idea: string; body: string }>(c.req);
  await put("chapters", { n: Number(c.params.n), title: b.title, idea: b.idea, body: b.body ?? "" });
  return { ok: true };
});

// ================= systém =================
on("GET", "system/health", async () => {
  const est = await navigator.storage?.estimate?.();
  const vs = await count("videos"), rs = await count("renders"), ts = await count("audio_takes"), us = await count("users");
  return {
    node: "statická verze v prohlížeči",
    ffmpeg: "WebCodecs (H.264 + AAC v prohlížeči)",
    data_dir: "IndexedDB tohoto prohlížeče",
    data_size_mb: est?.usage ? +(est.usage / 1e6).toFixed(1) : 0,
    queue: { running: false, queued: 0 },
    counts: { videos: vs, renders: rs, takes: ts, users: us },
    app_secret_from_env: false,
  };
});
on("GET", "system/backup", async () => {
  const data: Record<string, unknown> = { exported_at: nowIso(), format: "j5m-static-1" };
  for (const s of ["settings", "chapters", "topics", "videos", "voice_profiles", "poses", "renders", "script_versions", "revisions"] as const) data[s] = await all(s);
  return file(JSON.stringify(data, null, 2), `j5m-zaloha-${nowIso().slice(0, 10)}.json`, "application/json");
}, "admin");

// ================= data pro stránky =================
const keysFlags = async () => ({ anthropic: await hasKey("anthropic"), elevenlabs: await hasKey("elevenlabs") });
const chaptersSorted = async () => (await all<{ n: number; title: string; idea: string; body: string }>("chapters")).sort((a, b) => a.n - b.n);
on("GET", "pagedata/video/:id", async (c) => ({
  id: vid(c), role: c.user.role, cfg: await previewConfig(), specCfg: await specCfg(), rules: await getSettings("content"), brand: await getSettings("brand"),
  profiles: (await all<VoiceProfile>("voice_profiles")).sort((a, b) => b.is_default - a.is_default || a.id - b.id), chapters: await chaptersSorted(), keys: await keysFlags(),
}));
on("GET", "pagedata/videos", async () => {
  const rs = await all<RenderRec>("renders");
  const videos = (await all<VideoRec>("videos")).sort((a, b) => parseInt(b.number) - parseInt(a.number)).map((v) => {
    const r = rs.filter((x) => x.video_id === v.id).sort((a, b) => b.version - a.version)[0];
    return { id: v.id, number: v.number, title: v.title, chapter: v.chapter, hook_type: v.hook_type, status: v.status, updated_at: v.updated_at, published_at: v.published_at, last_version: r?.version ?? null, last_status: r?.status ?? null };
  });
  return { videos, chapters: await chaptersSorted() };
});
on("GET", "pagedata/new", async () => {
  const vs = await all<VideoRec>("videos");
  return {
    chapters: (await chaptersSorted()).map((c) => ({ ...c, used: vs.filter((v) => v.chapter === c.n).length })),
    backlog: (await all<TopicRec>("topics")).filter((t) => t.status === "backlog").sort((a, b) => b.id - a.id).slice(0, 12),
    hasKey: await hasKey("anthropic"),
  };
});
on("GET", "pagedata/topics", async () => ({ chapters: await chaptersSorted(), hasKey: await hasKey("anthropic") }));
on("GET", "pagedata/library", async () => ({
  chapters: await chaptersSorted(),
  usage: (await all<VideoRec>("videos")).map((v) => ({ chapter: v.chapter, number: v.number, title: v.title, id: v.id })),
  ebook: (await get("assets", "ebook_pdf")) ?? null,
}));
on("GET", "pagedata/assets", async () => ({
  poses: (await all<PoseRec>("poses")).sort((a, b) => a.order - b.order),
  cover: (await get<{ updated_at: string }>("assets", "cover"))?.updated_at ?? null,
  logo: (await get<{ updated_at: string }>("assets", "logo"))?.updated_at ?? null,
  cfg: await previewConfig(), specCfg: await specCfg(),
}));
on("GET", "pagedata/lab", async () => ({
  profiles: (await all<VoiceProfile>("voice_profiles")).sort((a, b) => b.is_default - a.is_default || a.id - b.id),
  keys: await keysFlags(), llm: await getSettings("llm"), rules: await getSettings("content"),
}));
on("GET", "pagedata/settings", async ({ user }) => ({ role: user.role, me: { id: user.id, name: user.name, email: user.email, totp: !!user.totp_enabled } }));
on("GET", "pagedata/activity", async () => {
  const users = await all<UserRec>("users");
  const acts = (await all<{ id: number; user_id: number | null; action: string; detail: string | null; created_at: string; entity: string | null; entity_id: number | null }>("activity")).sort((a, b) => b.id - a.id).slice(0, 200);
  const usage = await all<{ provider: string; model: string; task: string; input_tokens: number; output_tokens: number; characters: number; cost_usd: number; ok: number; created_at: string }>("api_usage");
  const since = Date.now() - 30 * 86400_000;
  const u30 = usage.filter((x) => new Date(x.created_at).getTime() >= since);
  const groups = new Map<string, { provider: string; model: string; task: string; n: number; inp: number; outp: number; chars: number; cost: number; fails: number }>();
  for (const x of u30) {
    const k = `${x.provider}|${x.model}|${x.task}`;
    const g = groups.get(k) ?? { provider: x.provider, model: x.model, task: x.task, n: 0, inp: 0, outp: 0, chars: 0, cost: 0, fails: 0 };
    g.n++; g.inp += x.input_tokens; g.outp += x.output_tokens; g.chars += x.characters; g.cost += x.cost_usd; g.fails += 1 - x.ok;
    groups.set(k, g);
  }
  const rs = (await all<RenderRec>("renders")).filter((r) => new Date(r.created_at).getTime() >= since);
  return {
    rows: acts.map((a) => ({ ...a, name: users.find((u) => u.id === a.user_id)?.name ?? null })),
    byModel: [...groups.values()].sort((a, b) => b.cost - a.cost),
    tot: { c: u30.reduce((s, x) => s + x.cost_usd, 0), n: u30.length },
    all: usage.reduce((s, x) => s + x.cost_usd, 0),
    chars: u30.filter((x) => x.provider === "elevenlabs" && x.task === "tts").reduce((s, x) => s + x.characters, 0),
    renders: { n: rs.length, s: rs.reduce((s, r) => s + (r.render_seconds ?? 0), 0) },
  };
});
on("GET", "pagedata/dashboard", async ({ user }) => {
  const videos = (await all<VideoRec>("videos")).sort((a, b) => parseInt(b.number) - parseInt(a.number));
  const rs = (await all<RenderRec>("renders")).sort((a, b) => b.id - a.id);
  const usage = await all<{ cost_usd: number; created_at: string }>("api_usage");
  const users = await all<UserRec>("users");
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = day(new Date(Date.now() - (13 - i) * 86400_000));
    return { label: `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}.`, value: usage.filter((u) => u.created_at.slice(0, 10) === d).reduce((s, u) => s + u.cost_usd, 0) };
  });
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = Date.now() - (7 - i) * 7 * 86400_000, start = end - 7 * 86400_000;
    return { label: `−${7 - i} t`, value: videos.filter((v) => { const t = new Date(v.created_at).getTime(); return t > start && t <= end; }).length };
  });
  weeks[7].label = "tento t.";
  const done = rs.filter((r) => r.render_seconds);
  const poses = (await all<PoseRec>("poses")).filter((p) => p.kind === "pose" && p.processed).length;
  return {
    user: publicUser(user),
    brand: await getSettings("brand"),
    videos: videos.map((v) => ({ id: v.id, number: v.number, title: v.title, status: v.status, chapter: v.chapter, hook_type: v.hook_type })),
    chapters: await chaptersSorted(),
    statuses: VIDEO_STATUSES.map((s) => ({ ...s, value: videos.filter((v) => v.status === s.key).length })),
    topics: (await all<TopicRec>("topics")).filter((t) => t.status === "backlog").length,
    renders: rs.slice(0, 6).map((r) => ({ id: r.id, video_id: r.video_id, version: r.version, status: r.status, render_seconds: r.render_seconds, number: videos.find((v) => v.id === r.video_id)?.number, title: videos.find((v) => v.id === r.video_id)?.title })),
    avgRender: done.length ? done.reduce((s, r) => s + (r.render_seconds ?? 0), 0) / done.length : null,
    cost30: usage.filter((u) => Date.now() - new Date(u.created_at).getTime() < 30 * 86400_000).reduce((s, u) => s + u.cost_usd, 0),
    days, weeks,
    activity: (await all<{ id: number; user_id: number | null; action: string; detail: string | null; created_at: string; entity: string | null; entity_id: number | null }>("activity")).sort((a, b) => b.id - a.id).slice(0, 8).map((a) => ({ ...a, name: users.find((u) => u.id === a.user_id)?.name ?? null })),
    keys: await keyStatus(),
    poses,
    ebook: !!(await get("assets", "ebook_pdf")),
  };
});

void deepMerge;
