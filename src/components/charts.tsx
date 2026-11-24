"use client";
import { useState } from "react";

/** Jednoduchý sloupcový graf (jedna řada, jeden odstín) s tooltipem při najetí. */
const FORMATS: Record<string, (v: number) => string> = {
  plain: (v) => String(v),
  usd: (v) => `$${v.toFixed(3)}`,
  videos: (v) => `${v} ${v === 1 ? "video" : v >= 2 && v <= 4 ? "videa" : "videí"}`,
  seconds: (v) => `${v.toFixed(0)} s`,
};

export function BarChart({ data, height = 160, color = "#FB6720", kind = "plain", unit = "" }: { data: { label: string; value: number; sub?: string }[]; height?: number; color?: string; kind?: keyof typeof FORMATS; unit?: string }) {
  const format = FORMATS[kind] ?? FORMATS.plain;
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length || 1;
  return (
    <div className="relative">
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 22);
          return (
            <div
              key={i}
              className="group relative flex h-full flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {/* zvětšená zóna pro najetí */}
              <div className="absolute inset-0" />
              <div
                className="w-full max-w-[44px] rounded-t-[4px] transition-opacity"
                style={{ height: Math.max(d.value > 0 ? 3 : 0, h), background: color, opacity: hover === null || hover === i ? 1 : 0.45 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[2px] border-t border-base pt-1.5">
        {data.map((d, i) => (
          <div key={i} className="text-3 flex-1 truncate text-center text-[10px]" title={d.label}>
            {n > 14 && i % Math.ceil(n / 7) !== 0 ? "" : d.label}
          </div>
        ))}
      </div>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-navy-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{ left: `${((hover + 0.5) / n) * 100}%` }}
        >
          <p className="font-semibold">{data[hover].label}</p>
          <p className="tabular-nums">{format(data[hover].value)}{unit}</p>
          {data[hover].sub && <p className="text-white/60">{data[hover].sub}</p>}
        </div>
      )}
    </div>
  );
}

/** Horizontální pruhy (pipeline podle stavu). */
export function HBars({ data }: { data: { label: string; value: number; color: string; href?: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <a key={d.label} href={d.href} className="group grid grid-cols-[120px_1fr_32px] items-center gap-3 text-sm" title={`${d.label}: ${d.value}`}>
          <span className="text-2 flex items-center gap-2 truncate font-medium">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
            {d.label}
          </span>
          <span className="h-3 rounded-full bg-[var(--surface-2)]">
            <span className="block h-3 rounded-full transition-all group-hover:brightness-110" style={{ width: `${(d.value / max) * 100}%`, minWidth: d.value ? 6 : 0, background: "#FB6720" }} />
          </span>
          <span className="text-right font-bold tabular-nums">{d.value}</span>
        </a>
      ))}
    </div>
  );
}
