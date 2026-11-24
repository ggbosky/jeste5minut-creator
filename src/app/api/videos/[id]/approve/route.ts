import { route } from "@/lib/api";
import { approve } from "@/lib/videoActions";

export const POST = route<{ id: string }>(async (_req, { params, user }) => {
  approve(Number(params.id), user);
  return { ok: true };
});
