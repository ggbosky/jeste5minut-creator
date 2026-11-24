"use client";
import { useState } from "react";
import { Button, Field, api } from "@/components/ui";

export function SetupForm() {
  const [f, setF] = useState({ name: "", email: "", password: "", password2: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (f.password !== f.password2) return setErr("Hesla se neshodují.");
    setBusy(true);
    try {
      await api("/api/auth/setup", { body: f });
      window.location.href = "/";
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Jméno"><input className="input" value={f.name} onChange={set("name")} placeholder="Filip" autoFocus /></Field>
      <Field label="E-mail"><input className="input" type="email" required value={f.email} onChange={set("email")} autoComplete="username" /></Field>
      <Field label="Heslo" hint="Aspoň 10 znaků, písmena i číslice."><input className="input" type="password" required value={f.password} onChange={set("password")} autoComplete="new-password" /></Field>
      <Field label="Heslo znovu"><input className="input" type="password" required value={f.password2} onChange={set("password2")} autoComplete="new-password" /></Field>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{err}</p>}
      <Button variant="primary" className="w-full" loading={busy} type="submit">Vytvořit účet a pokračovat</Button>
    </form>
  );
}
