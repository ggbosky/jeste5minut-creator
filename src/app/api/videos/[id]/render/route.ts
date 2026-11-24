import { route, body } from "@/lib/api";
import { startRender } from "@/lib/videoActions";

export const POST = route<{ id: string }>(async (req, { params, user }) => {
  const b = await body<{ notes?: string }>(req).catch(() => ({ notes: "" }));
  return startRender(Number(params.id), user, b.notes ?? "");
});
