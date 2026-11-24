import { route } from "@/lib/api";
import { unlock } from "@/lib/videoActions";

export const POST = route<{ id: string }>(async (_req, { params, user }) => {
  unlock(Number(params.id), user);
  return { ok: true };
});
