import QRCode from "qrcode";
import { route, body, HttpError } from "@/lib/api";
import { one, run } from "@/lib/db";
import { newTotpSecret, verifyTotp, verifyPassword } from "@/lib/crypto";
import { getSettings } from "@/lib/settings";

// GET: nový tajný klíč + QR (zatím neaktivní) · POST {code}: aktivace · DELETE {password}: vypnutí
export const GET = route(async (_req, { user }) => {
  const secret = newTotpSecret();
  run("UPDATE users SET totp_secret = ? WHERE id = ? AND totp_enabled = 0", secret, user.id);
  const issuer = encodeURIComponent(getSettings("brand").name + " Studio");
  const uri = `otpauth://totp/${issuer}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${issuer}&digits=6&period=30`;
  return { secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}, { role: "viewer" });

export const POST = route(async (req, { user }) => {
  const b = await body<{ code: string }>(req);
  const u = one<{ totp_secret: string | null }>("SELECT totp_secret FROM users WHERE id = ?", user.id)!;
  if (!u.totp_secret || !verifyTotp(u.totp_secret, b.code)) throw new HttpError(400, "Kód nesedí — zkontroluj čas v telefonu");
  run("UPDATE users SET totp_enabled = 1 WHERE id = ?", user.id);
  return { ok: true };
}, { role: "viewer" });

export const DELETE = route(async (req, { user }) => {
  const b = await body<{ password: string }>(req);
  const u = one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", user.id)!;
  if (!verifyPassword(b.password ?? "", u.password_hash)) throw new HttpError(400, "Heslo nesedí");
  run("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?", user.id);
  return { ok: true };
}, { role: "viewer" });
