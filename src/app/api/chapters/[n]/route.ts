import { route, body } from "@/lib/api";
import { run } from "@/lib/db";

export const PUT = route<{ n: string }>(async (req, { params }) => {
  const b = await body<{ title: string; idea: string; body: string }>(req);
  run("UPDATE chapters SET title = ?, idea = ?, body = ? WHERE n = ?", b.title, b.idea, b.body ?? "", Number(params.n));
  return { ok: true };
});
