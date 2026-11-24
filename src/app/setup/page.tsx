import { redirect } from "next/navigation";
import { userCount } from "@/lib/auth";
import { AuthShell } from "@/components/AuthShell";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (userCount() > 0) redirect("/login");
  return (
    <AuthShell title="Vítej ve studiu" subtitle="První spuštění — vytvoř účet správce. Další uživatele přidáš v Nastavení.">
      <SetupForm />
    </AuthShell>
  );
}
