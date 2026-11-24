"use client";
import { useEffect, useState } from "react";
import { api } from "@/components/ui";

export function ElevenQuota({ enabled }: { enabled: boolean }) {
  const [d, setD] = useState<{ tier: string; character_count: number; character_limit: number; next_reset: string | null } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (enabled) api<typeof d>("/api/elevenlabs/subscription").then(setD).catch((e) => setErr(e.message));
  }, [enabled]);
  if (!enabled) return <p className="text-3 text-xs">Kvóta ElevenLabs se zobrazí po přidání klíče.</p>;
  if (err) return <p className="text-xs text-red-600">ElevenLabs: {err}</p>;
  if (!d) return <p className="text-3 text-xs">Načítám kvótu ElevenLabs…</p>;
  const pct = d.character_limit ? d.character_count / d.character_limit : 0;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="font-semibold">ElevenLabs · {d.tier}</span>
        <span className="tabular-nums">{d.character_count.toLocaleString("cs-CZ")} / {d.character_limit.toLocaleString("cs-CZ")} znaků</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-[var(--surface-2)]">
        <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, pct * 100)}%` }} />
      </div>
      {d.next_reset && <p className="text-3 mt-1 text-[11px]">Reset {new Date(d.next_reset).toLocaleDateString("cs-CZ")}</p>}
    </div>
  );
}
