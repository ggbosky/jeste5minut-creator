"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Field, Modal, api, fmtDate, useToast } from "@/components/ui";
import { PROVIDERS } from "@/lib/constants";

type K = { id: number; provider: string; label: string; last4: string; is_active: number; last_tested_at: string | null; test_status: string | null; test_message: string | null; created_at: string };
type S = { provider: string; label: string; configured: boolean; source: string | null };

const INFO: Record<string, { what: string; where: string; url: string }> = {
  anthropic: { what: "Návrhy témat, psaní scénářů, přegenerování scén, překlad připomínek na úpravu specu.", where: "console.anthropic.com → API Keys", url: "https://console.anthropic.com/settings/keys" },
  elevenlabs: { what: "Volitelné: seznam hlasů, generování hlasu přímo z aplikace, časy slov (Scribe STT), kvóta znaků.", where: "elevenlabs.io → Profile → API Keys", url: "https://elevenlabs.io/app/settings/api-keys" },
};

export function KeysTab({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast();
  const [keys, setKeys] = useState<K[]>([]);
  const [status, setStatus] = useState<S[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", secret: "", activate: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  const load = async () => {
    const r = await api<{ keys: K[]; status: S[] }>("/api/keys");
    setKeys(r.keys);
    setStatus(r.status);
  };
  useEffect(() => {
    load();
  }, []);

  async function act(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    try {
      await fn();
      if (ok) toast("ok", ok);
      await load();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-2 text-sm">
        Klíče jsou uložené šifrovaně (AES-256-GCM) a nikdy se neposílají zpět do prohlížeče. Ke každému poskytovateli můžeš mít víc klíčů (např. osobní / firemní / testovací) a přepínat, který je aktivní.
        {!isAdmin && " Klíče může spravovat jen správce."}
      </p>
      {PROVIDERS.map((p) => {
        const list = keys.filter((k) => k.provider === p.key);
        const st = status.find((s) => s.provider === p.key);
        return (
          <Card
            key={p.key}
            title={<span className="flex items-center gap-2">{p.label} {st?.configured ? <Badge color="#10B981">{st.source === "env" ? "z proměnné prostředí" : "aktivní"}</Badge> : <Badge color="#F59E0B">nenastaveno</Badge>}</span>}
            subtitle={INFO[p.key].what}
            actions={isAdmin && <Button size="sm" variant="primary" onClick={() => { setAdding(p.key); setForm({ label: list.length ? `Klíč ${list.length + 1}` : "Hlavní", secret: "", activate: true }); }}>+ Přidat klíč</Button>}
            pad={false}
          >
            {list.length === 0 ? (
              <p className="text-3 px-5 py-4 text-sm">
                Žádný uložený klíč{st?.source === "env" ? ` — používá se ${p.env} z prostředí serveru` : ""}. Klíč získáš v {INFO[p.key].where} (<a className="text-accent underline" href={INFO[p.key].url} target="_blank" rel="noreferrer">otevřít</a>).
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {list.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <label className="flex items-center gap-2">
                      <input type="radio" name={`active-${p.key}`} checked={!!k.is_active} disabled={!isAdmin} onChange={() => act(`a${k.id}`, () => api(`/api/keys/${k.id}`, { method: "PATCH", body: { active: true } }), `Aktivní: ${k.label}`)} />
                      <span className="font-semibold">{k.label}</span>
                    </label>
                    <code className="text-3 rounded bg-[var(--surface-2)] px-2 py-0.5 text-xs">••••••••{k.last4}</code>
                    {k.test_status && <Badge color={k.test_status === "ok" ? "#10B981" : "#DC2626"}>{k.test_status === "ok" ? "funguje" : "chyba"}</Badge>}
                    <span className="text-3 min-w-0 flex-1 truncate text-xs" title={k.test_message ?? ""}>{k.test_message ? `${k.test_message} · ${fmtDate(k.last_tested_at)}` : `přidán ${fmtDate(k.created_at)}`}</span>
                    {isAdmin && (
                      <>
                        <Button size="sm" loading={busy === `t${k.id}`} onClick={() => act(`t${k.id}`, async () => {
                          const r = await api<{ ok: boolean; message: string }>(`/api/keys/${k.id}/test`, { method: "POST" });
                          toast(r.ok ? "ok" : "error", r.message);
                        })}>Otestovat</Button>
                        <Button size="sm" variant="ghost" onClick={() => confirm(`Smazat klíč „${k.label}“?`) && act(`d${k.id}`, () => api(`/api/keys/${k.id}`, { method: "DELETE" }), "Klíč smazán")}>Smazat</Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}

      <Modal open={!!adding} onClose={() => setAdding(null)} title={`Nový klíč — ${PROVIDERS.find((p) => p.key === adding)?.label}`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            act("add", async () => {
              const r = await api<{ id: number }>("/api/keys", { body: { provider: adding, ...form } });
              setAdding(null);
              const t = await api<{ ok: boolean; message: string }>(`/api/keys/${r.id}/test`, { method: "POST" });
              toast(t.ok ? "ok" : "error", t.ok ? `Klíč uložen a funguje · ${t.message}` : `Klíč uložen, ale test selhal: ${t.message}`);
            });
          }}
        >
          <Field label="Název"><input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
          <Field label="API klíč" hint={adding === "anthropic" ? "Začíná sk-ant-…" : "Najdeš v ElevenLabs → API Keys"}>
            <div className="flex gap-2">
              <input className="input font-mono" type={show ? "text" : "password"} autoComplete="off" required value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
              <Button type="button" size="md" variant="ghost" onClick={() => setShow(!show)}>{show ? "Skrýt" : "Zobrazit"}</Button>
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.activate} onChange={(e) => setForm({ ...form, activate: e.target.checked })} /> Rovnou nastavit jako aktivní</label>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setAdding(null)}>Zrušit</Button>
            <Button type="submit" variant="primary" loading={busy === "add"}>Uložit a otestovat</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
