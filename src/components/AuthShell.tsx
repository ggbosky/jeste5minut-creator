import type { ReactNode } from "react";

export function AuthShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-lg font-extrabold tracking-tight">Ještě 5 minut <span className="text-accent">Studio</span></span>
        </div>
        <div>
          <p className="max-w-md text-4xl font-extrabold leading-tight">
            Začnu zítra <span className="text-accent">teď</span>.
          </p>
          <p className="mt-4 max-w-md text-lg text-muted">
            Z jednoho kliknutí hotový reel s AI avatarem. Ty jen schválíš scénář, nahraješ hlas a zkontroluješ video.
          </p>
          <ol className="mt-10 grid max-w-md grid-cols-3 gap-3 text-sm">
            {["Téma", "Scénář", "Hlas", "Timeline", "Render", "Export"].map((s, i) => (
              <li key={s} className="rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
                <span className="text-accent font-bold">{i + 1}</span> <span className="text-white/90">{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-white/40">Instagram Reels · TikTok · 1080 × 1920</p>
        <div className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
      </aside>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo />
            <span className="font-extrabold">Ještě 5 minut Studio</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          <p className="text-2 mt-1 mb-6 text-sm">{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  );
}

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" rx="11" fill="#FB6720" />
      <circle cx="20" cy="21" r="11" fill="none" stroke="#fff" strokeWidth="3.2" />
      <path d="M20 14v7l4.5 3" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <text x="20" y="9.5" fontSize="7" fontWeight="800" fill="#fff" textAnchor="middle" fontFamily="Inter">5</text>
    </svg>
  );
}
