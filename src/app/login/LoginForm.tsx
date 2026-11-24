"use client";
import { useState } from "react";
import { Button, Field, api } from "@/components/ui";

export function LoginForm() {
  const [step, setStep] = useState<"pw" | "2fa">("pw");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const go = () => {
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (step === "pw") {
        const r = await api<{ twofa?: boolean }>("/api/auth/login", { body: { email, password } });
        if (r.twofa) setStep("2fa");
        else go();
      } else {
        await api("/api/auth/2fa", { body: { code } });
        go();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {step === "pw" ? (
        <>
          <Field label="E-mail">
            <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Field label="Heslo">
            <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </>
      ) : (
        <Field label="Kód z autentizační aplikace" hint="Šestimístný kód z Google Authenticator, 1Password apod.">
          <input className="input text-center text-xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
        </Field>
      )}
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{err}</p>}
      <Button variant="primary" className="w-full" loading={busy} type="submit">
        {step === "pw" ? "Přihlásit se" : "Ověřit"}
      </Button>
      {step === "2fa" && (
        <button type="button" className="text-3 w-full text-center text-sm hover:underline" onClick={() => setStep("pw")}>
          Zpět
        </button>
      )}
    </form>
  );
}
