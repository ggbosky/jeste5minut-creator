import { route, body, logActivity } from "@/lib/api";
import { run } from "@/lib/db";
import { suggestTopics } from "@/lib/llm";

export const POST = route(async (req, { user }) => {
  const b = await body<{ count?: number; chapter?: number | null; hook_type?: string | null; custom?: string; save?: boolean }>(req);
  const count = Math.max(1, Math.min(15, b.count ?? 5));
  const topics = await suggestTopics({ count, chapter: b.chapter, hook_type: b.hook_type, custom: b.custom });
  if (b.save) for (const t of topics) run("INSERT INTO topics(chapter, hook_type, title, angle, hook_line) VALUES(?, ?, ?, ?, ?)", t.chapter, t.hook_type, t.title, t.angle, t.hook_line);
  logActivity(user.id, "topics.generate", undefined, null, `${topics.length} témat${b.save ? " do zásobníku" : ""}`);
  return { topics };
});
