import { requireUser } from "@/lib/auth";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  return <SettingsClient role={user.role} me={{ id: user.id, name: user.name, email: user.email, totp: !!user.totp_enabled }} />;
}
