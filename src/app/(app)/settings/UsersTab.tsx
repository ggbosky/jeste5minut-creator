"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Field, Modal, api, fmtDate, useToast } from "@/components/ui";
import { useSettings } from "./useSettings";

type U = { id: number; email: string; name: string; role: string; totp_enabled: number; active: number; created_at: string; last_login_at: string | null };
const ROLES = [
  { key: "admin", label: "Správce", hint: "vše včetně klíčů a uživatelů" },
  { key: "editor", label: "Editor", hint: "výroba videí, nastavení obsahu" },
  { key: "viewer", label: "Čtenář", hint: "jen prohlížení" },
];

export function UsersTab({ meId }: { meId: number }) {
  const toast = useToast();
  const [users, setUsers] = useState<U[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", password: "", role: "editor" });
  const [busy, setBusy] = useState(false);
  const sec = useSettings("security");
  const load = () => api<{ users: U[] }>("/api/users").then((r) => setUsers(r.users));
  useEffect(() => {
    load();
  }, []);
  const patch = async (id: number, b: Record<string, unknown>, ok = "Uloženo") => {
    try {
      await api(`/api/users/${id}`, { method: "PATCH", body: b });
      toast("ok", ok);
      await load();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  return (
    <div className="space-y-4">
      <Card title="Uživatelé" pad={false} actions={<Button size="sm" variant="primary" onClick={() => setOpen(true)}>+ Přidat uživatele</Button>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-3 text-left text-xs uppercase"><tr className="border-b border-base"><th className="px-5 py-2.5">Uživatel</th><th className="px-3">Role</th><th className="px-3">2FA</th><th className="px-3">Poslední přihlášení</th><th className="px-3" /></tr></thead>
            <tbody className="divide-y divide-[var(--border)]">
              {users.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                  <td className="px-5 py-3"><p className="font-semibold">{u.name} {u.id === meId && <Badge>ty</Badge>}</p><p className="text-3 text-xs">{u.email}</p></td>
                  <td className="px-3">
                    <select className="input h-8 w-auto py-0" value={u.role} disabled={u.id === meId} onChange={(e) => patch(u.id, { role: e.target.value })}>
                      {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3">{u.totp_enabled ? <Badge color="#10B981">ano</Badge> : <Badge>ne</Badge>}</td>
                  <td className="text-3 px-3 text-xs">{fmtDate(u.last_login_at)}</td>
                  <td className="px-3 text-right whitespace-nowrap">
                    {u.id !== meId && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => { const p = prompt(`Nové heslo pro ${u.email}:`); if (p) patch(u.id, { password: p }, "Heslo nastaveno"); }}>Heslo</Button>
                        {u.totp_enabled ? <Button size="sm" variant="ghost" onClick={() => confirm("Vypnout 2FA tomuto uživateli?") && patch(u.id, { reset_2fa: true }, "2FA resetováno")}>Reset 2FA</Button> : null}
                        <Button size="sm" variant="ghost" onClick={() => patch(u.id, { active: !u.active }, u.active ? "Deaktivováno" : "Aktivováno")}>{u.active ? "Deaktivovat" : "Aktivovat"}</Button>
                        <Button size="sm" variant="ghost" onClick={async () => { if (confirm(`Smazat ${u.email}?`)) { await api(`/api/users/${u.id}`, { method: "DELETE" }); load(); } }}>Smazat</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {sec.value && (
        <Card title="Zabezpečení přihlášení" actions={<Button size="sm" variant="primary" disabled={!sec.dirty} loading={sec.saving} onClick={sec.save}>Uložit</Button>}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Platnost přihlášení (dní)"><input type="number" className="input" value={sec.value.session_days} onChange={(e) => sec.set({ session_days: Number(e.target.value) })} /></Field>
            <Field label="Max. neúspěšných pokusů"><input type="number" className="input" value={sec.value.max_login_attempts} onChange={(e) => sec.set({ max_login_attempts: Number(e.target.value) })} /></Field>
            <Field label="Zámek po pokusech (min)"><input type="number" className="input" value={sec.value.lockout_minutes} onChange={(e) => sec.set({ lockout_minutes: Number(e.target.value) })} /></Field>
          </div>
        </Card>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nový uživatel">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/api/users", { body: f });
            toast("ok", "Uživatel vytvořen — předej mu heslo bezpečnou cestou");
            setOpen(false);
            setF({ name: "", email: "", password: "", role: "editor" });
            load();
          } catch (err) {
            toast("error", (err as Error).message);
          } finally {
            setBusy(false);
          }
        }}>
          <Field label="Jméno"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="E-mail"><input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Dočasné heslo" hint="Aspoň 10 znaků, písmena i číslice"><input className="input" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label="Role">
            <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label} — {r.hint}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-2"><Button type="button" onClick={() => setOpen(false)}>Zrušit</Button><Button type="submit" variant="primary" loading={busy}>Vytvořit</Button></div>
        </form>
      </Modal>
    </div>
  );
}
