import { NextResponse } from "next/server";
import { currentUser, type User } from "./auth";
import { run } from "./db";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

type Ctx<P> = { params: Promise<P> };
type Handler<P> = (req: Request, ctx: { user: User; params: P }) => Promise<unknown>;

const ROLE_RANK = { viewer: 0, editor: 1, admin: 2 } as const;

/**
 * Obal pro route handlery: ověří session, roli a origin (CSRF) a vrací JSON.
 * GET smí i viewer, zápisy potřebují editor (nebo zadanou roli).
 */
export function route<P = Record<string, string>>(fn: Handler<P>, opts: { role?: User["role"] } = {}) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const user = await currentUser();
      if (!user) throw new HttpError(401, "Nepřihlášen");
      const write = req.method !== "GET" && req.method !== "HEAD";
      const need = opts.role ?? (write ? "editor" : "viewer");
      if (ROLE_RANK[user.role] < ROLE_RANK[need]) throw new HttpError(403, "Nedostatečná oprávnění");
      if (write) checkOrigin(req);
      const params = (await ctx.params) as P;
      const out = await fn(req, { user, params });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
  console.error(e);
  const msg = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // ne-prohlížečový klient (curl) — chráněn cookie SameSite=Lax
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, "Neplatný původ požadavku");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(403, "Neplatný původ požadavku");
  }
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Neplatné JSON tělo");
  }
}

export function logActivity(userId: number | null, action: string, entity?: string, entityId?: number | null, detail?: string) {
  run("INSERT INTO activity(user_id, action, entity, entity_id, detail) VALUES(?, ?, ?, ?, ?)", userId, action, entity ?? null, entityId ?? null, detail ?? null);
}
