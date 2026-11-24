import { useEffect, useState } from "react";
import { api } from "@/components/ui";
import { API } from "@/lib/nav";
import { Sidebar } from "@/components/Sidebar";
import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "@/app/login/LoginForm";
import { SetupForm } from "@/app/setup/SetupForm";
import { useHash, parseHash } from "./shims/navigation";
import { ActivityPage, AssetsPage, DashboardPage, LabPage, LibraryPage, NewVideoPage, SettingsPage, TopicsPage, VideoPage, VideosPage } from "./pages";

type State = { setup_needed: boolean; user: { id: number; name: string; email: string; role: string } | null };

export function App() {
  const hash = useHash();
  const { path } = parseHash(hash);
  const [st, setSt] = useState<State | null>(null);

  useEffect(() => {
    api<State>(`${API}/auth/state`).then(setSt).catch(() => setSt({ setup_needed: false, user: null }));
  }, [path]);

  useEffect(() => {
    if (!st) return;
    if (st.setup_needed && path !== "/setup") window.location.hash = "/setup";
    else if (!st.setup_needed && !st.user && path !== "/login") window.location.hash = `/login?next=${encodeURIComponent(path)}`;
    else if (st.user && (path === "/login" || path === "/setup")) window.location.hash = "/";
  }, [st, path]);

  if (!st) return null;
  if (path === "/setup" && st.setup_needed)
    return <AuthShell title="Vítej ve studiu" subtitle="První spuštění — vytvoř účet správce. Data i API klíče zůstávají jen v tomto prohlížeči (klíče šifrované tvým heslem)."><SetupForm /></AuthShell>;
  if (!st.user)
    return <AuthShell title="Přihlášení" subtitle="Přihlas se do studia pro výrobu reels."><LoginForm /></AuthShell>;

  const m = path.match(/^\/videos\/(\d+)$/);
  const page =
    path === "/" ? <DashboardPage /> :
    path === "/videos" ? <VideosPage /> :
    path === "/videos/new" ? <NewVideoPage /> :
    m ? <VideoPage id={Number(m[1])} /> :
    path === "/topics" ? <TopicsPage /> :
    path === "/library" ? <LibraryPage /> :
    path === "/assets" ? <AssetsPage /> :
    path === "/lab" ? <LabPage /> :
    path === "/activity" ? <ActivityPage /> :
    path === "/settings" ? <SettingsPage /> :
    <p>Stránka nenalezena. <a className="text-accent" href="#/">Na dashboard</a></p>;

  return (
    <div className="min-h-screen lg:pl-64">
      <Sidebar user={st.user} />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">{page}</main>
    </div>
  );
}
