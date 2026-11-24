import { publicRoute } from "@/lib/authflow";
import { destroySession, currentUser } from "@/lib/auth";
import { logActivity } from "@/lib/api";

export const POST = publicRoute(async () => {
  const u = await currentUser();
  await destroySession();
  if (u) logActivity(u.id, "auth.logout", "user", u.id);
  return { ok: true };
});
