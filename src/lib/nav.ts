// Základ URL pro API a navigace — v Next.js "/api", ve statické verzi (GitHub Pages) relativní "api" + hash router.
export const API = process.env.NEXT_PUBLIC_API_BASE || "/api";
export const STATIC = process.env.NEXT_PUBLIC_STATIC === "1";

export function go(path: string) {
  if (STATIC) window.location.hash = path;
  else window.location.href = path;
}
