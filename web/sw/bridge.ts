// Komunikace service worker ↔ stránka (BroadcastChannel). Stránka umí věci, které SW neumí:
// dekódovat audio (AudioContext), kreslit (canvas) a renderovat video (WebCodecs).
export const CHANNEL = "j5m-bridge";
const ch = new BroadcastChannel(CHANNEL);
const waiting = new Map<string, { res: (v: unknown) => void; rej: (e: Error) => void }>();

ch.onmessage = (e) => {
  const m = e.data;
  if (m?.type === "job-done" && waiting.has(m.id)) {
    const w = waiting.get(m.id)!;
    waiting.delete(m.id);
    if (m.error) w.rej(new Error(m.error));
    else w.res(m.result);
  }
};

export function broadcast(msg: unknown) {
  ch.postMessage(msg);
}

export function pageJob<T = unknown>(kind: string, payload: unknown, timeoutMs = 120_000): Promise<T> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise<T>((res, rej) => {
    waiting.set(id, { res: res as (v: unknown) => void, rej });
    ch.postMessage({ type: "job", id, kind, payload });
    setTimeout(() => {
      if (waiting.has(id)) {
        waiting.delete(id);
        rej(new Error("Stránka aplikace neodpověděla — nech ji otevřenou"));
      }
    }, timeoutMs);
  });
}
