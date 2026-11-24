"use client";
import { useEffect, useState } from "react";
import { Badge, Card, Spinner, api } from "@/components/ui";

type H = { node: string; ffmpeg: string | null; data_dir: string; data_size_mb: number; queue: { running: boolean; queued: number }; counts: Record<string, number>; app_secret_from_env: boolean };

export function SystemTab({ isAdmin }: { isAdmin: boolean }) {
  const [h, setH] = useState<H | null>(null);
  useEffect(() => {
    api<H>("/api/system/health").then(setH);
  }, []);
  if (!h) return <Spinner />;
  const rows: [string, React.ReactNode][] = [
    ["Node.js", h.node],
    ["ffmpeg", h.ffmpeg ? <span key="f">{h.ffmpeg.replace("ffmpeg version ", "")} <Badge color="#10B981">OK</Badge></span> : <Badge color="#DC2626">chybí — render nepůjde</Badge>],
    ["Datová složka", <code key="d" className="text-xs">{h.data_dir}</code>],
    ["Velikost dat", `${h.data_size_mb} MB`],
    ["Fronta renderu", h.queue.running ? `běží, ${h.queue.queued} ve frontě` : "nečinná"],
    ["Šifrovací klíč", h.app_secret_from_env ? "z APP_SECRET" : "vygenerovaný v data/secret.key (zálohuj ho spolu s DB)"],
    ["Obsah", `${h.counts.videos} videí · ${h.counts.renders} renderů · ${h.counts.takes} audio takeů · ${h.counts.users} uživatelů`],
  ];
  return (
    <div className="space-y-4">
      <Card title="Stav serveru">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[180px_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-3">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {isAdmin && (
        <Card title="Záloha" subtitle="JSON se scénáři, nastavením, tématy a historií (bez klíčů, hesel a souborů). Pro úplnou zálohu zkopíruj celou datovou složku.">
          <a href="/api/system/backup" className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-sm font-semibold text-white">Stáhnout zálohu</a>
        </Card>
      )}
    </div>
  );
}
