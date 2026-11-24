"use client";
import { API, go } from "@/lib/nav";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./AuthShell";
import { cx, api } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { href: "/videos", label: "Videa", icon: "M4 5h11a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zm12 5l5-3v10l-5-3" },
  { href: "/videos/new", label: "Nové video", icon: "M12 5v14M5 12h14" },
  { href: "/topics", label: "Zásobník témat", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/library", label: "Knihovna obsahu", icon: "M4 4h6a3 3 0 013 3v13a2 2 0 00-2-2H4zM20 4h-6a3 3 0 00-3 3v13a2 2 0 012-2h7z" },
  { href: "/assets", label: "Avatar a šablony", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0" },
  { href: "/lab", label: "Laboratoř", icon: "M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3" },
  { href: "/activity", label: "Aktivita a náklady", icon: "M3 3v18h18M7 15l4-4 3 3 5-6" },
  { href: "/settings", label: "Nastavení", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14.5 3h-5l-.4 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2l.4 2.6h5l.4-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" },
];

export function Sidebar({ user }: { user: { name: string; email: string; role: string } }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<{ running: boolean; queued: number } | null>(null);
  const [theme, setTheme] = useState<string>("auto");

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    try { setTheme(localStorage.getItem("j5m-theme") || "auto"); } catch {}
    let alive = true;
    const tick = () => api<{ running: boolean; queued: number }>(`${API}/queue`).then((q) => alive && setQueue(q)).catch(() => {});
    tick();
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const cycleTheme = () => {
    const next = theme === "auto" ? "dark" : theme === "dark" ? "light" : "auto";
    setTheme(next);
    try {
      if (next === "auto") { localStorage.removeItem("j5m-theme"); delete document.documentElement.dataset.theme; }
      else { localStorage.setItem("j5m-theme", next); document.documentElement.dataset.theme = next; }
    } catch {}
  };

  const active = (href: string) => (href === "/" ? path === "/" : href === "/videos" ? path === "/videos" || (/^\/videos\/\d+/.test(path)) : path.startsWith(href));

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-navy-900 px-4 py-3 text-white lg:hidden">
        <div className="flex items-center gap-2"><Logo size={28} /><span className="font-extrabold">Studio</span></div>
        <button onClick={() => setOpen(!open)} className="rounded-lg px-2 py-1 ring-1 ring-white/20" aria-label="Menu">☰</button>
      </div>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cx("fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy-900 text-white transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center gap-3 px-5 py-5">
          <Logo />
          <div className="leading-tight">
            <p className="font-extrabold">Ještě 5 minut</p>
            <p className="text-xs text-accent font-semibold">Studio</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                active(n.href) ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white",
              )}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={active(n.href) ? "text-accent" : ""}>
                <path d={n.icon} />
              </svg>
              {n.label}
            </Link>
          ))}
        </nav>
        {queue && (queue.running || queue.queued > 0) && (
          <div className="mx-3 mb-3 rounded-xl bg-accent/15 px-3 py-2 text-xs font-semibold text-accent">
            <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
            Render běží{queue.queued ? ` · ${queue.queued} ve frontě` : ""}
          </div>
        )}
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent font-bold">{user.name.slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-white/50">{user.role === "admin" ? "Správce" : user.role === "editor" ? "Editor" : "Čtenář"}</p>
            </div>
          </div>
          <div className="mt-1 flex gap-1">
            <button onClick={cycleTheme} className="flex-1 rounded-lg px-2 py-1.5 text-xs text-white/60 hover:bg-white/5 hover:text-white" title="Motiv">
              {theme === "auto" ? "◐ Auto" : theme === "dark" ? "● Tmavý" : "○ Světlý"}
            </button>
            <button
              onClick={async () => { await api(`${API}/auth/logout`, { method: "POST" }); go("/login"); }}
              className="flex-1 rounded-lg px-2 py-1.5 text-xs text-white/60 hover:bg-white/5 hover:text-white"
            >
              Odhlásit
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
