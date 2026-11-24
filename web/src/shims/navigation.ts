import { useSyncExternalStore } from "react";

// Náhrada next/navigation pro hash router
const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const snap = () => window.location.hash;
export function useHash() {
  return useSyncExternalStore(subscribe, snap, () => "");
}
export function parseHash(h = window.location.hash) {
  const raw = h.replace(/^#/, "") || "/";
  const [path, q = ""] = raw.split("?");
  return { path: path || "/", query: q };
}
export function usePathname() {
  return parseHash(useHash()).path;
}
export function useSearchParams() {
  return new URLSearchParams(parseHash(useHash()).query);
}
export function useRouter() {
  return {
    push: (p: string, _opts?: { scroll?: boolean }) => {
      window.location.hash = p;
    },
    replace: (p: string, _opts?: { scroll?: boolean }) => {
      history.replaceState(null, "", `#${p}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    },
    refresh: () => window.dispatchEvent(new Event("j5m-refresh")),
    back: () => history.back(),
  };
}
export function redirect(p: string): never {
  window.location.hash = p;
  throw new Error("redirect");
}
export function notFound(): never {
  throw new Error("Nenalezeno");
}
