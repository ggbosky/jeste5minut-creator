import { redirect } from "next/navigation";
import { currentUser, userCount } from "@/lib/auth";
import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (userCount() === 0) redirect("/setup");
  if (await currentUser()) redirect("/");
  return (
    <AuthShell title="Přihlášení" subtitle="Přihlas se do studia pro výrobu reels.">
      <LoginForm />
    </AuthShell>
  );
}
