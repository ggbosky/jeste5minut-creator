import { NextResponse, type NextRequest } from "next/server";

// Rychlá kontrola cookie na okraji. Skutečné ověření session dělá server (layout + API).
const PUBLIC = ["/login", "/setup", "/api/auth/", "/fonts/", "/_next/", "/favicon"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("j5m_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "same-origin");
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
