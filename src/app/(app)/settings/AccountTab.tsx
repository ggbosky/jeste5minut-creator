"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Field, api, fmtDate, useToast } from "@/components/ui";

type Sess = { id: string; created_at: string; last_seen_at: string; ip: string; user_agent: string; current: boolean };

export function AccountTab({ me }: { me: { id: number; name: string; email: string; totp: boolean } }) {
  const toast = useToast();
  const [name, setName] = useState(me.name);
  const [pw, setPw] = useState({ current_password: "", new_password: "", again: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [totp, setTotp] = useState(me.totp);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");

  const loadSessions = () => api<{ sessions: Sess[] }>("/api/account/sessions").then((r) => setSessions(r.sessions));
  useEffect(() => {
    loadSessions();
  }, []);

  async function act(k: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(k);
    try {
      await fn();
      toast("ok", ok);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Profil">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Jméno"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="E-mail"><input className="input" value={me.email} disabled /></Field>
        </div>
        <Button className="mt-4" size="sm" variant="primary" loading={busy === "name"} onClick={() => act("name", () => api("/api/account", { body: { name } }), "Uloženo")}>Uložit</Button>
      </Card>
      <Card title="Změna hesla" subtitle="Ostatní přihlášená zařízení se odhlásí">
        <form className="grid max-w-md gap-3" onSubmit={(e) => {
          e.preventDefault();
          if (pw.new_password !== pw.again) return toast("error", "Nová hesla se neshodují");
          act("pw", async () => { await api("/api/account", { body: pw }); setPw({ current_password: "", new_password: "", again: "" }); await loadSessions(); }, "Heslo změněno");
        }}>
          <Field label="Současné heslo"><input type="password" className="input" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
          <Field label="Nové heslo" hint="Aspoň 10 znaků, písmena i číslice"><input type="password" className="input" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
          <Field label="Nové heslo znovu"><input type="password" className="input" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></Field>
          <div><Button type="submit" size="sm" variant="primary" loading={busy === "pw"}>Změnit heslo</Button></div>
        </form>
      </Card>
      <Card title="Dvoufázové ověření (TOTP)" actions={totp ? <Badge color="#10B981" solid>zapnuto</Badge> : <Badge color="#F59E0B">vypnuto</Badge>}>
        {totp ? (
          <div className="flex flex-wrap items-end gap-3">
            <p className="text-2 text-sm">Při přihlášení se ptáme na kód z autentizační aplikace.</p>
            <Button size="sm" onClick={() => {
              const password = prompt("Pro vypnutí 2FA zadej heslo:");
              if (password) act("2off", async () => { await api("/api/account/2fa", { method: "DELETE", body: { password } }); setTotp(false); }, "2FA vypnuto");
            }}>Vypnout</Button>
          </div>
        ) : setup ? (
          <div className="flex flex-wrap gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="QR kód pro autentizační aplikaci" className="h-44 w-44 rounded-xl bg-white p-2" />
            <div className="space-y-3">
              <p className="text-sm">1. Naskenuj QR kód v Google Authenticator, 1Password, Authy…</p>
              <p className="text-3 text-xs">nebo zadej ručně: <code className="font-mono">{setup.secret}</code></p>
              <p className="text-sm">2. Opiš šestimístný kód:</p>
              <div className="flex gap-2">
                <input className="input w-36 text-center tracking-[0.3em]" maxLength={6} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                <Button variant="primary" loading={busy === "2on"} onClick={() => act("2on", async () => { await api("/api/account/2fa", { body: { code } }); setTotp(true); setSetup(null); }, "2FA zapnuto")}>Aktivovat</Button>
              </div>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="primary" loading={busy === "2setup"} onClick={() => act("2setup", async () => setSetup(await api("/api/account/2fa")), "Naskenuj QR kód")}>Zapnout 2FA</Button>
        )}
      </Card>
      <Card title="Přihlášená zařízení" pad={false} actions={sessions.length > 1 && <Button size="sm" onClick={() => act("others", async () => { await api("/api/account/sessions", { method: "DELETE", body: { others: true } }); await loadSessions(); }, "Ostatní zařízení odhlášena")}>Odhlásit ostatní</Button>}>
        <ul className="divide-y divide-[var(--border)]">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <span className="min-w-0 flex-1 truncate" title={s.user_agent}>{s.user_agent || "neznámý prohlížeč"}</span>
              <span className="text-3 text-xs">{s.ip} · naposledy {fmtDate(s.last_seen_at)}</span>
              {s.current ? <Badge color="#10B981">toto zařízení</Badge> : <Button size="sm" variant="ghost" onClick={() => act("s", async () => { await api("/api/account/sessions", { method: "DELETE", body: { id: s.id } }); await loadSessions(); }, "Odhlášeno")}>Odhlásit</Button>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
